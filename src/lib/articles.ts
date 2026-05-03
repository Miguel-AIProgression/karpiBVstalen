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
