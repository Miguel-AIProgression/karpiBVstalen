import { describe, it, expect } from "vitest";
import { buildInvoiceLineRows, snapshotToInvoiceData, type StoredInvoiceRow, type StoredInvoiceLineRow } from "./invoice-snapshot";
import type { InvoiceData, InvoiceLine } from "./invoice-data";

function line(over: Partial<InvoiceLine>): InvoiceLine {
  return {
    label: "GENTLE — Antraciet",
    articleNumber: "GENT-13",
    // colorCode heeft geen kolom in invoice_lines en komt na een snapshot-rondreis
    // altijd op null terug (zie invoice-snapshot.ts) — fixtures houden 'm daarom
    // op null, net als groupLabel/isGroupStart die in de live data ook altijd
    // null/false zijn (zie invoice-data.ts).
    colorCode: null,
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
    clientName: "Testklant",
    clientNumber: "1234",
    billingAddress: { street: "Straat 1", postalCode: "1234AB", city: "Stad", country: "Nederland" },
    shippingAddress: { street: "Straat 1", postalCode: "1234AB", city: "Stad", country: "Nederland" },
    clientEmail: "klant@test.nl",
    clientVatNumber: null,
    lines: [line({})],
    subtotalCents: 1500,
    company: null,
    ...over,
  };
}

describe("buildInvoiceLineRows — mapping InvoiceData.lines → invoice_lines-insertrijen", () => {
  it("mapt een collectie-groep met tag/afmeting los in eigen kolommen (géén ingevouwen description)", () => {
    const data = invoiceData({
      lines: [
        line({
          tag: "Collectie",
          label: "Maatwerk",
          articleNumber: "5 staaltjes",
          dimensionName: "20x20",
          unitPriceCents: 10980,
          priceCents: 54900,
          quantity: 5,
          orderLineId: null,
        }),
      ],
      subtotalCents: 54900,
    });

    const rows = buildInvoiceLineRows("inv-1", data);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      invoice_id: "inv-1",
      order_line_id: null,
      line_tag: "Collectie",
      description: "Maatwerk",
      article_number: "5 staaltjes",
      dimension_name: "20x20",
      quantity: 5,
      unit_price_cents: 10980,
      amount_cents: 54900,
      position: 1,
    });
  });

  it("mapt een losse staal-regel met het label als description, de order_line_id en de afmeting", () => {
    const data = invoiceData({
      lines: [
        line({
          tag: "Staal",
          label: "GENTLE — Antraciet",
          articleNumber: "GENT-13",
          dimensionName: "30x40",
          unitPriceCents: 1500,
          priceCents: 1500,
          quantity: 1,
          orderLineId: "ol-42",
        }),
      ],
      subtotalCents: 1500,
    });

    const rows = buildInvoiceLineRows("inv-1", data);

    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("GENTLE — Antraciet");
    expect(rows[0].order_line_id).toBe("ol-42");
    expect(rows[0].article_number).toBe("GENT-13");
    expect(rows[0].line_tag).toBe("Staal");
    expect(rows[0].dimension_name).toBe("30x40");
  });

  it("nummert de positie 1-based in de volgorde van InvoiceData.lines", () => {
    const data = invoiceData({
      lines: [
        line({ label: "Eerste", priceCents: 100, orderLineId: "a" }),
        line({ label: "Tweede", priceCents: 200, orderLineId: "b" }),
        line({ label: "Derde", priceCents: 300, orderLineId: "c" }),
      ],
      subtotalCents: 600,
    });

    const rows = buildInvoiceLineRows("inv-1", data);

    expect(rows.map(r => r.position)).toEqual([1, 2, 3]);
    expect(rows.map(r => r.description)).toEqual(["Eerste", "Tweede", "Derde"]);
  });

  it("de som van amount_cents komt exact overeen met subtotalCents", () => {
    const data = invoiceData({
      lines: [
        line({ label: "Eerste", priceCents: 1234, orderLineId: "a" }),
        line({
          tag: "Bundel",
          label: "Starterset",
          articleNumber: "2 staaltjes",
          priceCents: 4321,
          quantity: 2,
          orderLineId: null,
        }),
      ],
      subtotalCents: 5555,
    });

    const rows = buildInvoiceLineRows("inv-1", data);

    const sum = rows.reduce((s, r) => s + r.amount_cents, 0);
    expect(sum).toBe(data.subtotalCents);
  });
});

