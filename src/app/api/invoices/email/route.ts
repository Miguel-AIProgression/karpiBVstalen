import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendFactuurEmail } from "@/lib/graph-mail-client";
import { loadInvoiceRenderData, type StoredInvoiceForRender } from "@/lib/invoice-snapshot";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { buildInvoiceEmail } from "@/lib/invoice-email-content";
import { requireRole } from "@/lib/auth/require-role";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Simpele e-mailvorm-check — geen volledige RFC 5322-validatie, alleen een sanity-check vóór we 'm naar Graph sturen. */
const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const auth = await requireRole(req, ["sales", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { invoiceId, bcc } = await req.json() as { invoiceId: string; bcc?: string };

    if (bcc !== undefined && bcc !== null && bcc !== "" && !SIMPLE_EMAIL_RE.test(bcc)) {
      return NextResponse.json({ error: "Ongeldig e-mailadres voor bcc" }, { status: 400 });
    }

    // Haal factuur op (debet of creditnota — credited_invoice_id onderscheidt ze)
    const { data: invoice, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ error: "Factuur niet gevonden" }, { status: 404 });
    }

    const isCredit = Boolean(invoice.credited_invoice_id);

    // Creditnota → ook het nummer van de gecrediteerde (originele) factuur nodig voor PDF + mailtekst
    let originalInvoiceNumber: string | undefined;
    if (isCredit) {
      const { data: original } = await supabaseAdmin
        .from("invoices")
        .select("invoice_number")
        .eq("id", invoice.credited_invoice_id)
        .single();
      originalInvoiceNumber = original?.invoice_number;
    }

    // Snapshot-first render-data (PDF, mail én modal-preview delen deze seam)
    const renderData = await loadInvoiceRenderData(supabaseAdmin, invoice as StoredInvoiceForRender);
    if (!renderData) {
      return NextResponse.json({ error: "Orderdata niet gevonden" }, { status: 404 });
    }
    const { data, btwCents, totalCents } = renderData;

    const toEmail = data.clientEmail;
    if (!toEmail) {
      return NextResponse.json({ error: "Geen e-mailadres gevonden voor deze klant/order" }, { status: 400 });
    }

    const co = data.company;
    const days = co?.payment_days ?? 14;

    // PDF-bijlage — opmaak overgenomen van het Karpi-ERP project.
    const pdfBytes = generateInvoicePdf({
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      btwPct: invoice.btw_pct,
      data,
      btwCents,
      totalCents,
      documentType: isCredit ? "credit" : "invoice",
      originalInvoiceNumber,
      creditReason: invoice.credit_reason ?? undefined,
    });

    // Taal (nl/de/en) volgt het land van het factuuradres — zelfde bron als de
    // PDF hierboven (generateInvoicePdf leidt 'm intern al af uit data.billingAddress).
    const { subject, html } = buildInvoiceEmail({
      documentType: isCredit ? "credit" : "invoice",
      invoiceNumber: invoice.invoice_number,
      originalInvoiceNumber,
      clientName: data.clientName,
      totalCents,
      company: co,
      paymentDays: days,
      country: data.billingAddress?.country,
    });

    // Verstuur via Microsoft Graph (Azure / Microsoft 365)
    const tenantId = process.env.MS_GRAPH_TENANT_ID;
    const clientId = process.env.MS_GRAPH_CLIENT_ID;
    const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
    const fromEmail = process.env.FACTUUR_FROM_EMAIL ?? "facturen@karpigroup.nl";

    if (!tenantId || !clientId || !clientSecret) {
      return NextResponse.json({ error: "MS Graph credentials niet geconfigureerd" }, { status: 500 });
    }

    await sendFactuurEmail({
      tenantId,
      clientId,
      clientSecret,
      from: fromEmail,
      to: toEmail,
      replyTo: process.env.FACTUUR_REPLY_TO ?? fromEmail,
      bcc: bcc || undefined,
      subject,
      html,
      attachments: [
        { filename: `${invoice.invoice_number}.pdf`, content: pdfBytes, contentType: "application/pdf" },
      ],
    });

    // Bijwerken sent_at — de mail is op dit punt al de deur uit. Als de factuur
    // tussen het versturen en hier verwijderd is (race met DELETE /api/invoices/[id]),
    // matcht deze update 0 rijen; dat mag NIET als fout terugkomen (de mail is al
    // verstuurd) maar moet wel zichtbaar zijn i.p.v. stil verdwijnen.
    // ponytail: volledige serialisatie (FOR UPDATE op de factuurrij voor de hele
    // Graph-call) is bewust overgeslagen — het venster is klein; dit maakt het
    // zichtbaar in plaats van het te voorkomen.
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("invoices")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .select("id");

    if (updateErr) {
      console.error(`sent_at bijwerken mislukt voor factuur ${invoiceId} (mail is al verstuurd):`, updateErr);
    } else if (!updated || updated.length === 0) {
      console.error(
        `Factuur ${invoiceId} is tijdens het verzenden verwijderd — sent_at niet geregistreerd (mail is al verstuurd).`
      );
      return NextResponse.json({
        ok: true,
        to: toEmail,
        warning: "Factuur is tijdens het verzenden verwijderd; sent_at niet geregistreerd.",
      });
    }

    return NextResponse.json({ ok: true, to: toEmail });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
