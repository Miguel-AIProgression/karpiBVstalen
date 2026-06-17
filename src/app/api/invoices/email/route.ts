import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendFactuurEmail } from "@/lib/graph-mail-client";
import { loadInvoiceData, formatCents, formatDate, calcBtw } from "@/lib/invoice-data";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { invoiceId } = await req.json() as { invoiceId: string };

    // Haal factuur op
    const { data: invoice, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ error: "Factuur niet gevonden" }, { status: 404 });
    }

    // Laad factuurinhoud
    const data = await loadInvoiceData(supabaseAdmin, invoice.order_id, invoice.client_id);
    if (!data) {
      return NextResponse.json({ error: "Orderdata niet gevonden" }, { status: 404 });
    }

    const toEmail = data.clientEmail;
    if (!toEmail) {
      return NextResponse.json({ error: "Geen e-mailadres gevonden voor deze klant/order" }, { status: 400 });
    }

    const { totalCents } = calcBtw(data.subtotalCents, invoice.btw_pct);
    const co = data.company;
    const days = co?.payment_days ?? 14;

    // PDF-bijlage — opmaak overgenomen van het Karpi-ERP project.
    const pdfBytes = generateInvoicePdf({
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      btwPct: invoice.btw_pct,
      data,
    });

    // E-mailtekst: kort en tabel-gebaseerd (geen flexbox — die wordt door
    // veel mailclients niet ondersteund en brak eerder de adres/factuur-
    // blokken). De volledige factuur met artikelregels staat in de PDF.
    const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><title>Factuur ${invoice.invoice_number}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Briefhoofd -->
  <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #000;">
    <tr>
      <td style="padding:28px 36px 20px;vertical-align:top;">
        <div style="font-size:22px;font-weight:900;letter-spacing:0.15em;color:#000;">KARPI</div>
        <div style="font-size:13px;font-weight:700;letter-spacing:0.25em;color:#555;">GROUP</div>
      </td>
      <td style="padding:28px 36px 20px;vertical-align:top;text-align:right;font-size:11px;color:#666;line-height:1.6;">
        ${co?.company_name ?? "Karpi BV"}<br>
        ${[co?.address_street, [co?.address_postal, co?.address_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}<br>
        ${co?.phone ? `t ${co.phone}` : ""}${co?.phone && co?.email ? " &nbsp;|&nbsp; " : ""}${co?.email ? `e ${co.email}` : ""}
      </td>
    </tr>
  </table>

  <!-- Brief-aanhef -->
  <div style="padding:24px 36px 0;font-size:13px;color:#333;line-height:1.7;">
    <p style="margin:0 0 6px;">Geachte heer/mevrouw,</p>
    <p style="margin:0 0 16px;">
      Hierbij ontvangt u bijgaand factuur <strong>${invoice.invoice_number}</strong> voor de geleverde samples.<br>
      Wij verzoeken u vriendelijk het bedrag van <strong>${formatCents(totalCents)}</strong> binnen <strong>${days} dagen</strong> over te maken op:
    </p>
    <table style="border-collapse:collapse;margin-bottom:16px;font-size:12px;">
      ${co?.iban ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">IBAN</td><td style="font-weight:700;letter-spacing:0.05em;">${co.iban}</td></tr>` : ""}
      ${co?.bic ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">BIC</td><td>${co.bic}</td></tr>` : ""}
      ${co?.bank_name ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">Bank</td><td>${co.bank_name}</td></tr>` : ""}
      <tr><td style="padding:2px 16px 2px 0;color:#888;">T.n.v.</td><td>${co?.company_name ?? "Karpi BV"}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">O.v.v.</td><td><strong>${invoice.invoice_number}</strong></td></tr>
    </table>
    <p style="margin:0 0 16px;color:#666;">De volledige factuur met alle artikelregels vindt u in de bijgevoegde PDF.</p>
  </div>

  <!-- Afsluiting brief -->
  <div style="padding:4px 36px 24px;font-size:13px;color:#333;line-height:1.7;border-top:1px solid #eee;">
    <p style="margin:16px 0 6px;">Met vriendelijke groet,</p>
    <p style="margin:0;font-weight:700;">${co?.company_name ?? "Karpi BV"}</p>
    ${co?.phone ? `<p style="margin:0;font-size:12px;color:#666;">${co.phone}</p>` : ""}
    ${co?.email ? `<p style="margin:0;font-size:12px;color:#666;">${co.email}</p>` : ""}
  </div>

  <!-- Footer -->
  <div style="padding:12px 36px;background:#f8f8f8;border-top:1px solid #e0e0e0;font-size:10px;color:#aaa;text-align:center;line-height:1.8;">
    ${co?.kvk_number ? `k.v.k. ${co.kvk_number}` : ""}
    ${co?.btw_number ? ` &nbsp;|&nbsp; btw ${co.btw_number}` : ""}
    ${co?.bank_name ? ` &nbsp;|&nbsp; ${co.bank_name}` : ""}
    ${co?.iban ? ` &nbsp;|&nbsp; IBAN ${co.iban}` : ""}
    ${co?.bic ? ` &nbsp;|&nbsp; BIC ${co.bic}` : ""}
  </div>
</div>
</body></html>`;

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
      subject: `Factuur ${invoice.invoice_number} — ${data.clientName}`,
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
