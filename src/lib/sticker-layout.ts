export type StickerLayoutRow = {
  id: string;
  dimension: string;
  width_cm?: number | null;
  height_cm?: number | null;
  isM2?: boolean;
};

export const COMPACT_STICKER_ROW_THRESHOLD = 12;
export const COMPACT_STICKER_MAX_ROWS = 16;

type ParsedDimension =
  | { kind: "rect"; width: number; height: number; organic: boolean }
  | { kind: "round"; diameter: number }
  | { kind: "custom" }
  | { kind: "unknown" };

function normalizeDimension(dimension: string): string {
  return dimension.trim().replace(/\s+/g, " ");
}

function isCustomDimension(dimension: string): boolean {
  return /^afwijkende maten$/i.test(normalizeDimension(dimension));
}

export function isOrganicStickerDimension(dimension: string): boolean {
  return /\b(organic|organisch)\b/i.test(dimension);
}

function parseDimension(dimension: string): ParsedDimension {
  const normalized = normalizeDimension(dimension);
  if (!normalized) return { kind: "unknown" };
  if (isCustomDimension(normalized)) return { kind: "custom" };

  const rect = normalized.match(/(\d{2,4})\s*x\s*(\d{2,4})/i);
  if (rect) {
    return {
      kind: "rect",
      width: Number(rect[1]),
      height: Number(rect[2]),
      organic: isOrganicStickerDimension(normalized),
    };
  }

  const round = normalized.match(/(\d{2,4})\s*(?:cm)?\s*rond/i);
  if (round) {
    return { kind: "round", diameter: Number(round[1]) };
  }

  return { kind: "unknown" };
}

function rowSortParts(row: StickerLayoutRow): ParsedDimension {
  const parsed = parseDimension(row.dimension);
  if (parsed.kind !== "unknown") return parsed;

  if (row.width_cm && row.height_cm) {
    return {
      kind: "rect",
      width: row.width_cm,
      height: row.height_cm,
      organic: isOrganicStickerDimension(row.dimension),
    };
  }

  return parsed;
}

export function compareStickerRows(a: StickerLayoutRow, b: StickerLayoutRow): number {
  const ad = rowSortParts(a);
  const bd = rowSortParts(b);

  if (ad.kind === "custom" || a.isM2) return bd.kind === "custom" || b.isM2 ? 0 : 1;
  if (bd.kind === "custom" || b.isM2) return -1;

  if (ad.kind === "round" && bd.kind !== "round") return 1;
  if (bd.kind === "round" && ad.kind !== "round") return -1;

  if (ad.kind === "rect" && bd.kind === "rect") {
    const areaDiff = ad.width * ad.height - bd.width * bd.height;
    if (areaDiff !== 0) return areaDiff;
    if (ad.organic !== bd.organic) return ad.organic ? 1 : -1;
  }

  if (ad.kind === "round" && bd.kind === "round") {
    return ad.diameter - bd.diameter;
  }

  return normalizeDimension(a.dimension).localeCompare(normalizeDimension(b.dimension), "nl");
}

export function formatStickerDimension(dimension: string): string {
  const normalized = normalizeDimension(dimension);
  if (!normalized) return "";
  if (isCustomDimension(normalized)) return "Afwijkende maten";

  const rect = normalized.match(/(\d{2,4})\s*x\s*(\d{2,4})/i);
  if (rect) {
    const organic = isOrganicStickerDimension(normalized);
    return `${rect[1]}x${rect[2]} cm${organic ? " Organic" : ""}`;
  }

  const round = normalized.match(/(\d{2,4})\s*(?:cm)?\s*rond/i);
  if (round) return `${round[1]} cm rond`;

  if (/\bcm\b/i.test(normalized)) return normalized;
  return `${normalized} cm`;
}

export function shouldUseCompactStickerLayout(rowCount: number, showPrices: boolean): boolean {
  return showPrices && rowCount >= COMPACT_STICKER_ROW_THRESHOLD;
}

export function selectCompactStickerRows<T extends StickerLayoutRow>(
  rows: T[],
  maxRows = COMPACT_STICKER_MAX_ROWS,
): T[] {
  if (rows.length <= maxRows) return rows;

  const mandatoryRows = rows.filter((row) => row.isM2 || isCustomDimension(row.dimension));
  const regularRows = rows.filter((row) => !mandatoryRows.includes(row));
  const regularLimit = Math.max(0, maxRows - mandatoryRows.length);

  return [...regularRows.slice(0, regularLimit), ...mandatoryRows].slice(0, maxRows);
}
