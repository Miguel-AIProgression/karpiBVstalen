// AFAS-facturen-download in exact het formaat dat de boekhouding voor de
// "normale" (RugFlow-)facturen krijgt — voorbeeldbestand 2026-07-09.csv, door
// Nando aangeleverd 13-07. Eén rij per factuur, ;-gescheiden, UTF-8 met BOM.
//
// Het voorbeeldbestand is de RugFlow-verkoopoverzicht-export ná Excel-bewerking:
// dezelfde 15 kolommen, plus `Tegenrekening` + `BTW` (grootboek-/BTW-code voor
// de AFAS-import), en Excel' getalnotatie (trailing nullen weggekort: 891, -61,2, 0).
// Die twee laatste kolommen vulden ze handmatig — hier leiden we ze af, zodat
// de stalen-export direct importeerbaar is.
//
// Pure logica; IO (Supabase + Response) zit in src/app/api/invoices/csv/route.ts.
import { isEuForeignCountry, normalizeCountry } from "./btw";

// Nederland-aliassen — gedeelde basis voor csvLand() en afasGrootboek() zodat
// beide exact dezelfde "is dit NL?"-vraag beantwoorden. Was vóór code review
// d93af97 gedupliceerd: csvLand had deze volledige lijst, afasGrootboek deed
// alleen `normalizeCountry(country) !== "nederland"` — dat miste "NL",
// "Netherlands", "Holland" en de bewezen live-tikfout "Nederlandt", met als
// gevolg dat die landen ten onrechte als buiten-EU boekten (8019/33 i.p.v.
// 8018/34). Bewust een positieve aliaslijst (fail-safe: onbekend ≠ NL).
const NEDERLAND_ALIASES = new Set([
  "nl", "nederland", "nederlandt", "netherlands", "the netherlands", "holland",
]);

export function isNederland(country: string | null | undefined): boolean {
  return NEDERLAND_ALIASES.has(normalizeCountry(country));
}

export const AFAS_CSV_HEADER = [
  "Debiteur", "Naam1", "Naam2", "Adres", "Postcode", "Woonplaats", "Land",
  "Ordernummer", "Klant ref", "Factuurnr", "Datum", "Verv.datum",
  "Bedrag ex", "BTW bedrag", "Totaal", "Tegenrekening", "BTW",
] as const;

/**
 * Grootboek-tegenrekening + AFAS-BTW-code per tarief, afgeleid uit het
 * voorbeeldbestand: 21% (belaste omzet NL) → 8002/1; 0% (ICL/EU) → 8018/34;
 * 0% naar een land buiten de EU → 8019/33 (toegevoegd 17-07, buiten-EU-ticket).
 * **9% komt in de stalen-app niet voor** (live geverifieerd 13-07: alleen 0%
 * en 21%) en heeft geen bekende code — die laten we bewust leeg i.p.v. een
 * grootboekcode te gokken: een zichtbaar gat in de boekhouding is beter dan
 * een foute boeking.
 *
 * Buiten-EU-bepaling (alleen relevant bij 0%): het land moet bekend zijn
 * (`normalizeCountry` niet leeg), niet Nederland zelf (`isNederland`, alle
 * aliassen — incl. "NL"/"Holland"/de tikfout "Nederlandt"), én GEEN herkende
 * EU-lidstaat (`isEuForeignCountry` — excl. NL) zijn. Een leeg/onbekend land
 * telt bewust NOOIT als buiten-EU (fail-safe, zelfde veilige richting als
 * `isEuForeignCountry`/`defaultBtwPct` in btw.ts) — dan blijft het de
 * bestaande ICL-boeking 8018/34.
 */
export function afasGrootboek(
  btwPct: number,
  country: string | null | undefined
): { tegenrekening: string; btwCode: string } {
  if (btwPct === 21) return { tegenrekening: "8002", btwCode: "1" };
  if (btwPct === 0) {
    const norm = normalizeCountry(country);
    const isBuitenEu = norm !== "" && !isNederland(country) && !isEuForeignCountry(country);
    if (isBuitenEu) return { tegenrekening: "8019", btwCode: "33" };
    return { tegenrekening: "8018", btwCode: "34" };
  }
  return { tegenrekening: "", btwCode: "" };
}

/**
 * Bedragnotatie zoals in het voorbeeldbestand (Excel "Standaard"): komma als
 * decimaalteken, trailing nullen weg — 891.00 → "891", -61.20 → "-61,2",
 * 173.89 → "173,89", 0 → "0".
 */
export function afasBedrag(cents: number): string {
  return (cents / 100)
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
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

/**
 * Landkolom zoals het oude ERP/RugFlow: Nederland blijft leeg, bekende buren
 * genormaliseerd, onbekend land letterlijk uit de data (voorbeeldbestand toont
 * zowel "België" als het rauwe "DEUTSCHLAND").
 */
export function csvLand(country: string | null | undefined): string {
  const raw = (country ?? "").trim();
  if (!raw) return "";
  if (isNederland(country)) return "";
  const code = raw.toUpperCase();
  if (["BE", "BELGIE", "BELGIË", "BELGIUM"].includes(code)) return "België";
  if (["DE", "DUITSLAND", "GERMANY"].includes(code)) return "Duitsland";
  if (["FR", "FRANKRIJK", "FRANCE"].includes(code)) return "Frankrijk";
  if (["LU", "LUXEMBURG", "LUXEMBOURG"].includes(code)) return "Luxemburg";
  if (["GB", "UK"].includes(code)) return "Verenigd Koninkrijk";
  return raw;
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
  btwPct: number;
  subtotalCents: number;
  btwCents: number;
  totalCents: number;
}

function csvField(value: string): string {
  // ;-gescheiden bestand: velden met ;, " of regeleinden quoten (RFC 4180-stijl)
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildAfasCsvRow(r: AfasCsvRowInput): string {
  const { tegenrekening, btwCode } = afasGrootboek(r.btwPct, r.country);
  return [
    r.clientNumber ?? r.clientName,
    r.clientName,
    "", // Naam2 (inkoopgroep-marker) bestaat niet in de stalen-app — kolom blijft leeg voor het vaste formaat
    r.street ?? "",
    r.postalCode ?? "",
    r.city ?? "",
    csvLand(r.country),
    r.orderNumber,
    r.orderReference ?? "",
    r.invoiceNumber,
    dutchDate(r.invoiceDate),
    vervaldatum(r.invoiceDate, r.paymentDays),
    afasBedrag(r.subtotalCents),
    afasBedrag(r.btwCents),
    afasBedrag(r.totalCents),
    tegenrekening,
    btwCode,
  ].map(csvField).join(";");
}

/**
 * Sorteert op factuurnummer (localeCompare, oplopend) vóór het renderen. Een
 * creditnota heeft altijd een hoger volgnummer dan zijn debetfactuur
 * (`next_invoice_number()` = MAX+1 op dezelfde STL-YYYY-NNN-reeks), dus dit
 * zet debet consequent vóór de bijbehorende credit — ook als de aanroeper ze
 * in een andere volgorde aanlevert, en ook over een jaargrens heen
 * ("STL-2025-999" < "STL-2026-001").
 */
export function buildAfasCsv(rows: AfasCsvRowInput[]): string {
  const BOM = "﻿";
  const sorted = [...rows].sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
  return BOM + AFAS_CSV_HEADER.join(";") + "\r\n" + sorted.map(buildAfasCsvRow).join("\r\n");
}
