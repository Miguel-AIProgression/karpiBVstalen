// AFAS-facturen-download in exact het formaat dat de boekhouding voor de
// "normale" (RugFlow-)facturen krijgt — voorbeeldbestand 2026-07-09.csv, door
// Nando aangeleverd 13-07. Eén werkblad, één rij per factuur.
//
// Was tot 17-07 een ;-gescheiden CSV met tekst-datums ("17-07-2026"). Excel
// parset zo'n tekst-datum bij het openen volgens de Windows-regio-instelling
// en toont 'm dan zonder voorloopnul ("17-7-2026"); bij opslaan-als-CSV komt
// dat verminkte formaat weer in AFAS terecht (boekhouder-klacht 17-07,
// bevestigd door Miguel). Fix: een écht .xlsx met echte datumcellen en een
// geforceerd celformaat dd-mm-yyyy — Excel kan dat celformaat niet meer
// "interpreteren", het staat vast in het bestand.
//
// Het voorbeeldbestand is de RugFlow-verkoopoverzicht-export ná Excel-bewerking:
// dezelfde 15 kolommen, plus `Tegenrekening` + `BTW` (grootboek-/BTW-code voor
// de AFAS-import). Die twee laatste kolommen vulden ze handmatig — hier leiden
// we ze af, zodat de stalen-export direct importeerbaar is.
//
// Pure logica; IO (Supabase + Response) zit in src/app/api/invoices/csv/route.ts.
import * as XLSX from "xlsx";
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

export const AFAS_XLSX_HEADER = [
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

export interface AfasXlsxRowInput {
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

/**
 * ISO-datumstring ("2026-07-17") → lokale kalender-Date, zonder via
 * `new Date(iso)` te parsen. `new Date(iso)` interpreteert de string als UTC
 * middernacht; zodra je daar lokaal (bv. Europe/Amsterdam, UTC+1/+2) weer
 * kalenderonderdelen van afleest of 'm als xlsx-datumcel wegschrijft, kan dat
 * één dag verschuiven. Componentsgewijs opbouwen voorkomt dat.
 */
function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Vervaldatum = factuurdatum + betaaltermijn (company_settings.payment_days), als echte Date. */
export function vervaldatum(invoiceDateIso: string, paymentDays: number): Date {
  const d = dateFromIso(invoiceDateIso);
  d.setDate(d.getDate() + paymentDays);
  return d;
}

/** Excel-celformaat voor Datum/Verv.datum — geforceerd, niet regio-afhankelijk (dit lost de CSV-corruptie op). */
const DATUM_NUMFMT = "dd-mm-yyyy";

// Kolomposities (0-based) van de twee datumkolommen, afgeleid uit AFAS_XLSX_HEADER
// zelf i.p.v. hardcoded indices — een headerwijziging kan dit dan nooit stil laten
// afwijken (code review 9ee2c1f).
const DATUM_KOLOMMEN = [
  AFAS_XLSX_HEADER.indexOf("Datum"),
  AFAS_XLSX_HEADER.indexOf("Verv.datum"),
] as const;

/**
 * Debiteur is een getal (AFAS-import verwacht een numerieke debiteurcode) —
 * valt terug op de klantnaam (tekst) als clientNumber ontbreekt. Converteert
 * alleen naar een getal als de round-trip exact klopt (`String(n) === clientNumber`):
 * `Number("00590")` is 590, en dat zou een voorloopnul stil laten verdwijnen —
 * in dat geval blijft clientNumber als tekst staan (code review 9ee2c1f).
 */
function debiteurCel(clientNumber: string | null, clientName: string): number | string {
  if (clientNumber == null || clientNumber === "") return clientName;
  const trimmed = clientNumber.trim();
  const n = Number(trimmed);
  return Number.isFinite(n) && String(n) === trimmed ? n : clientNumber;
}

function buildRow(r: AfasXlsxRowInput): (string | number | Date)[] {
  const { tegenrekening, btwCode } = afasGrootboek(r.btwPct, r.country);
  return [
    debiteurCel(r.clientNumber, r.clientName),
    r.clientName,
    "", // Naam2 (inkoopgroep-marker) bestaat niet in de stalen-app — kolom blijft leeg voor het vaste formaat
    r.street ?? "",
    r.postalCode ?? "",
    r.city ?? "",
    csvLand(r.country),
    r.orderNumber,
    r.orderReference ?? "",
    r.invoiceNumber,
    dateFromIso(r.invoiceDate),
    vervaldatum(r.invoiceDate, r.paymentDays),
    r.subtotalCents / 100,
    r.btwCents / 100,
    r.totalCents / 100,
    tegenrekening,
    btwCode,
  ];
}

/**
 * Sorteert op factuurnummer (localeCompare, oplopend) vóór het renderen. Een
 * creditnota heeft altijd een hoger volgnummer dan zijn debetfactuur
 * (`next_invoice_number()` = MAX+1 op dezelfde STL-YYYY-NNN-reeks), dus dit
 * zet debet consequent vóór de bijbehorende credit — ook als de aanroeper ze
 * in een andere volgorde aanlevert, en ook over een jaargrens heen
 * ("STL-2025-999" < "STL-2026-001").
 */
export function buildAfasXlsx(rows: AfasXlsxRowInput[]): Buffer {
  const sorted = [...rows].sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
  const aoa: (string | number | Date)[][] = [[...AFAS_XLSX_HEADER], ...sorted.map(buildRow)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  for (let r = 1; r <= sorted.length; r++) {
    for (const c of DATUM_KOLOMMEN) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.z = DATUM_NUMFMT;
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Facturen");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}
