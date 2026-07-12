import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendFactuurEmail } from "@/lib/graph-mail-client";
import { loadInvoiceRenderData, type StoredInvoiceForRender } from "@/lib/invoice-snapshot";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { buildInvoiceEmail } from "@/lib/invoice-email-content";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { invoiceId } = await req.json() as { invoiceId: string };

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

    const { subject, html } = buildInvoiceEmail({
      documentType: isCredit ? "credit" : "invoice",
      invoiceNumber: invoice.invoice_number,
      originalInvoiceNumber,
      clientName: data.clientName,
      totalCents,
      company: co,
      paymentDays: days,
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
      subject,
      html,
      attachments: [
        { filename: `${invoice.invoice_number}.pdf`, content: pdfBytes, contentType: "application/pdf" },
      ],
    });

    // Bijwerken sent_at
    await supabaseAdmin
      .from("invoices")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", invoiceId);

    return NextResponse.json({ ok: true, to: toEmail });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
