/**
 * Format een staal-artikelnummer zoals gebruikt in price_list_lines en orders.
 * Format: {QUALITY_CODE}-{COLOR_CODE}-{DIM_SHORT}
 * Voorbeeld: AEST-13-30X50
 */
export function formatArticleNumber(
  qualityCode: string,
  colorCode: string,
  dimensionName: string
): string {
  const dimShort = dimensionName.replace(/\s+/g, "").toUpperCase();
  return `${qualityCode}-${colorCode}-${dimShort}`;
}

export const DEFAULT_PRICE_LIST_NR = "001";

/**
 * Prijslijsten zonder marge-opslag: `price_list_lines.price_cents` is hier
 * al de directe verkoopprijs (incl. BTW), niet een kostprijs × factor.
 * Voor orders/stickers van klanten op deze lijsten wordt automatisch
 * verkoopfactor ×1 ("Geen marge") gekozen.
 */
export const NO_MARGIN_PRICE_LISTS = new Set<string>(["0107", "0601"]);

/** True als de prijslijst directe verkoopprijzen bevat (factor ×1). */
export function isNoMarginPriceList(nr: string | null | undefined): boolean {
  return !!nr && NO_MARGIN_PRICE_LISTS.has(nr);
}
