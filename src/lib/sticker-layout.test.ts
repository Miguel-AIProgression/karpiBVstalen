import { describe, expect, it } from "vitest";
import {
  compareStickerRows,
  formatStickerDimension,
  selectCompactStickerRows,
  shouldUseCompactStickerLayout,
  type StickerLayoutRow,
} from "./sticker-layout";

describe("sticker layout rules", () => {
  it("sorts rectangular sizes first, then round sizes, then custom sizes", () => {
    const rows: StickerLayoutRow[] = [
      { id: "round-120", dimension: "120 ROND" },
      { id: "m2", dimension: "Afwijkende maten", isM2: true },
      { id: "rect-200", dimension: "200x290" },
      { id: "rect-160-organic", dimension: "160x230 organisch" },
      { id: "rect-160", dimension: "160x230" },
      { id: "round-080", dimension: "080 ROND" },
    ];

    expect([...rows].sort(compareStickerRows).map((row) => row.id)).toEqual([
      "rect-160",
      "rect-160-organic",
      "rect-200",
      "round-080",
      "round-120",
      "m2",
    ]);
  });

  it("formats dimensions like the sticker example", () => {
    expect(formatStickerDimension("160x230 organisch")).toBe("160x230 cm Organic");
    expect(formatStickerDimension("080 ROND")).toBe("080 cm rond");
    expect(formatStickerDimension("Afwijkende maten")).toBe("Afwijkende maten");
  });

  it("uses compact layout for long priced tables", () => {
    expect(shouldUseCompactStickerLayout(12, true)).toBe(true);
    expect(shouldUseCompactStickerLayout(12, false)).toBe(false);
    expect(shouldUseCompactStickerLayout(11, true)).toBe(false);
  });

  it("caps compact rows while keeping the custom m2 row", () => {
    const rows: StickerLayoutRow[] = Array.from({ length: 18 }, (_, index) => ({
      id: String(index),
      dimension: `${100 + index}x200`,
    }));
    rows.push({ id: "m2", dimension: "Afwijkende maten", isM2: true });

    const selected = selectCompactStickerRows(rows, 16);

    expect(selected).toHaveLength(16);
    expect(selected.at(-1)?.id).toBe("m2");
  });
});
