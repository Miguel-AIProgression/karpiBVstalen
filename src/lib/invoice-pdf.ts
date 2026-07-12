// Factuur-PDF generator — 1:1 herbouwd naar de exacte RugFlow-ERP-factuuropmaak
// (courier/typemachine-look, regelgebaseerde layout met absolute mm-posities,
// géén jspdf-autotable meer). Zie docs/superpowers/plans voor de layout-spec.
//
// Publiek contract: `InvoicePdfInput` en `generateInvoicePdf` blijven ONGEWIJZIGD
// t.o.v. de vorige renderer — callers (invoice-modal.tsx, api/invoices/email)
// hoeven niet te wijzigen. `buildInvoicePdfDoc` is een extra export, alléén
// bedoeld voor tests/preview (geeft de ruwe jsPDF-instantie terug, o.a. voor
// `getNumberOfPages()`).
import { jsPDF } from "jspdf";
import type { InvoiceData, InvoiceLine } from "./invoice-data";

export interface InvoicePdfInput {
  invoiceNumber: string;
  invoiceDate: string;
  btwPct: number;
  data: InvoiceData;
  /** Geboekte totalen (uit InvoiceRenderData) — NIET meer lokaal herrekend. Negatief bij een creditnota. */
  btwCents: number;
  totalCents: number;
  /** @default "invoice" */
  documentType?: "invoice" | "credit";
  /** Verplicht (inhoudelijk) bij documentType "credit". */
  originalInvoiceNumber?: string;
  creditReason?: string;
}

// ─── Layout-constanten (spec: RugFlow-renderer, A4 staand) ─────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 20;
const MARGIN_R = 20;
const LINE_H = 4;
/** mm gereserveerd onderaan de body vóór een paginabreuk (TRANSPORTEREN/TRANSPORT). */
const BODY_STOP = 40;
/** MARGIN_B=25 uit de spec: informationele ondermarge; de footer zelf staat op vaste
 * absolute y-posities (282/286/289) die al binnen die marge vallen — hier verder
 * niet los gebruikt. */
const TABLE_R = PAGE_W - MARGIN_R; // 190 — rechterrand van tabel/lijnen

const KARPI_GOLD: [number, number, number] = [194, 135, 56];

// Kolom-x-posities artikeltabel
const COL_ARTIKEL = MARGIN_L; // 20
const COL_AANTAL = 75;
const COL_EH = 80;
const COL_OMSCHR = 88;
// Omschrijving eindigt ruim vóór de rechts-uitgelijnde Prijs-kolom (x=145): een
// lange prijs als "-114.95" (7 tekens courier 9pt ≈ 13.3mm) begint rond x≈131.7,
// dus de wrap-grens op x=128 houdt altijd zichtbare witruimte ertussen.
const COL_OMSCHR_END = 128;
const COL_OMSCHR_MAXW = COL_OMSCHR_END - COL_OMSCHR; // 40
const COL_PRIJS = 145;
const COL_BEDRAG = TABLE_R; // 190
const ARTIKEL_MAXW = COL_AANTAL - COL_ARTIKEL - 5; // 50mm, marge vóór de Aantal-kolom

// Vaste (niet in company_settings aanwezige) bedrijfsgegevens + fallbacks
const FALLBACK = {
  companyName: "KARPI BV",
  address: "Tweede Broekdijk 10, 7122 LB Aalten (NL)",
  phone: "+31 (0)543-476116",
  fax: "+31 (0)543-476015",
  email: "info@karpi.nl",
  website: "www.karpi.nl",
  kvk: "09060322",
  btw: "NL008543446B01",
  bank: "ING Bank",
  rekeningnr: "689412401",
  iban: "NL37INGB0689412401",
  bic: "INGBNL2A",
};
const COMMERZBANK_LINE =
  "Commerzbank AG Bocholt | Konto 341011500 | Blz 42840005 | BIC COBADEFFXXX | IBAN DE32428400050341011500";
const TERMS_NL =
  "Al onze offertes, verkopen en leveringen geschieden uitsluitend overeenkomstig onze Algemene Leverings- en Betalingsvoorwaarden, zoals laatstelijk gedeponeerd bij de Kamer van Koophandel te Arnhem onder nummer 09060322.";
const TERMS_DE =
  "Alle unsere Angebote, Verkäufe und Lieferungen geschehen gemäss unseren Allgemeinen Lieferungs- und Zahlungsbedingungen, eingetragen beim Industrie und Handelskammer in Arnheim unter Nummer 09060322.";
