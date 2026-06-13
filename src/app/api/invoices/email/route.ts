import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendFactuurEmail } from "@/lib/graph-mail-client";
import { loadInvoiceData, formatCents, formatDate, calcBtw } from "@/lib/invoice-data";

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

    const { btwCents, totalCents } = calcBtw(data.subtotalCents, invoice.btw_pct);
    const btwLabel = invoice.btw_pct === 0 ? "BTW (0% — vrijgesteld)" : `BTW (${invoice.btw_pct}%)`;
    const co = data.company;
    const days = co?.payment_days ?? 14;

    const linesHtml = data.lines.map(l => {
      const groupHeaderHtml = l.isGroupStart && l.groupLabel
        ? `<tr style="background:#f5f5f5;">
            <td colspan="5" style="padding:4px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#666;">
              ${l.tag === "Collectie" ? "Collectie" : "Bundel"}: ${l.groupLabel}
            </td>
          </tr>`
        : "";
      const indent = l.groupLabel ? "18px" : "10px";
      return `${groupHeaderHtml}
      <tr>
        <td style="padding:5px 10px 5px ${indent};border-bottom:1px solid #f0f0f0;font-size:12px;color:#222;">
          <strong>${l.label}</strong>${l.articleNumber ? `<span style="font-size:10px;color:#aaa;margin-left:6px;">${l.articleNumber}</span>` : ""}
        </td>
        <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#666;white-space:nowrap;">${l.dimensionName ?? "—"}</td>
        <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#222;text-align:center;">${l.quantity}</td>
        <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#555;text-align:right;">${formatCents(l.unitPriceCents)}</td>
        <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#222;text-align:right;font-weight:600;">${formatCents(l.priceCents)}</td>
      </tr>`;
    }).join("");

    const addrBlock = (addr: typeof data.billingAddress) =>
      addr?.street ? [addr.street, [addr.postalCode, addr.city].filter(Boolean).join(" "), addr.country].filter(Boolean).join("<br>") : "";

    const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><title>Factuur ${invoice.invoice_number}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<div style="max-width:640px;margin:32px auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Briefhoofd -->
  <div style="padding:28px 36px 20px;border-bottom:3px solid #000;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="vertical-align:top;">
          <div style="font-size:22px;font-weight:900;letter-spacing:0.15em;color:#000;">KARPI</div>
          <div style="font-size:13px;font-weight:700;letter-spacing:0.25em;color:#555;">GROUP</div>
        </td>
        <td style="vertical-align:top;text-align:right;font-size:11px;color:#666;line-height:1.6;">
          ${co?.company_name ?? "Karpi BV"}<br>
          ${[co?.address_street, [co?.address_postal, co?.address_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}<br>
          ${co?.phone ? `t ${co.phone}` : ""}${co?.phone && co?.email ? " &nbsp;|&nbsp; " : ""}${co?.email ? `e ${co.email}` : ""}
        </td>
      </tr>
    </table>
  </div>

  <!-- Brief-aanhef -->
  <div style="padding:24px 36px 0;font-size:13px;color:#333;line-height:1.7;">
    <p style="margin:0 0 6px;">Geachte heer/mevrouw,</p>
    <p style="margin:0 0 16px;">
      Bijgaand ontvangt u de factuur voor de geleverde staaltjes.<br>
      Wij verzoeken u vriendelijk het bedrag van <strong>${formatCents(totalCents)}</strong> binnen <strong>${days} dagen</strong> over te maken op:
    </p>
    <table style="border-collapse:collapse;margin-bottom:16px;font-size:12px;">
      ${co?.iban ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">IBAN</td><td style="font-weight:700;letter-spacing:0.05em;">${co.iban}</td></tr>` : ""}
      ${co?.bic ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">BIC</td><td>${co.bic}</td></tr>` : ""}
      ${co?.bank_name ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">Bank</td><td>${co.bank_name}</td></tr>` : ""}
      <tr><td style="padding:2px 16px 2px 0;color:#888;">T.n.v.</td><td>${co?.company_name ?? "Karpi BV"}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">O.v.v.</td><td><strong>${invoice.invoice_number}</strong></td></tr>
    </table>
  </div>

  <!-- FACTUUR label -->
  <div style="margin:0 36px;padding:8px 0;border-top:2px solid #000;border-bottom:1px solid #ccc;display:table;width:calc(100% - 72px);">
    <span style="font-weight:900;font-size:13px;letter-spacing:0.1em;">FACTUUR</span>
    <span style="float:right;font-size:11px;color:#666;">${invoice.invoice_number} &nbsp;·&nbsp; ${formatDate(invoice.invoice_date)}</span>
  </div>

  <!-- Adressen + factuurinfo -->
  <div style="padding:16px 36px;display:flex;gap:24px;border-bottom:1px solid #eee;">
    <div style="flex:1;font-size:11px;line-height:1.6;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#aaa;margin-bottom:3px;">Factuuradres</div>
      <strong style="font-size:12px;">${data.clientName}</strong><br>
      ${data.clientNumber ? `<span style="color:#888;font-size:10px;">Debiteur ${data.clientNumber}</span><br>` : ""}
      <span style="color:#555;">${addrBlock(data.billingAddress)}</span>
    </div>
    <div style="text-align:right;font-size:11px;line-height:1.8;color:#555;">
      ${data.clientNumber ? `<div><span style="color:#aaa;">Debiteurnr.:</span> <strong>${data.clientNumber}</strong></div>` : ""}
      <div><span style="color:#aaa;">Factuurnr.:</span> <strong>${invoice.invoice_number}</strong></div>
      <div><span style="color:#aaa;">Datum:</span> <strong>${formatDate(invoice.invoice_date)}</strong></div>
      <div><span style="color:#aaa;">Order:</span> <strong>${data.orderNumber}</strong></div>
      ${data.orderReference ? `<div><span style="color:#aaa;">Referentie:</span> <strong>${data.orderReference}</strong></div>` : ""}
    </div>
  </div>

  <!-- Regelstabel -->
  <div style="padding:0 36px;">
    <table style="width:100%;border-collapse:collapse;margin-top:4px;">
      <thead>
        <tr style="border-bottom:2px solid #000;">
          <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;">Omschrijving</th>
          <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;">Afm.</th>
          <th style="padding:6px 10px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;">Aantal</th>
          <th style="padding:6px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;">Stukprijs</th>
          <th style="padding:6px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;">Totaal excl. BTW</th>
        </tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>
  </div>

  <!-- BTW breakdown -->
  <div style="padding:12px 36px 20px;display:flex;justify-content:flex-end;">
    <table style="border-collapse:collapse;font-size:12px;min-width:260px;">
      <tr style="border-bottom:1px solid #e0e0e0;">
        <td style="padding:3px 10px;color:#888;">Grondslag</td>
        <td style="padding:3px 10px;color:#888;text-align:center;">BTW%</td>
        <td style="padding:3px 10px;color:#888;text-align:right;">BTW bedrag</td>
        <td style="padding:3px 10px;font-weight:700;text-align:right;">Te betalen</td>
      </tr>
      <tr style="border-bottom:2px solid #000;">
        <td style="padding:4px 10px;">${formatCents(data.subtotalCents)}</td>
        <td style="padding:4px 10px;text-align:center;">${invoice.btw_pct}%</td>
        <td style="padding:4px 10px;text-align:right;">${formatCents(btwCents)}</td>
        <td style="padding:4px 10px;text-align:right;font-weight:700;font-size:13px;">${formatCents(totalCents)}</td>
      </tr>
      <tr>
        <td colspan="4" style="padding:4px 10px;font-size:10px;color:#888;">Betalingscond.: ${days} dagen netto</td>
      </tr>
    </table>
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
