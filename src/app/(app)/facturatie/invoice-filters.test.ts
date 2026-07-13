import { describe, it, expect } from "vitest";
import { formatCents } from "@/lib/invoice-data";
import {
  isCredit,
  isSuperseded,
  filterInvoices,
  sortInvoices,
  selectableInvoiceIds,
  deriveSelectAllState,
  orderIdsForSelection,
  uniqueClientNames,
  formatSignedInvoiceTotal,
  hasActiveInvoiceFilters,
  pruneSelectedIds,
  EMPTY_INVOICE_FILTERS,
  type InvoiceRow,
} from "./invoice-filters";

function makeInvoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: "inv-1",
    invoice_number: "STL-2026-001",
    invoice_date: "2026-07-01",
    created_at: "2026-07-01T10:00:00Z",
    subtotal_cents: 1000,
    btw_cents: 210,
    total_cents: 1210,
    btw_pct: 21,
    sent_at: null,
    credited_invoice_id: null,
    credit_reason: null,
    superseded_at: null,
    order_id: "order-1",
    client_id: "client-1",
    client_name: "Karpi Klant BV",
    client_number: "1001",
    order_number: "ORD-2026-0001",
    ...overrides,
  };
}

describe("isCredit", () => {
  it("een factuur zonder credited_invoice_id is debet", () => {
    expect(isCredit(makeInvoice())).toBe(false);
  });
  it("een factuur met credited_invoice_id is credit", () => {
    expect(isCredit(makeInvoice({ credited_invoice_id: "inv-0" }))).toBe(true);
  });
});

describe("isSuperseded", () => {
  it("een factuur zonder superseded_at is niet vervangen", () => {
    expect(isSuperseded(makeInvoice())).toBe(false);
  });
  it("een factuur met superseded_at is vervangen", () => {
    expect(isSuperseded(makeInvoice({ superseded_at: "2026-07-13T10:00:00Z" }))).toBe(true);
  });
});

describe("filterInvoices — zoeken", () => {
  const invoices = [
    makeInvoice({ id: "a", invoice_number: "STL-2026-001", client_name: "Acme BV" }),
    makeInvoice({ id: "b", invoice_number: "STL-2026-002", client_name: "De Vries Interieur" }),
  ];

  it("matcht op factuurnummer, case-insensitive", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, search: "stl-2026-001" });
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("matcht op klantnaam, case-insensitive", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, search: "vries" });
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("een lege zoekterm laat alles staan", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, search: "   " });
    expect(result).toHaveLength(2);
  });
});

describe("filterInvoices — type", () => {
  const invoices = [
    makeInvoice({ id: "debit-1", credited_invoice_id: null }),
    makeInvoice({ id: "credit-1", credited_invoice_id: "debit-1", total_cents: -500 }),
  ];

  it("'debit' toont alleen debetfacturen", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, type: "debit" });
    expect(result.map((r) => r.id)).toEqual(["debit-1"]);
  });

  it("'credit' toont alleen creditnota's", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, type: "credit" });
    expect(result.map((r) => r.id)).toEqual(["credit-1"]);
  });

  it("'all' toont beide", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, type: "all" });
    expect(result).toHaveLength(2);
  });
});

describe("filterInvoices — status (gemaild)", () => {
  const invoices = [
    makeInvoice({ id: "sent-1", sent_at: "2026-07-01T12:00:00Z" }),
    makeInvoice({ id: "unsent-1", sent_at: null }),
  ];

  it("'sent' toont alleen gemailde facturen", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, status: "sent" });
    expect(result.map((r) => r.id)).toEqual(["sent-1"]);
  });

  it("'unsent' toont alleen niet-gemailde facturen", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, status: "unsent" });
    expect(result.map((r) => r.id)).toEqual(["unsent-1"]);
  });
});