const TERMS_EN =
  "All our offers, sales and deliveries are subject to our general terms and conditions of payment, which are registered at the Chamber of Commerce in Arnhem under the number 09060322.";

interface RenderState {
  cursorY: number;
  /** Lopende som van de bedragen tot dusver in de artikeltabel (voor TRANSPORTEREN/TRANSPORT). */
  runningTotal: number;
}

function formatDateDMY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function truncateToWidth(doc: jsPDF, text: string, maxWidthMm: number): string {
  if (doc.getTextWidth(text) <= maxWidthMm) return text;
  let truncated = text;
  while (truncated.length > 1 && doc.getTextWidth(`${truncated}…`) > maxWidthMm) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function buildAddressLine(co: InvoiceData["company"]): string {
  if (!co?.address_street) return FALLBACK.address;
  const cityLine = [co.address_postal, co.address_city].filter(Boolean).join(" ");
  const country = co.address_country ? ` (${co.address_country})` : "";
  return [co.address_street, cityLine].filter(Boolean).join(", ") + country;
}

// ─── Paginaheader / -footer (elke pagina) ───────────────────────────────────
function drawHeader(doc: jsPDF, data: InvoiceData, title: string) {
  const co = data.company;

  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...KARPI_GOLD);
  doc.text((co?.company_name || FALLBACK.companyName).toUpperCase(), TABLE_R, 11, { align: "right" });

  doc.setFont("courier", "normal");
  doc.setFontSize(6);
  doc.setTextColor(0, 0, 0);
  doc.text(buildAddressLine(co), TABLE_R, 15, { align: "right" });
  doc.text(`t ${co?.phone || FALLBACK.phone} | f ${FALLBACK.fax}`, TABLE_R, 19, { align: "right" });
  doc.text(`e ${co?.email || FALLBACK.email} | i ${FALLBACK.website}`, TABLE_R, 23, { align: "right" });

  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(title, MARGIN_L, 30);
}

function drawTermsColumn(doc: jsPDF, text: string, x: number, y: number, widthMm: number) {
  const lines = doc.splitTextToSize(text, widthMm) as string[];
  let cy = y;
  for (const line of lines) {
    doc.text(line, x, cy);
    cy += 1.5;
  }
}

function drawFooter(doc: jsPDF, data: InvoiceData) {
  const co = data.company;

  doc.setFont("courier", "normal");
  doc.setFontSize(6);
  doc.setTextColor(0, 0, 0);
  const line1 =
    `k.v.k. ${co?.kvk_number || FALLBACK.kvk} | btw ${co?.btw_number || FALLBACK.btw} | ` +
    `${co?.bank_name || FALLBACK.bank} | nr ${FALLBACK.rekeningnr} | ` +
    `BIC ${co?.bic || FALLBACK.bic} | IBAN ${co?.iban || FALLBACK.iban}`;
  doc.text(line1, PAGE_W / 2, 282, { align: "center" });
  doc.text(COMMERZBANK_LINE, PAGE_W / 2, 286, { align: "center" });

  doc.setFontSize(4);
  drawTermsColumn(doc, TERMS_NL, MARGIN_L, 289, 56);
  drawTermsColumn(doc, TERMS_DE, 77, 289, 56);
  drawTermsColumn(doc, TERMS_EN, 134, 289, 56);
}

function drawPageChrome(doc: jsPDF, data: InvoiceData, title: string) {
  drawHeader(doc, data, title);
  drawFooter(doc, data);
}

// ─── Klant-/infoblok (alleen pagina 1) ──────────────────────────────────────

/**
 * Landregel in het klantblok (RugFlow-conventie: uppercase). Alleen tonen als
 * het land bekend is én afwijkt van NL/Nederland — binnenlandse facturen
 * krijgen geen landregel. Pure helper, los getest.
 */
export function customerCountryLine(country: string | null | undefined): string | null {
  const trimmed = country?.trim();
  if (!trimmed) return null;
  const norm = trimmed.toLowerCase().replace(/\./g, "");
  if (norm === "nl" || norm === "nederland" || norm === "netherlands" || norm === "the netherlands") return null;
  return trimmed.toUpperCase();
}

/**
 * Baseline-y van de tabelheader op pagina 1, gegeven de eind-y van het infoblok.
 * Minimaal 90 (de vaste spec-positie); zakt mee zodra een lange "Reden"-tekst
 * het infoblok voorbij y=82 duwt, zodat die nooit door de tabel heen loopt.
 * Pure helper, los getest.
 */
