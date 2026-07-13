// Pure opbouw van onderwerp + HTML-body voor de factuur-mail (wayfinder-ticket 006).
// Uitgelicht uit src/app/api/invoices/email/route.ts zodat de tekstopbouw los van
// IO (Supabase, MS Graph) getest kan worden. Debet-tekst is 1-op-1 overgenomen van
// de bestaande route (incl. IBAN/betaalblok); credit krijgt een eigen, kortere tekst
// zonder betaalinstructie — er wordt niets terugbetaald door de klant, alleen verrekend.
//
// Meertalig (2026-07-13): taal volgt het land van het factuuradres, dezelfde seam
// als de PDF (invoice-pdf.ts → bepaalFactuurTaal). Onderwerp-prefixen en aanhef/
// afsluiting zijn 1-op-1 overgenomen uit RugFlow-ERP (andere repo:
// supabase/functions/_shared/facturatie/factuur-mail-teksten.ts). De rest van de
// body (betaalblok-labels, betaaltermijn-zin, verrekentekst) is stalen-app-eigen
// bewoording — RugFlow's mailtekst is korter en heeft geen IBAN-tabel in de mail
// zelf (de PDF draagt dat daar). "z.H.v." als Duitse T.n.v.-labelvertaling is
// letterlijk uit de opdracht overgenomen.
import type { InvoiceData } from "./invoice-data";
import { formatCents } from "./invoice-data";
import { bepaalFactuurTaal, type FactuurTaal } from "./klant-taal";

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
  /** Land van het factuuradres — bepaalt de taal (bepaalFactuurTaal). Onbekend/leeg → nl. */
  country?: string | null;
}

export interface InvoiceEmailContent {
  subject: string;
  html: string;
}

interface MailTeksten {
  htmlLang: string;
  subjectPrefix: string;
  subjectPrefixCredit: string;
  greeting: string;
  closing: string;
  invoiceIntro: (nr: string) => string;
  payInstruction: (amount: string, days: number) => string;
  labelIban: string;
  labelBic: string;
  labelBank: string;
  labelAccountHolder: string;
  labelReference: string;
  fullPdfNoteInvoice: string;
  creditIntro: (nr: string, originalNr: string) => string;
  settlementText: (amount: string) => string;
  fullPdfNoteCredit: string;
}

const MAIL_TEKSTEN: Record<FactuurTaal, MailTeksten> = {
  nl: {
    htmlLang: "nl",
    subjectPrefix: "Factuur",
    subjectPrefixCredit: "Creditnota",
    greeting: "Geachte heer/mevrouw,",
    closing: "Met vriendelijke groet,",
    invoiceIntro: (nr) => `Hierbij ontvangt u bijgaand factuur <strong>${nr}</strong> voor de geleverde samples.`,
    payInstruction: (amount, days) =>
      `Wij verzoeken u vriendelijk het bedrag van <strong>${amount}</strong> binnen <strong>${days} dagen</strong> over te maken op:`,
    labelIban: "IBAN", labelBic: "BIC", labelBank: "Bank",
    labelAccountHolder: "T.n.v.", labelReference: "O.v.v.",
    fullPdfNoteInvoice: "De volledige factuur met alle artikelregels vindt u in de bijgevoegde PDF.",
    creditIntro: (nr, originalNr) =>
      `Hierbij ontvangt u creditnota <strong>${nr}</strong> op factuur <strong>${originalNr}</strong>.`,
    settlementText: (amount) => `Het creditbedrag van <strong>${amount}</strong> wordt met u verrekend.`,
    fullPdfNoteCredit: "De volledige creditnota vindt u in de bijgevoegde PDF.",
  },
  de: {
    htmlLang: "de",
    subjectPrefix: "Rechnung",
    subjectPrefixCredit: "Gutschrift",
    greeting: "Sehr geehrte Damen und Herren,",
    closing: "Mit freundlichen Grüßen,",
    invoiceIntro: (nr) => `anbei erhalten Sie die Rechnung <strong>${nr}</strong> für die gelieferten Muster.`,
    payInstruction: (amount, days) =>
      `Wir bitten Sie freundlich, den Betrag von <strong>${amount}</strong> innerhalb von <strong>${days} Tagen</strong> auf folgendes Konto zu überweisen:`,
    labelIban: "IBAN", labelBic: "BIC", labelBank: "Bank",
    labelAccountHolder: "z.H.v.", labelReference: "Verwendungszweck",
    fullPdfNoteInvoice: "Die vollständige Rechnung mit allen Artikelpositionen finden Sie in der beigefügten PDF.",
    creditIntro: (nr, originalNr) =>
      `anbei erhalten Sie die Gutschrift <strong>${nr}</strong> zur Rechnung <strong>${originalNr}</strong>.`,
    settlementText: (amount) => `Der Gutschriftbetrag von <strong>${amount}</strong> wird mit Ihnen verrechnet.`,
    fullPdfNoteCredit: "Die vollständige Gutschrift finden Sie in der beigefügten PDF.",
  },
  en: {
    htmlLang: "en",
    subjectPrefix: "Invoice",
    subjectPrefixCredit: "Credit note",
    greeting: "Dear Sir or Madam,",
    closing: "Kind regards,",
    invoiceIntro: (nr) => `please find attached invoice <strong>${nr}</strong> for the samples delivered.`,
    payInstruction: (amount, days) =>
      `We kindly ask you to transfer the amount of <strong>${amount}</strong> within <strong>${days} days</strong> to:`,
    labelIban: "IBAN", labelBic: "BIC", labelBank: "Bank",
    labelAccountHolder: "Account holder", labelReference: "Payment reference",
    fullPdfNoteInvoice: "The complete invoice with all line items can be found in the attached PDF.",
    creditIntro: (nr, originalNr) =>
      `please find attached credit note <strong>${nr}</strong> for invoice <strong>${originalNr}</strong>.`,
    settlementText: (amount) => `The credit amount of <strong>${amount}</strong> will be settled with you.`,
    fullPdfNoteCredit: "The complete credit note can be found in the attached PDF.",
  },
};

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

