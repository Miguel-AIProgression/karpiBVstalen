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

    // Bouw HTML email (inline styles — werkt in alle email clients)
    const linesHtml = data.lines.map(l => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${l.label}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;text-align:right;">${formatCents(l.priceCents)}</td>
      </tr>`).join("");

    const addressBlock = (addr: typeof data.billingAddress) =>
      addr?.street ? `${addr.street}<br>${[addr.postalCode, addr.city].filter(Boolean).join(" ")}${addr.country ? `<br>${addr.country}` : ""}` : "";

    const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><title>Factuur ${invoice.invoice_number}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Header -->
  <div style="background:#111827;padding:24px 32px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <div style="color:#9ca3af;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Factuur</div>
      <div style="color:#fff;font-size:22px;font-weight:700;">${invoice.invoice_number}</div>
      <div style="color:#9ca3af;font-size:12px;margin-top:4px;">Datum: ${formatDate(invoice.invoice_date)}</div>
    </div>
    <div style="text-align:right;">
      <div style="color:#fff;font-weight:700;font-size:14px;">${data.company?.company_name ?? "Karpi Group"}</div>
      <div style="color:#9ca3af;font-size:11px;margin-top:2px;">
        ${[data.company?.address_street, [data.company?.address_postal, data.company?.address_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
      </div>
      ${data.company?.phone ? `<div style="color:#9ca3af;font-size:11px;">${data.company.phone}</div>` : ""}
      ${data.company?.email ? `<div style="color:#9ca3af;font-size:11px;">${data.company.email}</div>` : ""}
    </div>
  </div>

  <!-- Adressen -->
  <div style="padding:24px 32px;display:flex;gap:32px;border-bottom:1px solid #e5e7eb;">
    <div style="flex:1;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:6px;">Factuuradres</div>
      <div style="font-size:13px;font-weight:700;color:#111827;">${data.clientName}</div>
      ${data.clientNumber ? `<div style="font-size:11px;color:#6b7280;">Debiteur ${data.clientNumber}</div>` : ""}
      <div style="font-size:12px;color:#374151;margin-top:4px;line-height:1.5;">${addressBlock(data.billingAddress)}</div>
    </div>
    ${data.shippingAddress?.street ? `
    <div style="flex:1;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:6px;">Afleveradres</div>
      <div style="font-size:13px;font-weight:700;color:#111827;">${data.clientName}</div>
      <div style="font-size:12px;color:#374151;margin-top:4px;line-height:1.5;">${addressBlock(data.shippingAddress)}</div>
    </div>` : ""}
  </div>

  <!-- Order referentie -->
  <div style="padding:12px 32px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
    Orderreferentie: <strong style="color:#111827;">${data.orderNumber}</strong>
    ${data.orderReference ? ` &nbsp;·&nbsp; Ref: <strong style="color:#111827;">${data.orderReference}</strong>` : ""}
  </div>

  <!-- Regels -->
  <div style="padding:24px 32px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #111827;">
          <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Omschrijving</th>
          <th style="padding:6px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Bedrag excl. BTW</th>
        </tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>
  </div>

  <!-- Totalen -->
  <div style="padding:16px 32px 24px;">
    <table style="width:100%;border-collapse:collapse;margin-left:auto;max-width:280px;">
      <tr>
        <td style="padding:4px 12px;font-size:12px;color:#6b7280;">Subtotaal excl. BTW</td>
        <td style="padding:4px 12px;font-size:12px;color:#374151;text-align:right;">${formatCents(data.subtotalCents)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px;font-size:12px;color:#6b7280;">${btwLabel}</td>
        <td style="padding:4px 12px;font-size:12px;color:#374151;text-align:right;">${formatCents(btwCents)}</td>
      </tr>
      <tr style="border-top:2px solid #111827;">
        <td style="padding:8px 12px;font-size:14px;font-weight:700;color:#111827;">Totaal incl. BTW</td>
        <td style="padding:8px 12px;font-size:14px;font-weight:700;color:#111827;text-align:right;">${formatCents(totalCents)}</td>
      </tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
    ${data.company?.company_name ?? "Karpi Group"} &nbsp;·&nbsp; ${data.company?.email ?? ""}
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