export function tableHeaderStartY(infoEndY: number): number {
  return Math.max(90, infoEndY + 8);
}

function drawCustomerBlock(doc: jsPDF, data: InvoiceData) {
  doc.setFont("courier", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  let y = 55;
  doc.text(data.clientName, MARGIN_L, y);
  y += LINE_H * 2; // klantnaam-regel + één blanco regel

  const addr = data.billingAddress;
  if (addr?.street) doc.text(addr.street, MARGIN_L, y);
  y += LINE_H;

  const postalPlaats = [addr?.postalCode, addr?.city].filter(Boolean).join("  ");
  if (postalPlaats) doc.text(postalPlaats, MARGIN_L, y);
  y += LINE_H;

  const countryLine = customerCountryLine(addr?.country);
  if (countryLine) doc.text(countryLine, MARGIN_L, y);
}

/** Tekent het infoblok rechts; geeft de eind-y terug (cursor ná de laatste regel). */
function drawInfoBlock(doc: jsPDF, input: InvoicePdfInput): number {
  const { data, invoiceNumber, invoiceDate, documentType, originalInvoiceNumber, creditReason } = input;

  const rows: [string, string][] = [
    ["Uw debiteurnummer", data.clientNumber ?? ""],
    ["Factuurnummer", invoiceNumber],
    ["Factuurdatum", formatDateDMY(invoiceDate)],
  ];
  if (documentType === "credit" && originalInvoiceNumber) {
    rows.push(["Creditnota op fact.", originalInvoiceNumber]);
    if (creditReason) rows.push(["Reden", creditReason]);
  }
  const maxLabelLen = Math.max(...rows.map(([label]) => label.length));
  const infoWidth = TABLE_R - 120;

  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  let y = 55;
  for (const [label, value] of rows) {
    const prefix = `${label.padEnd(maxLabelLen)} : `;
    const wrapped = doc.splitTextToSize(`${prefix}${value}`, infoWidth) as string[];
    for (const wline of wrapped) {
      doc.text(wline, 120, y);
      y += LINE_H;
    }
  }
  return y;
}

// ─── Artikeltabel ────────────────────────────────────────────────────────
function drawTableHeader(doc: jsPDF, y: number): number {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.18);
  doc.line(MARGIN_L, y - 4, TABLE_R, y - 4);

  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Artikel", COL_ARTIKEL, y);
  doc.text("Aantal", COL_AANTAL, y, { align: "right" });
  doc.text("Eh", COL_EH, y);
  doc.text("Omschrijving", COL_OMSCHR, y);
  doc.text("Prijs", COL_PRIJS, y, { align: "right" });
  doc.text("Bedrag", COL_BEDRAG, y, { align: "right" });

  doc.line(MARGIN_L, y + 2, TABLE_R, y + 2);
  return y + 2 + LINE_H;
}

function ensureRoom(doc: jsPDF, state: RenderState, data: InvoiceData, title: string, neededMm: number = LINE_H) {
  if (state.cursorY + neededMm <= PAGE_H - BODY_STOP) return;

  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(`TRANSPORTEREN   BLAD   ${state.runningTotal.toFixed(2)}`, TABLE_R, state.cursorY, { align: "right" });

  doc.addPage();
  drawPageChrome(doc, data, title);
  state.cursorY = drawTableHeader(doc, 45);

  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(`TRANSPORT   BLAD   ${state.runningTotal.toFixed(2)}`, TABLE_R, state.cursorY, { align: "right" });
  state.cursorY += LINE_H;
}

function drawOrderHeaderRow(doc: jsPDF, state: RenderState, data: InvoiceData, title: string, label: string, value: string) {
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  // Wrap op de volledige tabelbreedte zodat een lange referentie nooit voorbij
  // de rechterrand (x=190) loopt; vervolgregels gewoon op x=20.
  const wrapped = doc.splitTextToSize(`${label.padEnd(16)}: ${value}`, TABLE_R - MARGIN_L) as string[];
  for (const wline of wrapped) {
    ensureRoom(doc, state, data, title);
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(wline, MARGIN_L, state.cursorY);
    state.cursorY += LINE_H;
  }
}