function closing(co: InvoiceData["company"], m: MailTeksten): string {
  return `
  <div style="padding:4px 36px 24px;font-size:13px;color:#333;line-height:1.7;border-top:1px solid #eee;">
    <p style="margin:16px 0 6px;">${m.closing}</p>
    <p style="margin:0;font-weight:700;">${co?.company_name ?? "Karpi BV"}</p>
    ${co?.phone ? `<p style="margin:0;font-size:12px;color:#666;">${co.phone}</p>` : ""}
    ${co?.email ? `<p style="margin:0;font-size:12px;color:#666;">${co.email}</p>` : ""}
  </div>`;
}

function buildInvoiceHtml(input: BuildInvoiceEmailInput, m: MailTeksten): string {
  const co = input.company;
  const days = input.paymentDays;
  const invoiceNumber = input.invoiceNumber;
  const totalCents = input.totalCents;
  return `<!DOCTYPE html>
<html lang="${m.htmlLang}">
<head><meta charset="UTF-8"><title>${m.subjectPrefix} ${invoiceNumber}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  ${companyHeader(co)}
  <div style="padding:24px 36px 0;font-size:13px;color:#333;line-height:1.7;">
    <p style="margin:0 0 6px;">${m.greeting}</p>
    <p style="margin:0 0 16px;">
      ${m.invoiceIntro(invoiceNumber)}<br>
      ${m.payInstruction(formatCents(totalCents), days)}
    </p>
    <table style="border-collapse:collapse;margin-bottom:16px;font-size:12px;">
      ${co?.iban ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">${m.labelIban}</td><td style="font-weight:700;letter-spacing:0.05em;">${co.iban}</td></tr>` : ""}
      ${co?.bic ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">${m.labelBic}</td><td>${co.bic}</td></tr>` : ""}
      ${co?.bank_name ? `<tr><td style="padding:2px 16px 2px 0;color:#888;">${m.labelBank}</td><td>${co.bank_name}</td></tr>` : ""}
      <tr><td style="padding:2px 16px 2px 0;color:#888;">${m.labelAccountHolder}</td><td>${co?.company_name ?? "Karpi BV"}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">${m.labelReference}</td><td><strong>${invoiceNumber}</strong></td></tr>
    </table>
    <p style="margin:0 0 16px;color:#666;">${m.fullPdfNoteInvoice}</p>
  </div>
  ${closing(co, m)}
  ${companyFooter(co)}
</div>
</body></html>`;
}

function buildCreditHtml(input: BuildInvoiceEmailInput, m: MailTeksten): string {
  const co = input.company;
  const invoiceNumber = input.invoiceNumber;
  const originalInvoiceNumber = input.originalInvoiceNumber ?? "—";
  return `<!DOCTYPE html>
<html lang="${m.htmlLang}">
<head><meta charset="UTF-8"><title>${m.subjectPrefixCredit} ${invoiceNumber}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  ${companyHeader(co)}
  <div style="padding:24px 36px 0;font-size:13px;color:#333;line-height:1.7;">
    <p style="margin:0 0 6px;">${m.greeting}</p>
    <p style="margin:0 0 16px;">
      ${m.creditIntro(invoiceNumber, originalInvoiceNumber)}<br>
      ${m.settlementText(formatCents(input.totalCents))}
    </p>
    <p style="margin:0 0 16px;color:#666;">${m.fullPdfNoteCredit}</p>
  </div>
  ${closing(co, m)}
  ${companyFooter(co)}
</div>
</body></html>`;
}

export function buildInvoiceEmail(input: BuildInvoiceEmailInput): InvoiceEmailContent {
  const taal = bepaalFactuurTaal(input.country);
  const m = MAIL_TEKSTEN[taal];
  if (input.documentType === "credit") {
    return {
      subject: `${m.subjectPrefixCredit} ${input.invoiceNumber} — ${input.clientName}`,
      html: buildCreditHtml(input, m),
    };
  }
  return {
    subject: `${m.subjectPrefix} ${input.invoiceNumber} — ${input.clientName}`,
    html: buildInvoiceHtml(input, m),
  };
}
