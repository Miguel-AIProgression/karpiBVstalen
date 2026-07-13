// AFAS-facturen-download in het kolomformaat van de "normale facturen"
// (RugFlow-ERP verkoopoverzicht-export, frontend/src/modules/facturatie/lib/
// verkoopoverzicht-xls.ts) — gevraagd door Nando 13-07: Naam/Adres/Postcode/
// Plaats/Land/Ordernummer/Klantreferentie/Vervaldatum erbij, in dezelfde
// volgorde; Omschrijving en BTW-code eruit. Eén rij per factuur.
// Pure logica; de IO (Supabase + Response) zit in src/app/api/invoices/csv/route.ts.

export const AFAS_CSV_HEADER = [
  "Debiteur", "Naam1", "Naam2", "Adres", "Postcode", "Woonplaats", "Land",
  "Ordernummer", "Klant ref", "Factuurnr", "Datum", "Verv.datum",
  "Bedrag ex", "BTW bedrag", "Totaal",
] as const;

export function dutchCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function dutchDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

/** Vervaldatum = factuurdatum + betaaltermijn (company_settings.payment_days). */
export function vervaldatum(invoiceDateIso: string, paymentDays: number): string {
  const d = new Date(invoiceDateIso);
  d.setDate(d.getDate() + paymentDays);
  return dutchDate(d.toISOString().slice(0, 10));
}

/** Zoals het oude ERP-/RugFlow-formaat: Nederland blijft leeg, andere landen as-is. */
export function csvLand(country: string | null | undefined): string {
  const c = (country ?? "").trim();
  if (!c || /^(nl|nederland|the netherlands|netherlands|holland)$/i.test(c)) return "";
  return c;
}

export interface AfasCsvRowInput {
  clientNumber: string | null;
  clientName: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  orderNumber: string;
  orderReference: string | null;
  invoiceNumber: string;
  invoiceDate: string; // ISO
  paymentDays: number;
  subtotalCents: number;
  btwCents: number;
  totalCents: number;
}

function csvField(value: string): string {
  // ;-gescheiden bestand: velden met ;, " of regeleinden quoten (RFC 4180-stijl)
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildAfasCsvRow(r: AfasCsvRowInput): string {
  return [
    r.clientNumber ?? r.clientName,
    r.clientName,
    "", // Naam2 (inkoopgroep) bestaat niet in de stalen-app — kolom blijft voor het vaste formaat
    r.street ?? "",
    r.postalCode ?? "",
    r.city ?? "",
    csvLand(r.country),
    r.orderNumber,
    r.orderReference ?? "",
    r.invoiceNumber,
    dutchDate(r.invoiceDate),
    vervaldatum(r.invoiceDate, r.paymentDays),
    dutchCents(r.subtotalCents),
    dutchCents(r.btwCents),
    dutchCents(r.totalCents),
  ].map(csvField).join(";");
}

export function buildAfasCsv(rows: AfasCsvRowInput[]): string {
  const BOM = "﻿";
  return BOM + AFAS_CSV_HEADER.join(";") + "\r\n" + rows.map(buildAfasCsvRow).join("\r\n");
}
