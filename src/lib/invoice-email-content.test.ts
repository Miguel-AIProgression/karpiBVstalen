import { describe, it, expect } from "vitest";
import { buildInvoiceEmail } from "./invoice-email-content";
import { formatCents } from "./invoice-data";

const company = {
  company_name: "Karpi BV",
  address_street: "Straat 1",
  address_postal: "1234AB",
  address_city: "Stad",
  address_country: "Nederland",
  phone: "010-1234567",
  email: "info@karpigroup.nl",
  kvk_number: "12345678",
  btw_number: "NL123456789B01",
  iban: "NL91ABNA0417164300",
  bic: "ABNANL2A",
  bank_name: "ABN AMRO",
  payment_days: 14,
};

describe("buildInvoiceEmail — modus debet (invoice)", () => {
  it("onderwerp bevat factuurnummer en klantnaam", () => {
    const { subject } = buildInvoiceEmail({
      documentType: "invoice",
      invoiceNumber: "STL-2026-001",
      clientName: "Testklant BV",
      totalCents: 12345,
      company,
      paymentDays: 14,
    });
    expect(subject).toBe("Factuur STL-2026-001 — Testklant BV");
  });

  it("body bevat het IBAN/betaalblok en het te betalen bedrag", () => {
    const { html } = buildInvoiceEmail({
      documentType: "invoice",
      invoiceNumber: "STL-2026-001",
      clientName: "Testklant BV",
      totalCents: 12345,
      company,
      paymentDays: 14,
    });
    expect(html).toContain(company.iban);
    expect(html).toContain(company.bic!);
    expect(html).toContain(formatCents(12345));
    expect(html).toContain("STL-2026-001");
    expect(html).toContain("14");
  });
});

describe("buildInvoiceEmail — modus credit", () => {
  it('onderwerp is "Creditnota {nr} — {klantnaam}"', () => {
    const { subject } = buildInvoiceEmail({
      documentType: "credit",
      invoiceNumber: "STL-2026-002",
      originalInvoiceNumber: "STL-2026-001",
      clientName: "Testklant BV",
      totalCents: -12345,
      company,
      paymentDays: 14,
    });
    expect(subject).toBe("Creditnota STL-2026-002 — Testklant BV");
  });

  it("body bevat GEEN betaalinstructie-tabel (O.v.v./T.n.v./over te maken) en geen termijn-/terugstortbelofte", () => {
    const { html } = buildInvoiceEmail({
      documentType: "credit",
      invoiceNumber: "STL-2026-002",
      originalInvoiceNumber: "STL-2026-001",
      clientName: "Testklant BV",
      totalCents: -12345,
      company,
      paymentDays: 14,
    });
    // Betaalinstructie-blok (mid-body) hoort er niet te zijn — de footer met
    // bedrijfs-IBAN/BTW/KvK (algemene briefvoet, geen "maak over"-instructie) blijft wel staan.
    expect(html).not.toContain("O.v.v.");
    expect(html).not.toContain("T.n.v.");
    expect(html).not.toContain("over te maken");
    expect(html).not.toContain("terugstort");
  });

  it("body bevat de verrekentekst met origineel factuurnummer en creditbedrag", () => {
    const { html } = buildInvoiceEmail({
      documentType: "credit",
      invoiceNumber: "STL-2026-002",
      originalInvoiceNumber: "STL-2026-001",
      clientName: "Testklant BV",
      totalCents: -12345,
      company,
      paymentDays: 14,
    });
    expect(html).toContain("STL-2026-002");
    expect(html).toContain("STL-2026-001");
    expect(html).toContain("wordt met u verrekend");
    expect(html).toContain(formatCents(-12345));
  });
});

