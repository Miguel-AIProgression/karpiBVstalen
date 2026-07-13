import { describe, expect, it } from "vitest";
import { AFAS_CSV_HEADER, buildAfasCsv, buildAfasCsvRow, csvLand, vervaldatum } from "./afas-csv";

const BASIS = {
  clientNumber: "590100",
  clientName: "VAN MANEN HUIS EN HAARD BV",
  street: "DR. WILLEM DREESLAAN 2",
  postalCode: "3771RW",
  city: "BARNEVELD",
  country: "Nederland",
  orderNumber: "#2026-102",
  orderReference: "Update Mart Visser + lookbook",
  invoiceNumber: "STL-2026-045",
  invoiceDate: "2026-07-03",
  paymentDays: 14,
  subtotalCents: 59900,
  btwCents: 12579,
  totalCents: 72479,
};

describe("afas-csv (RugFlow-verkoopoverzicht-formaat)", () => {
  it("kolomvolgorde spiegelt de normale facturen-export", () => {
    expect([...AFAS_CSV_HEADER]).toEqual([
      "Debiteur", "Naam1", "Naam2", "Adres", "Postcode", "Woonplaats", "Land",
      "Ordernummer", "Klant ref", "Factuurnr", "Datum", "Verv.datum",
      "Bedrag ex", "BTW bedrag", "Totaal",
    ]);
  });

  it("bouwt een rij per factuur zonder Omschrijving/BTW-code, met vervaldatum", () => {
    expect(buildAfasCsvRow(BASIS)).toBe(
      "590100;VAN MANEN HUIS EN HAARD BV;;DR. WILLEM DREESLAAN 2;3771RW;BARNEVELD;;" +
      "#2026-102;Update Mart Visser + lookbook;STL-2026-045;03-07-2026;17-07-2026;" +
      "599,00;125,79;724,79"
    );
  });

  it("vervaldatum telt de betaaltermijn op bij de factuurdatum (over maandgrens)", () => {
    expect(vervaldatum("2026-07-25", 14)).toBe("08-08-2026");
    expect(vervaldatum("2026-12-31", 30)).toBe("30-01-2027");
  });

  it("laat Nederland leeg en andere landen staan (zoals de normale facturen)", () => {
    expect(csvLand("Nederland")).toBe("");
    expect(csvLand("NL")).toBe("");
    expect(csvLand(null)).toBe("");
    expect(csvLand("Deutschland")).toBe("Deutschland");
    expect(csvLand("België")).toBe("België");
  });

  it("quoteert velden met puntkomma of aanhalingsteken", () => {
    const row = buildAfasCsvRow({ ...BASIS, orderReference: 'ref; met "quote"' });
    expect(row).toContain('"ref; met ""quote"""');
  });

  it("negatieve bedragen (creditnota) renderen met minteken", () => {
    const row = buildAfasCsvRow({ ...BASIS, subtotalCents: -59900, btwCents: -12579, totalCents: -72479 });
    expect(row.endsWith("-599,00;-125,79;-724,79")).toBe(true);
  });

  it("volledige CSV begint met BOM + header", () => {
    const csv = buildAfasCsv([BASIS]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[0]).toContain("Debiteur;Naam1;Naam2");
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});
