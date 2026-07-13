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
    clientVatNumber: null,
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

describe("generateInvoicePdf — ICL (0% btw + btw-nr afnemer)", () => {
  it("genereert zonder te gooien voor een 0%-factuur met EU-btw-nummer (ICL-notice-pad in drawTotalsBlock)", () => {
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-007",
      invoiceDate: "2026-07-13",
      btwPct: 0,
      data: invoiceData({
        billingAddress: { street: "Hauptstraße 1", postalCode: "46399", city: "Bocholt", country: "Deutschland" },
        clientVatNumber: "DE123456789",
      }),
      btwCents: 0,
      totalCents: 1500,
    };
    expect(() => generateInvoicePdf(input)).not.toThrow();
  });

  it("21% btw met een btw-nummer genereert zonder de ICL-regel te forceren (geen exception)", () => {
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-008",
      invoiceDate: "2026-07-13",
      btwPct: 21,
      data: invoiceData({ clientVatNumber: "NL123456789B01" }),
      btwCents: 315,
      totalCents: 1815,
    };
    expect(() => generateInvoicePdf(input)).not.toThrow();
  });
});

describe("generateInvoicePdf — Duitse klant (meertalige facturatie)", () => {
  it("genereert zonder te gooien met een Duits factuuradres (RECHNUNG-taal-pad)", () => {
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-020",
      invoiceDate: "2026-07-13",
      btwPct: 19,
      data: invoiceData({
        billingAddress: { street: "Hauptstraße 1", postalCode: "46399", city: "Bocholt", country: "Deutschland" },
      }),
      btwCents: 285,
      totalCents: 1785,
    };
    expect(() => generateInvoicePdf(input)).not.toThrow();
  });

  it("creditnota voor een Duitse klant (GUTSCHRIFT-taal-pad) genereert zonder te gooien", () => {
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-021",
      invoiceDate: "2026-07-13",
      btwPct: 19,
      data: invoiceData({
        billingAddress: { street: "Hauptstraße 1", postalCode: "46399", city: "Bocholt", country: "Deutschland" },
        lines: [line({ priceCents: -1500, unitPriceCents: -1500 })],
        subtotalCents: -1500,
      }),
      btwCents: -285,
      totalCents: -1785,
      documentType: "credit",
      originalInvoiceNumber: "STL-2026-020",
      creditReason: "Beschädigt beim Transport",
    };
    expect(() => generateInvoicePdf(input)).not.toThrow();
  });

  it("Duitse ICL-factuur (0% + EU-btw-nr) genereert zonder te gooien (Duitse iclNotice-tekst)", () => {
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-022",
      invoiceDate: "2026-07-13",
      btwPct: 0,
      data: invoiceData({
        billingAddress: { street: "Hauptstraße 1", postalCode: "46399", city: "Bocholt", country: "Deutschland" },
        clientVatNumber: "DE123456789",
      }),
      btwCents: 0,
      totalCents: 1500,
    };
    expect(() => generateInvoicePdf(input)).not.toThrow();
  });

  it("meerpagina Duitse factuur (120 regels) — ÜBERTRAG/BLATT-pad bij paginabreuk", () => {
    const lines: InvoiceLine[] = Array.from({ length: 120 }, (_, i) =>
      line({ label: `GENTLE — Kleur ${i + 1}`, articleNumber: `GENT-${String(i + 1).padStart(3, "0")}`, dimensionName: "20x20" })
    );
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-023",
      invoiceDate: "2026-07-13",
      btwPct: 19,
      data: invoiceData({
        billingAddress: { street: "Hauptstraße 1", postalCode: "46399", city: "Bocholt", country: "Deutschland" },
        lines,
        subtotalCents: 1500 * 120,
      }),
      btwCents: Math.round(1500 * 120 * 0.19),
      totalCents: Math.round(1500 * 120 * 1.19),
    };
    const doc = buildInvoicePdfDoc(input);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(() => generateInvoicePdf(input)).not.toThrow();
  });
});

describe("generateInvoicePdf — Engelstalige klant (onbekend land → en)", () => {
  it("genereert zonder te gooien met een niet-NL/DE/AT/CH factuuradres (INVOICE-taal-pad)", () => {
    const input: InvoicePdfInput = {
      invoiceNumber: "STL-2026-024",
      invoiceDate: "2026-07-13",
      btwPct: 21,
      data: invoiceData({
        billingAddress: { street: "1 Main St", postalCode: "SW1A 1AA", city: "London", country: "United Kingdom" },
      }),
      btwCents: 315,
      totalCents: 1815,
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