describe("snapshotToInvoiceData — snapshot-regels + live klant-/adresvelden", () => {
  const storedInvoice: StoredInvoiceRow = {
    id: "inv-1",
    invoice_number: "STL-2026-001",
    invoice_date: "2026-07-12",
    btw_pct: 21,
    subtotal_cents: 1500,
    btw_cents: 315,
    total_cents: 1815,
  };

  const snapshotLines: StoredInvoiceLineRow[] = [
    {
      id: "sl-1",
      invoice_id: "inv-1",
      order_line_id: "ol-1",
      line_tag: "Staal",
      description: "Snapshot-omschrijving",
      article_number: "ART-1",
      dimension_name: "20x20",
      quantity: 1,
      unit_price_cents: 1500,
      amount_cents: 1500,
      position: 1,
    },
  ];

  it("laat de snapshot-regels winnen van de live-regels", () => {
    const liveData = invoiceData({
      lines: [line({ label: "Live-omschrijving (verouderd)", priceCents: 9999 })],
      subtotalCents: 9999,
    });

    const result = snapshotToInvoiceData(storedInvoice, snapshotLines, liveData);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].label).toBe("Snapshot-omschrijving");
    expect(result.lines[0].dimensionName).toBe("20x20");
    expect(result.subtotalCents).toBe(1500);
  });

  it("reconstrueert tag en afmeting uit de eigen kolommen (géén 'Staal' meer geforceerd)", () => {
    const collectieLines: StoredInvoiceLineRow[] = [
      { ...snapshotLines[0], line_tag: "Collectie", description: "Maatwerk", dimension_name: null, order_line_id: null },
    ];
    const liveData = invoiceData({});

    const result = snapshotToInvoiceData(storedInvoice, collectieLines, liveData);

    expect(result.lines[0].tag).toBe("Collectie");
    expect(result.lines[0].label).toBe("Maatwerk");
    expect(result.lines[0].dimensionName).toBeNull();
  });

  it("valt terug op tag 'Staal' bij een onherkende/lege line_tag (bv. oudere data)", () => {
    const legacyLines: StoredInvoiceLineRow[] = [{ ...snapshotLines[0], line_tag: "" }];
    const liveData = invoiceData({});

    const result = snapshotToInvoiceData(storedInvoice, legacyLines, liveData);

    expect(result.lines[0].tag).toBe("Staal");
  });

  it("neemt klant-/adres-/company-velden over uit liveData", () => {
    const liveData = invoiceData({
      clientName: "Live Klant BV",
      clientNumber: "9999",
      clientEmail: "live@klant.nl",
      clientVatNumber: "DE123456789",
    });

    const result = snapshotToInvoiceData(storedInvoice, snapshotLines, liveData);

    expect(result.clientName).toBe("Live Klant BV");
    expect(result.clientNumber).toBe("9999");
    expect(result.clientEmail).toBe("live@klant.nl");
    // ICL: het btw-nummer komt (net als de rest van de klantvelden) uit liveData —
    // de snapshot draagt alleen regels/totalen, geen klantgegevens (zie invoice-snapshot.ts).
    expect(result.clientVatNumber).toBe("DE123456789");
    expect(result.billingAddress).toEqual(liveData.billingAddress);
    expect(result.company).toEqual(liveData.company);
  });

  it("houdt negatieve bedragen (creditnota) negatief", () => {
    const creditInvoice: StoredInvoiceRow = {
      ...storedInvoice,
      subtotal_cents: -1500,
      btw_cents: -315,
      total_cents: -1815,
    };
    const creditLines: StoredInvoiceLineRow[] = [
      { ...snapshotLines[0], amount_cents: -1500 },
    ];
    const liveData = invoiceData({});

    const result = snapshotToInvoiceData(creditInvoice, creditLines, liveData);

    expect(result.subtotalCents).toBe(-1500);
    expect(result.lines[0].priceCents).toBe(-1500);
  });
});

