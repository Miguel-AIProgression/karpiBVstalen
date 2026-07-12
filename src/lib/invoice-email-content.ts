// Pure opbouw van onderwerp + HTML-body voor de factuur-mail (wayfinder-ticket 006).
// Uitgelicht uit src/app/api/invoices/email/route.ts zodat de tekstopbouw los van
// IO (Supabase, MS Graph) getest kan worden. Debet-tekst is 1-op-1 overgenomen van
// de bestaande route (incl. IBAN/betaalblok); credit krijgt een eigen, kortere tekst
// zonder betaalinstructie — er wordt niets terugbetaald door de klant, alleen verrekend.
import type { InvoiceData } from "./invoice-data";
import { formatCents } from "./invoice-data";

export interface BuildInvoiceEmailInput {
  documentType: "invoice" | "credit";
  invoiceNumber: string;
  /** Verplicht bij documentType "credit" — het nummer van de gecrediteerde factuur. */
  originalInvoiceNumber?: string | null;
  clientName: string;
  /** Debet: positief te betalen bedrag. Credit: negatief creditbedrag (toont het minteken). */
  totalCents: number;
  company: InvoiceData["company"];
  paymentDays: number;
}

export interface InvoiceEmailContent {
  subject: string;
  html: string;
}

function companyHeader(co: InvoiceData["company"]): string {
  return `
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
  </table>`;
}

function companyFooter(co: InvoiceData["company"]): string {
  return `
  <div style="padding:12px 36px;background:#f8f8f8;border-top:1px solid #e0e0e0;font-size:10px;color:#aaa;text-align:center;line-height:1.8;">
    ${co?.kvk_number ? `k.v.k. ${co.kvk_number}` : ""}
    ${co?.btw_number ? ` &nbsp;|&nbsp; btw ${co.btw_number}` : ""}
    ${co?.bank_name ? ` &nbsp;|&nbsp; ${co.bank_name}` : ""}
    ${co?.iban ? ` &nbsp;|&nbsp; IBAN ${co.iban}` : ""}
    ${co?.bic ? ` &nbsp;|&nbsp; BIC ${co.bic}` : ""}
  </div>`;
}

function closing(co: InvoiceData["company"]): string {
  return `
  <div style="padding:4px 36px 24px;font-size:13px;color:#333;line-height:1.7;border-top:1px solid #eee;">
    <p style="margin:16px 0 6px;">Met vriendelijke groet,</p>
    <p style="margin:0;font-weight:700;">${co?.company_name ?? "Karpi BV"}</p>
    ${co?.phone ? `<p style="margin:0;font-size:12px;color:#666;">${co.phone}</p>` : ""}
    ${co?.email ? `<p style="margin:0;font-size:12px;color:#666;">${co.email}</p>` : ""}
  </div>`;
}

function buildInvoiceHtml(input: BuildInvoiceEmailInput): string {
  const co = input.company;
  const days = input.paymentDays;
  const invoiceNumber = input.invoiceNumber;
  const totalCents = input.totalCents;
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><title>Factuur ${invoiceNumber}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  ${companyHeader(co)}
  <div style="padding:24px 36px 0;font-size:13px;color:#333;line-height:1.7;">
    <p style="margin:0 0 6px;">Geachte heer/mevrouw,</p>
    <p style="margin:0 0 16px;">
      Hierbij ontvangt u bijgaand factuur <strong>${invoiceNumber}</strong> voor de geleverde samples.<br>
      Wij verzoeken u vriendelijk het bedrag van <strong>${formatCents(totalCents)}</strong> binnen <strong>${days} dagen</strong> over te maken op:
    </p>
    <table style="border-collapse:collapse;margin-bottom:16px;font-size:12px;">
      ${co?.iban ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">IBAN</td><td style="font-weight:700;letter-spacing:0.05em;">${co.iban}</td></tr>` : ""}
      ${co?.bic ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">BIC</td><td>${co.bic}</td></tr>` : ""}
      ${co?.bank_name ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">Bank</td><td>${co.bank_name}</td></tr>` : ""}
      <tr><td style="padding:2px 16px 2px 0;color:#888;">T.n.v.</td><td>${co?.company_name ?? "Karpi BV"}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">O.v.v.</td><td><strong>${invoiceNumber}</strong></td></tr>
    </table>
    <p style="margin:0 0 16px;color:#666;">De volledige factuur met alle artikelregels vindt u in de bijgevoegde PDF.</p>
  </div>
  ${closing(co)}
  ${companyFooter(co)}
</div>
</body></html>`;
}

function buildCreditHtml(input: BuildInvoiceEmailInput): string {
  const co = input.company;
  const invoiceNumber = input.invoiceNumber;
  const originalInvoiceNumber = input.originalInvoiceNumber ?? "—";
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><title>Creditnota ${invoiceNumber}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  ${companyHeader(co)}
  <div style="padding:24px 36px 0;font-size:13px;color:#333;line-height:1.7;">
    <p style="margin:0 0 6px;">Geachte heer/mevrouw,</p>
    <p style="margin:0 0 16px;">
      Hierbij ontvangt u creditnota <strong>${invoiceNumber}</strong> op factuur <strong>${originalInvoiceNumber}</strong>.<br>
      Het creditbedrag van <strong>${formatCents(input.totalCents)}</strong> wordt met u verrekend.
    </p>
    <p style="margin:0 0 16px;color:#666;">De volledige creditnota vindt u in de bijgevoegde PDF.</p>
  </div>
  ${closing(co)}
  ${companyFooter(co)}
</div>
</body></html>`;
}

export function buildInvoiceEmail(input: BuildInvoiceEmailInput): InvoiceEmailContent {
  if (input.documentType === "credit") {
    return {
      subject: `Creditnota ${input.invoiceNumber} — ${input.clientName}`,
      html: buildCreditHtml(input),
    };
  }
  return {
    subject: `Factuur ${input.invoiceNumber} — ${input.clientName}`,
    html: buildInvoiceHtml(input),
  };
}
