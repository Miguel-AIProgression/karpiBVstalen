import { describe, it, expect } from "vitest";
import {
  generateInvoicePdf,
  buildInvoicePdfDoc,
  customerCountryLine,
  tableHeaderStartY,
  type InvoicePdfInput,
} from "./invoice-pdf";
import type { InvoiceData, InvoiceLine } from "./invoice-data";

function line(over: Partial<InvoiceLine>): InvoiceLine {
  return {
    label: "GENTLE — Antraciet",
    articleNumber: "GENT-13",
    colorCode: "13",
    groupLabel: null,
    isGroupStart: false,
    tag: "Staal",
    unitPriceCents: 1500,
    priceCents: 1500,
    quantity: 1,
    dimensionName: "20x20",
    orderLineId: "ol-1",
    ...over,
  };
}

function invoiceData(over: Partial<InvoiceData>): InvoiceData {
  return {
    orderNumber: "ORD-2026-0001",
    orderReference: null,
    clientName: "Testklant BV",
    clientNumber: "1234",
    billingAddress: { street: "Straat 1", postalCode: "1234AB", city: "Stad", country: "Nederland" },
    shippingAddress: null,
    clientEmail: "klant@test.nl",
    lines: [line({})],
    subtotalCents: 1500,
    company: null,
    ...over,
  };
}

describe("generateInvoicePdf — smoke test debetfactuur", () => {
  it("retourneert een niet-lege Uint8Array en gooit niet", () => {
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-001",
      invoiceDate: "2026-07-12",
      btwPct: 21,
      data: invoiceData({}),
      btwCents: 315,
      totalCents: 1815,
    };
    const bytes = generateInvoicePdf(input);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe("generateInvoicePdf — smoke test creditnota", () => {
  it("retourneert een niet-lege Uint8Array met negatieve bedragen en documentType credit", () => {
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-002",
      invoiceDate: "2026-07-12",
      btwPct: 21,
      data: invoiceData({
        lines: [line({ priceCents: -1500, unitPriceCents: -1500 })],
        subtotalCents: -1500,
      }),
      btwCents: -315,
      totalCents: -1815,
      documentType: "credit",
      originalInvoiceNumber: "STL-2026-001",
      creditReason: "Retour staal beschadigd",
    };
    const bytes = generateInvoicePdf(input);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("gooit niet voor een gereconstrueerde snapshot-regel (echte vorm: tag Collectie, ongevouwen label + eigen Afm.-kolom)", () => {
    // Vorm zoals `snapshotToInvoiceData` 'm nu teruggeeft (I1-fix) — vóór de fix
    // stond hier altijd tag "Staal" met een ingevouwen description; dat gaf een
    // verminkt "Sample: Collectie: maatwerk-5 staaltjes"-label op de PDF.
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-003",
      invoiceDate: "2026-07-12",
      btwPct: 21,
      data: invoiceData({
        lines: [
          line({ label: "Maatwerk", articleNumber: "5 staaltjes", dimensionName: null, groupLabel: null, isGroupStart: false, tag: "Collectie" }),
        ],
      }),
      btwCents: 315,
      totalCents: 1815,
      documentType: "credit",
      originalInvoiceNumber: "STL-2026-001",
    };
    expect(() => generateInvoicePdf(input)).not.toThrow();
  });
});

describe("tableHeaderStartY — dynamische tabel-start pagina 1", () => {
  it("blijft op de vaste spec-positie 90 zolang het infoblok kort is", () => {
    // Standaard infoblok (3 regels vanaf y=55) eindigt op 67 → 67+8=75 < 90.
    expect(tableHeaderStartY(67)).toBe(90);
    expect(tableHeaderStartY(82)).toBe(90);
  });

  it("zakt mee met een lang infoblok (lange Reden) — altijd eind-y + 8", () => {
    expect(tableHeaderStartY(83)).toBe(91);
    expect(tableHeaderStartY(120)).toBe(128);
  });
});

describe("customerCountryLine — landregel klantblok", () => {
  it("geeft null voor onbekend/leeg land", () => {
    expect(customerCountryLine(null)).toBeNull();
    expect(customerCountryLine(undefined)).toBeNull();
    expect(customerCountryLine("")).toBeNull();
    expect(customerCountryLine("   ")).toBeNull();
  });

  it("geeft null voor NL/Nederland in elke schrijfwijze", () => {
    expect(customerCountryLine("NL")).toBeNull();
    expect(customerCountryLine("nl")).toBeNull();
    expect(customerCountryLine("Nederland")).toBeNull();
    expect(customerCountryLine("NEDERLAND")).toBeNull();
    expect(customerCountryLine("Netherlands")).toBeNull();
    expect(customerCountryLine("The Netherlands")).toBeNull();
    expect(customerCountryLine("N.L.")).toBeNull();
  });

  it("geeft het land uppercased terug wanneer het afwijkt van NL", () => {
    expect(customerCountryLine("Deutschland")).toBe("DEUTSCHLAND");
    expect(customerCountryLine("belgië")).toBe("BELGIË");
    expect(customerCountryLine(" France ")).toBe("FRANCE");
  });
});

describe("generateInvoicePdf — creditnota met lange reden (~300 tekens)", () => {
  it("genereert zonder exception; de dynamische tabel-start vangt het lange infoblok op", () => {
    const longReason =
      "Klant heeft op 11-07-2026 een retourzending aangemeld voor de complete order omdat meerdere stalen " +
      "tijdens het transport beschadigd zijn geraakt; na telefonisch overleg met de vertegenwoordiger is " +
      "besloten de volledige factuur te crediteren en de stalen kosteloos opnieuw te leveren zodra de nieuwe " +
      "productierun gereed is.";
    expect(longReason.length).toBeGreaterThanOrEqual(300);

    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-005",
      invoiceDate: "2026-07-12",
      btwPct: 21,
      data: invoiceData({
        lines: [line({ priceCents: -1500, unitPriceCents: -1500 })],
        subtotalCents: -1500,
      }),
      btwCents: -315,
      totalCents: -1815,
      documentType: "credit",
      originalInvoiceNumber: "STL-2026-001",
      creditReason: longReason,
    };

    const doc = buildInvoicePdfDoc(input);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    const bytes = generateInvoicePdf(input);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("buitenlands adres (Deutschland) genereert zonder exception mét landregel-pad", () => {
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-006",
      invoiceDate: "2026-07-12",
      btwPct: 19,
      data: invoiceData({
        billingAddress: { street: "Hauptstraße 1", postalCode: "46399", city: "Bocholt", country: "Deutschland" },
      }),
      btwCents: 285,
      totalCents: 1785,
    };
    expect(() => generateInvoicePdf(input)).not.toThrow();
  });
});

describe("generateInvoicePdf — meerpagina (110+ artikelregels)", () => {
  it("gooit niet en levert meer dan 1 pagina op voor een order met 120 regels", () => {
    const lines: InvoiceLine[] = Array.from({ length: 120 }, (_, i) =>
      line({
        label: `GENTLE — Kleur ${i + 1}`,
        articleNumber: `GENT-${String(i + 1).padStart(3, "0")}`,
        dimensionName: "20x20",
      })
    );
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-004",
      invoiceDate: "2026-07-12",
      btwPct: 21,
      data: invoiceData({ lines, subtotalCents: 1500 * 120 }),
      btwCents: Math.round(1500 * 120 * 0.21),
      totalCents: Math.round(1500 * 120 * 1.21),
    };

    const doc = buildInvoicePdfDoc(input);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);

    const bytes = generateInvoicePdf(input);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