describe("filterInvoices — klant en datumrange", () => {
  const invoices = [
    makeInvoice({ id: "a", client_name: "Acme BV", invoice_date: "2026-06-01" }),
    makeInvoice({ id: "b", client_name: "Beta NV", invoice_date: "2026-07-01" }),
    makeInvoice({ id: "c", client_name: "Acme BV", invoice_date: "2026-08-01" }),
  ];

  it("filtert op exacte klantnaam", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, client: "Acme BV" });
    expect(result.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("filtert op datum-van (inclusief)", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, dateFrom: "2026-07-01" });
    expect(result.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("filtert op datum-tot (inclusief)", () => {
    const result = filterInvoices(invoices, { ...EMPTY_INVOICE_FILTERS, dateTo: "2026-07-01" });
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("combineert van + tot tot een gesloten interval", () => {
    const result = filterInvoices(invoices, {
      ...EMPTY_INVOICE_FILTERS,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("hasActiveInvoiceFilters", () => {
  it("false zonder actieve filters", () => {
    expect(hasActiveInvoiceFilters(EMPTY_INVOICE_FILTERS)).toBe(false);
  });
  it("true zodra één filter afwijkt van de standaardwaarde", () => {
    expect(hasActiveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, type: "credit" })).toBe(true);
    expect(hasActiveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, search: "x" })).toBe(true);
    expect(hasActiveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, dateFrom: "2026-01-01" })).toBe(true);
  });
});

describe("sortInvoices — default (geen sorteerveld)", () => {
  it("sorteert op invoice_date desc, tiebreak created_at desc", () => {
    const invoices = [
      makeInvoice({ id: "oldest", invoice_date: "2026-06-01", created_at: "2026-06-01T09:00:00Z" }),
      makeInvoice({ id: "same-day-later", invoice_date: "2026-07-01", created_at: "2026-07-01T15:00:00Z" }),
      makeInvoice({ id: "same-day-earlier", invoice_date: "2026-07-01", created_at: "2026-07-01T09:00:00Z" }),
    ];
    const result = sortInvoices(invoices, null, "asc");
    expect(result.map((r) => r.id)).toEqual(["same-day-later", "same-day-earlier", "oldest"]);
  });
});

describe("sortInvoices — expliciet veld", () => {
  const invoices = [
    makeInvoice({ id: "b", invoice_number: "STL-2026-002", total_cents: 500 }),
    makeInvoice({ id: "a", invoice_number: "STL-2026-001", total_cents: 2000 }),
  ];

  it("sorteert op factuurnummer asc", () => {
    const result = sortInvoices(invoices, "invoice_number", "asc");
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("sorteert op totaal desc", () => {
    const result = sortInvoices(invoices, "total_cents", "desc");
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("selectableInvoiceIds", () => {
  it("bevat alleen debetfacturen", () => {
    const invoices = [
      makeInvoice({ id: "debit-1" }),
      makeInvoice({ id: "credit-1", credited_invoice_id: "debit-1" }),
      makeInvoice({ id: "debit-2" }),
    ];
    expect(selectableInvoiceIds(invoices)).toEqual(["debit-1", "debit-2"]);
  });

  it("sluit vervangen facturen uit, ook al zijn ze debet", () => {
    const invoices = [
      makeInvoice({ id: "debit-1" }),
      makeInvoice({ id: "superseded-1", superseded_at: "2026-07-13T10:00:00Z" }),
      makeInvoice({ id: "debit-2" }),
    ];
    expect(selectableInvoiceIds(invoices)).toEqual(["debit-1", "debit-2"]);
  });
});

describe("deriveSelectAllState", () => {
  it("'none' zonder selecteerbare facturen", () => {
    expect(deriveSelectAllState([], new Set())).toBe("none");
  });
  it("'none' als niets geselecteerd is", () => {
    expect(deriveSelectAllState(["a", "b"], new Set())).toBe("none");
  });
  it("'some' bij een deelselectie (indeterminate)", () => {
    expect(deriveSelectAllState(["a", "b"], new Set(["a"]))).toBe("some");
  });
  it("'all' als alle selecteerbare facturen geselecteerd zijn", () => {
    expect(deriveSelectAllState(["a", "b"], new Set(["a", "b"]))).toBe("all");
  });
  it("negeert geselecteerde id's die niet (meer) selecteerbaar zijn", () => {
    expect(deriveSelectAllState(["a"], new Set(["a", "credit-x"]))).toBe("all");
  });
});

describe("orderIdsForSelection", () => {
  it("geeft de order_id's van de geselecteerde facturen, in factuur-volgorde", () => {
    const invoices = [
      makeInvoice({ id: "inv-a", order_id: "order-a" }),
      makeInvoice({ id: "inv-b", order_id: "order-b" }),
      makeInvoice({ id: "inv-c", order_id: "order-c" }),
    ];
    expect(orderIdsForSelection(invoices, new Set(["inv-c", "inv-a"]))).toEqual(["order-a", "order-c"]);
  });
});

describe("uniqueClientNames", () => {
  it("dedupliceert en sorteert alfabetisch (nl)", () => {
    const invoices = [
      makeInvoice({ client_name: "Zeeman" }),
      makeInvoice({ client_name: "Acme BV" }),
      makeInvoice({ client_name: "Acme BV" }),
      makeInvoice({ client_name: "Örebro" }),
    ];
    expect(uniqueClientNames(invoices)).toEqual(["Acme BV", "Örebro", "Zeeman"]);
  });
});

describe("pruneSelectedIds", () => {
  it("laat ids staan die nog in de vers geladen lijst voorkomen", () => {
    const invoices = [makeInvoice({ id: "a" }), makeInvoice({ id: "b" })];
    const result = pruneSelectedIds(new Set(["a", "b"]), invoices);
    expect(result).toEqual(new Set(["a", "b"]));
  });

  it("verwijdert ids die niet meer in de vers geladen lijst voorkomen (verwijderd/gecrediteerd)", () => {
    const invoices = [makeInvoice({ id: "a" })];
    const result = pruneSelectedIds(new Set(["a", "b-verwijderd"]), invoices);
    expect(result).toEqual(new Set(["a"]));
  });

  it("een lege verse lijst pruned alle selectie weg", () => {
    const result = pruneSelectedIds(new Set(["a", "b"]), []);
    expect(result).toEqual(new Set());
  });

  it("een lege selectie blijft leeg", () => {
    const invoices = [makeInvoice({ id: "a" })];
    const result = pruneSelectedIds(new Set(), invoices);
    expect(result).toEqual(new Set());
  });
});

describe("formatSignedInvoiceTotal", () => {
  it("een debetfactuur toont het gewone bedrag", () => {
    expect(formatSignedInvoiceTotal(makeInvoice({ total_cents: 121000, credited_invoice_id: null }))).toBe(
      formatCents(121000)
    );
  });
  it("een creditnota toont een min-prefix + de absolute waarde", () => {
    const result = formatSignedInvoiceTotal(
      makeInvoice({ total_cents: -121000, credited_invoice_id: "debit-1" })
    );
    expect(result.endsWith(formatCents(121000))).toBe(true);
    expect(result).not.toBe(formatCents(121000));
  });
});
