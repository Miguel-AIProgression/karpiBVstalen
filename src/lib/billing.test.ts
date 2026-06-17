import { describe, it, expect } from "vitest";
import { buildBillingRows, billingSubtotalCents, type BillingLineInput } from "./billing";

function staal(over: Partial<BillingLineInput>): BillingLineInput {
  return {
    lineId: Math.random().toString(36).slice(2),
    bundleId: null,
    bundleName: null,
    collectionId: null,
    collectionName: null,
    priceCents: null,
    quantity: 1,
    qualityName: "GENTLE",
    colorCode: "13",
    colorName: "Antraciet",
    articleNumber: "GENT-13-20X20",
    dimensionName: "20x20",
    ...over,
  };
}

describe("buildBillingRows — collectie wordt één regel, prijs één keer", () => {
  it("telt een maatwerkcollectie van N staaltjes met €549 op elke regel als één keer €549", () => {
    const lines = ["13", "18", "21", "26", "33"].map((c, i) =>
      staal({
        lineId: `l${i}`,
        collectionId: "coll-1",
        collectionName: "Maatwerk",
        colorCode: c,
        priceCents: 54900, // gedupliceerd op elke regel
      })
    );

    const rows = buildBillingRows(lines);

    expect(rows).toHaveLength(1);
    expect(rows[0].tag).toBe("Collectie");
    expect(rows[0].label).toBe("Maatwerk");
    expect(rows[0].priceCents).toBe(54900);
    expect(rows[0].sampleCount).toBe(5);
    expect(rows[0].lineIds).toHaveLength(5);
    expect(rows[0].dimensionName).toBe("20x20"); // alle gelijk
    expect(billingSubtotalCents(rows)).toBe(54900); // NIET 5 × 54900
  });

  it("normaliseert correct na 'Totaal instellen' (eerste regel bedrag, rest €0)", () => {
    const lines = [
      staal({ lineId: "a", collectionId: "c", collectionName: "Maatwerk", priceCents: 54900 }),
      staal({ lineId: "b", collectionId: "c", collectionName: "Maatwerk", priceCents: 0 }),
      staal({ lineId: "d", collectionId: "c", collectionName: "Maatwerk", priceCents: 0 }),
    ];
    const rows = buildBillingRows(lines);
    expect(rows).toHaveLength(1);
    expect(rows[0].priceCents).toBe(54900);
    expect(billingSubtotalCents(rows)).toBe(54900);
  });
});

describe("buildBillingRows — bundels en losse stalen", () => {
  it("groepeert een bundel tot één regel en telt de prijs één keer", () => {
    const lines = [
      staal({ lineId: "a", bundleId: "b1", bundleName: "Starterset", priceCents: 10000 }),
      staal({ lineId: "b", bundleId: "b1", bundleName: "Starterset", priceCents: 10000 }),
    ];
    const rows = buildBillingRows(lines);
    expect(rows).toHaveLength(1);
    expect(rows[0].tag).toBe("Bundel");
    expect(rows[0].sampleCount).toBe(2);
    expect(billingSubtotalCents(rows)).toBe(10000);
  });

  it("houdt losse stalen als aparte regels", () => {
    const lines = [
      staal({ lineId: "a", colorCode: "13", priceCents: 1500 }),
      staal({ lineId: "b", colorCode: "18", priceCents: 1500 }),
    ];
    const rows = buildBillingRows(lines);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tag === "Staal")).toBe(true);
    expect(billingSubtotalCents(rows)).toBe(3000);
  });

  it("volgorde: collecties, dan bundels, dan losse stalen", () => {
    const lines = [
      staal({ lineId: "loose", priceCents: 100 }),
      staal({ lineId: "coll", collectionId: "c", collectionName: "Maatwerk", priceCents: 200 }),
      staal({ lineId: "bund", bundleId: "b", bundleName: "Set", priceCents: 300 }),
    ];
    const rows = buildBillingRows(lines);
    expect(rows.map((r) => r.tag)).toEqual(["Collectie", "Bundel", "Staal"]);
  });

  it("zet dimensionName op null als de afmetingen binnen een groep verschillen", () => {
    const lines = [
      staal({ lineId: "a", collectionId: "c", collectionName: "Mix", dimensionName: "20x20" }),
      staal({ lineId: "b", collectionId: "c", collectionName: "Mix", dimensionName: "30x50" }),
    ];
    const rows = buildBillingRows(lines);
    expect(rows[0].dimensionName).toBeNull();
  });
});