describe("buildInvoiceLineRows → snapshotToInvoiceData — rondreis is identiek aan de live regel-array (I1, PDF-regressie)", () => {
  /**
   * Gedrags-eis: de regel-array die de PDF-renderer te zien krijgt bij
   * snapshot-rendering (na insert + terugvraag) moet IDENTIEK zijn aan die bij
   * live-rendering. We simuleren de DB-rondreis puur (buildInvoiceLineRows →
   * insertrij krijgt een `id` erbij, precies zoals Postgres 'm teruggeeft) en
   * vergelijken de gereconstrueerde InvoiceLine[] veld-voor-veld met het
   * origineel — voor een collectie-groep, een bundel en een losse staal mét
   * afmeting (dekt alle drie de BillingTag-varianten uit ticket 006).
   */
  it("reconstrueert exact dezelfde lines als InvoiceData.lines voor collectie + bundel + losse staal met afmeting", () => {
    const originalLines: InvoiceLine[] = [
      line({
        tag: "Collectie",
        label: "Maatwerk",
        articleNumber: "5 staaltjes",
        dimensionName: null,
        unitPriceCents: 10980,
        priceCents: 54900,
        quantity: 5,
        orderLineId: null,
      }),
      line({
        tag: "Bundel",
        label: "Starterset",
        articleNumber: "2 staaltjes",
        dimensionName: "20x20",
        unitPriceCents: 2160,
        priceCents: 4321,
        quantity: 2,
        orderLineId: null,
      }),
      line({
        tag: "Staal",
        label: "GENTLE — Antraciet",
        articleNumber: "GENT-13",
        dimensionName: "30x40",
        unitPriceCents: 1500,
        priceCents: 1500,
        quantity: 1,
        orderLineId: "ol-42",
      }),
    ];
    const subtotalCents = originalLines.reduce((s, l) => s + l.priceCents, 0);
    const data = invoiceData({ lines: originalLines, subtotalCents });

    const insertRows = buildInvoiceLineRows("inv-1", data);
    // Simuleert wat Postgres teruggeeft na de insert: dezelfde kolommen + een id.
    const storedLines: StoredInvoiceLineRow[] = insertRows.map((row, i) => ({
      id: `sl-${i + 1}`,
      invoice_id: row.invoice_id,
      order_line_id: row.order_line_id,
      line_tag: row.line_tag,
      description: row.description,
      article_number: row.article_number,
      dimension_name: row.dimension_name,
      quantity: row.quantity,
      unit_price_cents: row.unit_price_cents,
      amount_cents: row.amount_cents,
      position: row.position,
    }));
    const storedInvoice: StoredInvoiceRow = {
      id: "inv-1",
      invoice_number: "STL-2026-001",
      invoice_date: "2026-07-12",
      btw_pct: 21,
      subtotal_cents: subtotalCents,
      btw_cents: Math.round(subtotalCents * 0.21),
      total_cents: subtotalCents + Math.round(subtotalCents * 0.21),
    };
    // liveData mag hier iets anders zijn (klant/adres) — alleen de lines tellen.
    const liveData = invoiceData({ lines: [], subtotalCents: 0 });

    const reconstructed = snapshotToInvoiceData(storedInvoice, storedLines, liveData);

    expect(reconstructed.lines).toHaveLength(originalLines.length);
    originalLines.forEach((original, i) => {
      const got = reconstructed.lines[i];
      expect(got.tag).toBe(original.tag);
      expect(got.label).toBe(original.label);
      expect(got.articleNumber).toBe(original.articleNumber);
      expect(got.dimensionName).toBe(original.dimensionName);
      expect(got.quantity).toBe(original.quantity);
      expect(got.unitPriceCents).toBe(original.unitPriceCents);
      expect(got.priceCents).toBe(original.priceCents);
      expect(got.orderLineId).toBe(original.orderLineId);
      // groupLabel/isGroupStart zijn in de live data ook altijd null/false —
      // dus deze zijn al identiek zonder dat de snapshot ze hoeft te dragen.
      expect(got.groupLabel).toBe(original.groupLabel);
      expect(got.isGroupStart).toBe(original.isGroupStart);
    });
  });
});
