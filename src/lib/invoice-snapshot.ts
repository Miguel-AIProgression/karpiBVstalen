// Snapshot-datalaag voor facturen (wayfinder-ticket 006, datamodel uit ticket 002).
// Doel: eenmaal geboekte factuurregels (`invoice_lines`) zijn onveranderlijk, ook
// als de onderliggende order_lines/collecties/bundels later muteren. Deze module
// bevat de PURE mapping-logica; IO (Supabase-calls) blijft dun en ongetest.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadInvoiceData, calcBtw, type InvoiceData, type InvoiceLine } from "./invoice-data";

export interface InvoiceLineInsert {
  invoice_id: string;
  order_line_id: string | null;
  line_tag: InvoiceLine["tag"];
  description: string;
  article_number: string | null;
  dimension_name: string | null;
  quantity: number;
  unit_price_cents: number | null;
  amount_cents: number;
  position: number;
}

/** Kolommen die we uit `invoices` nodig hebben om te renderen (zowel debet als credit). */
export interface StoredInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  btw_pct: number;
  subtotal_cents: number;
  btw_cents: number;
  total_cents: number;
}

/** Een opgeslagen `invoices`-rij mét de velden die `loadInvoiceRenderData` nodig heeft om de live-fallback te draaien. */
export interface StoredInvoiceForRender extends StoredInvoiceRow {
  order_id: string;
  client_id: string;
}

export interface StoredInvoiceLineRow {
  id: string;
  invoice_id: string;
  order_line_id: string | null;
  /** DB-kolom is `text` zonder CHECK — bij onherkende waarde valt `snapshotToInvoiceData` terug op "Staal". */
  line_tag: string;
  description: string;
  article_number: string | null;
  dimension_name: string | null;
  quantity: number;
  unit_price_cents: number | null;
  amount_cents: number;
  position: number;
}

export interface InvoiceRenderData {
  data: InvoiceData;
  btwCents: number;
  totalCents: number;
  /** true = regels komen uit de onveranderlijke snapshot; false = live-fallback (nog geen snapshot). */
  isSnapshot: boolean;
}

/**
 * Pure mapping: InvoiceData.lines → invoice_lines-insertrijen (1-based positie).
 * Schrijft de onbewerkte velden weg — géén prefix-vouwen meer: `line_tag` en
 * `dimension_name` hebben sinds mig 20260712_credit_invoices.sql hun eigen kolom,
 * dus `description`/`article_number` blijven het originele label. Dit is precies
 * wat `snapshotToInvoiceData` straks weer terugbouwt tot een volwaardige
 * InvoiceLine: de PDF-renderer moet bij snapshot-rendering exact dezelfde
 * regel-array zien als bij live-rendering (zie invoice-snapshot.test.ts).
 */
export function buildInvoiceLineRows(invoiceId: string, data: InvoiceData): InvoiceLineInsert[] {
  return data.lines.map((line, i) => ({
    invoice_id: invoiceId,
    order_line_id: line.tag === "Staal" ? line.orderLineId : null,
    line_tag: line.tag,
    description: line.label,
    article_number: line.articleNumber,
    dimension_name: line.dimensionName,
    quantity: line.quantity,
    unit_price_cents: line.unitPriceCents,
    amount_cents: line.priceCents,
    position: i + 1,
  }));
}

/**
 * Pure functie: bouwt een InvoiceData op uit de onveranderlijke snapshot (regels +
 * geboekte totalen), aangevuld met live klant-/adres-/company-/e-mailvelden (die
 * geen onderdeel zijn van de snapshot). De snapshot-regels winnen altijd van
 * `liveData.lines` — dat is precies het punt van de snapshot.
 *
 * `colorCode`/`groupLabel`/`isGroupStart` hebben geen kolom in `invoice_lines`: ze
 * zijn niet nodig voor identieke PDF-rendering — `groupLabel`/`isGroupStart` staan
 * in de live data (zie `loadInvoiceData`) ook altijd op null/false, en `colorCode`
 * wordt door `generateInvoicePdf` nergens gelezen — dus die komen hier vast op
 * null/false terug.
 */
export function snapshotToInvoiceData(
  storedInvoice: StoredInvoiceRow,
  snapshotLines: StoredInvoiceLineRow[],
  liveData: InvoiceData
): InvoiceData {
  const lines: InvoiceLine[] = [...snapshotLines]
    .sort((a, b) => a.position - b.position)
    .map(row => ({
      label: row.description,
      articleNumber: row.article_number,
      colorCode: null,
      groupLabel: null,
      isGroupStart: false,
      tag: isBillingTag(row.line_tag) ? row.line_tag : "Staal",
      unitPriceCents: row.unit_price_cents ?? 0,
      priceCents: row.amount_cents,
      quantity: row.quantity,
      dimensionName: row.dimension_name,
      orderLineId: row.order_line_id,
    }));

  return {
    ...liveData,
    lines,
    subtotalCents: storedInvoice.subtotal_cents,
  };
}

function isBillingTag(value: string): value is InvoiceLine["tag"] {
  return value === "Collectie" || value === "Bundel" || value === "Staal";
}

/**
 * Dunne IO-laag: haalt de snapshot op; bestaat die → snapshot-pad (btw/totaal
 * NIET herrekend, komen uit de geboekte invoice-rij). Bestaat die nog niet
 * (oudere factuur van vóór deze migratie) → live-fallback via loadInvoiceData
 * + calcBtw. Dit is dé seam voor PDF, mail en modal-preview.
 */
export async function loadInvoiceRenderData(
  supabase: SupabaseClient,
  storedInvoice: StoredInvoiceForRender
): Promise<InvoiceRenderData | null> {
  const { data: snapshotLines } = await supabase
    .from("invoice_lines" as any)
    .select("id, invoice_id, order_line_id, line_tag, description, article_number, dimension_name, quantity, unit_price_cents, amount_cents, position")
    .eq("invoice_id", storedInvoice.id)
    .order("position");

  const liveData = await loadInvoiceData(supabase, storedInvoice.order_id, storedInvoice.client_id);
  if (!liveData) return null;

  if (snapshotLines && snapshotLines.length > 0) {
    const data = snapshotToInvoiceData(storedInvoice, snapshotLines as unknown as StoredInvoiceLineRow[], liveData);
    return { data, btwCents: storedInvoice.btw_cents, totalCents: storedInvoice.total_cents, isSnapshot: true };
  }

  const { btwCents, totalCents } = calcBtw(liveData.subtotalCents, storedInvoice.btw_pct);
  return { data: liveData, btwCents, totalCents, isSnapshot: false };
}
