import { describe, it, expect } from "vitest";
import { generateInvoicePdf, type InvoicePdfInput } from "./invoice-pdf";
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
