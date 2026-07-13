import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendFactuurEmail } from "@/lib/graph-mail-client";
import { loadInvoiceRenderData, type StoredInvoiceForRender } from "@/lib/invoice-snapshot";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { buildInvoiceEmail } from "@/lib/invoice-email-content";
import { requireRole } from "@/lib/auth/require-role";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logInvoiceEvent } from "@/lib/invoice-events";
import { invalidRecipients, parseEmailRecipients, SIMPLE_EMAIL_RE } from "@/lib/email-recipients";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const auth = await requireRole(req, ["sales", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // `to`: door de gebruiker gekozen ontvanger (feedback Nando 13-07) — leeg
    // laten = het standaardadres van de klant/order (clientEmail-keten).
    const { invoiceId, bcc, to } = await req.json() as { invoiceId: string; bcc?: string; to?: string };

    if (bcc !== undefined && bcc !== null && bcc !== "" && !SIMPLE_EMAIL_RE.test(bcc)) {
      return NextResponse.json({ error: "Ongeldig e-mailadres voor bcc" }, { status: 400 });
    }

    // Eén veld kan meerdere ontvangers bevatten (klantdata bevat komma-lijsten) —
    // splitsen en élk adres valideren; Graph krijgt de volledige lijst.
    const overrideRecipients = parseEmailRecipients(to);
    if (typeof to === "string" && to.trim() !== "" && overrideRecipients.length === 0) {
      return NextResponse.json({ error: "Ongeldig e-mailadres voor ontvanger" }, { status: 400 });
    }
    const ongeldig = invalidRecipients(overrideRecipients);
    if (ongeldig.length > 0) {
      return NextResponse.json(
        { error: `Ongeldig e-mailadres voor ontvanger: ${ongeldig.join(", ")}` },
        { status: 400 }
      );
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

    // Geen override → de klant-/order-keten (clientEmail), die óók een lijst kan zijn.
    const recipients = overrideRecipients.length > 0
      ? overrideRecipients
      : parseEmailRecipients(data.clientEmail);
    if (recipients.length === 0) {
      return NextResponse.json({ error: "Geen e-mailadres gevonden voor deze klant/order" }, { status: 400 });
    }
    const toEmail = recipients.join(", ");

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
      to: recipients,
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
      .update({ sent_at: new Date().toISOString(), sent_to: toEmail })
      .eq("id", invoiceId)
      .select("id");

    // Geschiedenis (best-effort, mag de respons niet blokkeren)
    await logInvoiceEvent(supabaseAdmin, {
      invoiceId,
      type: "gemaild",
      actorEmail: auth.user.email,
      details: { to: toEmail, ...(bcc ? { bcc } : {}) },
    });

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