describe("buildInvoiceEmail — Duitse klant (country → de)", () => {
  const duitseLanden = ["Duitsland", "Deutschland", "DE", "Österreich", "Schweiz"];

  it.each(duitseLanden)("onderwerp is 'Rechnung {nr} — {klantnaam}' voor land %s", (country) => {
    const { subject } = buildInvoiceEmail({
      documentType: "invoice",
      invoiceNumber: "STL-2026-010",
      clientName: "Muster GmbH",
      totalCents: 12345,
      company,
      paymentDays: 14,
      country,
    });
    expect(subject).toBe("Rechnung STL-2026-010 — Muster GmbH");
  });

  it("factuur-body is in het Duits: aanhef, betaalzin, betaalblok-labels en lang='de'", () => {
    const { html } = buildInvoiceEmail({
      documentType: "invoice",
      invoiceNumber: "STL-2026-010",
      clientName: "Muster GmbH",
      totalCents: 12345,
      company,
      paymentDays: 14,
      country: "Deutschland",
    });
    expect(html).toContain('lang="de"');
    expect(html).toContain("Sehr geehrte Damen und Herren,");
    expect(html).toContain("anbei erhalten Sie die Rechnung");
    expect(html).toContain("Tagen");
    expect(html).toContain("z.H.v.");
    expect(html).toContain("Verwendungszweck");
    expect(html).toContain("Mit freundlichen Grüßen,");
    expect(html).toContain(company.iban);
  });

  it('creditnota-onderwerp is "Gutschrift {nr} — {klantnaam}"', () => {
    const { subject } = buildInvoiceEmail({
      documentType: "credit",
      invoiceNumber: "STL-2026-011",
      originalInvoiceNumber: "STL-2026-010",
      clientName: "Muster GmbH",
      totalCents: -12345,
      company,
      paymentDays: 14,
      country: "Deutschland",
    });
    expect(subject).toBe("Gutschrift STL-2026-011 — Muster GmbH");
  });

  it("creditnota-body is in het Duits, geen betaalblok, wél de verrekentekst", () => {
    const { html } = buildInvoiceEmail({
      documentType: "credit",
      invoiceNumber: "STL-2026-011",
      originalInvoiceNumber: "STL-2026-010",
      clientName: "Muster GmbH",
      totalCents: -12345,
      company,
      paymentDays: 14,
      country: "Deutschland",
    });
    expect(html).toContain('lang="de"');
    expect(html).toContain("wird mit Ihnen verrechnet");
    expect(html).not.toContain("z.H.v.");
    expect(html).not.toContain("Verwendungszweck");
  });
});

describe("buildInvoiceEmail — onbekend/overig land (→ en)", () => {
  it("onderwerp en body zijn Engels voor een niet-NL/DE/AT/CH-land", () => {
    const { subject, html } = buildInvoiceEmail({
      documentType: "invoice",
      invoiceNumber: "STL-2026-012",
      clientName: "Sample Co",
      totalCents: 12345,
      company,
      paymentDays: 14,
      country: "France",
    });
    expect(subject).toBe("Invoice STL-2026-012 — Sample Co");
    expect(html).toContain('lang="en"');
    expect(html).toContain("Dear Sir or Madam,");
    expect(html).toContain("Kind regards,");
  });

  it("credit-onderwerp is Engels én de body bevat geen betaalblok", () => {
    const { subject, html } = buildInvoiceEmail({
      documentType: "credit",
      invoiceNumber: "STL-2026-013",
      originalInvoiceNumber: "STL-2026-012",
      clientName: "Sample Co",
      totalCents: -12345,
      company,
      paymentDays: 14,
      country: "France",
    });
    expect(subject).toBe("Credit note STL-2026-013 — Sample Co");
    expect(html).toContain("will be settled with you");
    expect(html).not.toContain("Account holder");
  });
});

describe("buildInvoiceEmail — geen country meegegeven blijft nl (backwards-compat)", () => {
  it("zonder country-veld → identiek aan de bestaande NL-default", () => {
    const { subject, html } = buildInvoiceEmail({
      documentType: "invoice",
      invoiceNumber: "STL-2026-014",
      clientName: "Testklant BV",
      totalCents: 12345,
      company,
      paymentDays: 14,
    });
    expect(subject).toBe("Factuur STL-2026-014 — Testklant BV");
    expect(html).toContain('lang="nl"');
  });
});