function drawOrderHeaderRows(doc: jsPDF, state: RenderState, data: InvoiceData, title: string) {
  ensureRoom(doc, state, data, title);
  state.cursorY += LINE_H; // blanco regel

  drawOrderHeaderRow(doc, state, data, title, "Ons Ordernummer", data.orderNumber);
  if (data.orderReference) {
    drawOrderHeaderRow(doc, state, data, title, "Uw Referentie", data.orderReference);
  }

  ensureRoom(doc, state, data, title);
  state.cursorY += LINE_H; // blanco regel
}

function drawArticleLine(doc: jsPDF, state: RenderState, data: InvoiceData, title: string, l: InvoiceLine) {
  const omschrijving = l.dimensionName ? `${l.label} (${l.dimensionName})` : l.label;

  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  const wrapped = doc.splitTextToSize(omschrijving, COL_OMSCHR_MAXW) as string[];

  ensureRoom(doc, state, data, title);
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  const artikel = truncateToWidth(doc, l.articleNumber ?? "—", ARTIKEL_MAXW);
  doc.text(artikel, COL_ARTIKEL, state.cursorY);
  doc.text(String(l.quantity), COL_AANTAL, state.cursorY, { align: "right" });
  doc.text("St", COL_EH, state.cursorY);
  doc.text(wrapped[0] ?? "", COL_OMSCHR, state.cursorY);
  if (l.unitPriceCents != null) {
    doc.text((l.unitPriceCents / 100).toFixed(2), COL_PRIJS, state.cursorY, { align: "right" });
  }
  doc.text((l.priceCents / 100).toFixed(2), COL_BEDRAG, state.cursorY, { align: "right" });
  state.runningTotal += l.priceCents / 100;
  state.cursorY += LINE_H;

  for (let i = 1; i < wrapped.length; i++) {
    ensureRoom(doc, state, data, title);
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(wrapped[i], COL_OMSCHR, state.cursorY);
    state.cursorY += LINE_H;
  }
}

// ─── Totaalblok (alleen laatste pagina) ─────────────────────────────────────
function drawTotalsBlock(doc: jsPDF, state: RenderState, input: InvoicePdfInput) {
  const { data, btwPct, btwCents, totalCents } = input;
  const days = data.company?.payment_days ?? 14;

  state.cursorY += 8;
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Grondsl.", MARGIN_L, state.cursorY);
  doc.text("BTW %", 100, state.cursorY, { align: "right" });
  doc.text("BTWbedrag", COL_PRIJS, state.cursorY, { align: "right" });
  doc.text("Te Betalen", COL_BEDRAG, state.cursorY, { align: "right" });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.18);
  doc.line(MARGIN_L, state.cursorY + 1.5, TABLE_R, state.cursorY + 1.5);

  state.cursorY += LINE_H + 2;
  doc.setFont("courier", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text((data.subtotalCents / 100).toFixed(2), MARGIN_L, state.cursorY);
  doc.text(`${btwPct}`, 100, state.cursorY, { align: "right" });
  doc.text((btwCents / 100).toFixed(2), COL_PRIJS, state.cursorY, { align: "right" });
  doc.text(`${(totalCents / 100).toFixed(2)} EUR`, COL_BEDRAG, state.cursorY, { align: "right" });

  state.cursorY += LINE_H + 4;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.text(`Betalingscond.: ${days} dagen netto`, MARGIN_L, state.cursorY);
}

/**
 * Bouwt het complete jsPDF-document op (test-/preview-helper). `generateInvoicePdf`
 * hieronder is het publieke, ongewijzigde contract dat callers gebruiken.
 */
export function buildInvoicePdfDoc(input: InvoicePdfInput): jsPDF {
  const { data } = input;
  const documentType = input.documentType ?? "invoice";
  const title = documentType === "credit" ? "CREDITNOTA" : "FACTUUR";

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  drawPageChrome(doc, data, title);
  drawCustomerBlock(doc, data);
  const infoEndY = drawInfoBlock(doc, input);

  // Dynamische tabel-start: een lang infoblok (bv. uitgebreide "Reden" op een
  // creditnota) duwt de tabelheader omlaag i.p.v. erdoorheen te lopen.
  const state: RenderState = { cursorY: drawTableHeader(doc, tableHeaderStartY(infoEndY)), runningTotal: 0 };

  drawOrderHeaderRows(doc, state, data, title);
  for (const l of data.lines) {
    drawArticleLine(doc, state, data, title, l);
  }

  drawTotalsBlock(doc, state, input);

  return doc;
}

export function generateInvoicePdf(input: InvoicePdfInput): Uint8Array {
  const doc = buildInvoicePdfDoc(input);
  return new Uint8Array(doc.output("arraybuffer"));
}
