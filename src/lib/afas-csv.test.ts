import { describe, expect, it } from "vitest";
import {
  AFAS_CSV_HEADER,
  afasBedrag,
  afasGrootboek,
  buildAfasCsv,
  buildAfasCsvRow,
  csvLand,
  vervaldatum,
} from "./afas-csv";

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
  btwPct: 21,
  subtotalCents: 59900,
  btwCents: 12579,
  totalCents: 72479,
};

describe("afas-csv — formaat van het aangeleverde voorbeeldbestand (2026-07-09.csv)", () => {
  it("kolomvolgorde is identiek aan het voorbeeld", () => {
    expect([...AFAS_CSV_HEADER]).toEqual([
      "Debiteur", "Naam1", "Naam2", "Adres", "Postcode", "Woonplaats", "Land",
      "Ordernummer", "Klant ref", "Factuurnr", "Datum", "Verv.datum",
      "Bedrag ex", "BTW bedrag", "Totaal", "Tegenrekening", "BTW",
    ]);
  });

  it("bouwt een rij per factuur (21% → 8002/1)", () => {
    expect(buildAfasCsvRow(BASIS)).toBe(
      "590100;VAN MANEN HUIS EN HAARD BV;;DR. WILLEM DREESLAAN 2;3771RW;BARNEVELD;;" +
      "#2026-102;Update Mart Visser + lookbook;STL-2026-045;03-07-2026;17-07-2026;" +
      "599;125,79;724,79;8002;1"
    );
  });

  it("0%-ICL-factuur boekt op 8018/34 met leeg BTW-bedrag-teken", () => {
    const row = buildAfasCsvRow({
      ...BASIS,
      country: "Duitsland",
      btwPct: 0,
      subtotalCents: 12000,
      btwCents: 0,
      totalCents: 12000,
    });
    expect(row).toContain(";Duitsland;");
    expect(row.endsWith(";120;0;120;8018;34")).toBe(true);
  });

  it("9% heeft geen bekende grootboekcode → kolommen blijven leeg (geen gok)", () => {
    expect(afasGrootboek(9)).toEqual({ tegenrekening: "", btwCode: "" });
    expect(afasGrootboek(21)).toEqual({ tegenrekening: "8002", btwCode: "1" });
    expect(afasGrootboek(0)).toEqual({ tegenrekening: "8018", btwCode: "34" });
  });

  it("bedragnotatie volgt het voorbeeld: trailing nullen weg", () => {
    expect(afasBedrag(-3500)).toBe("-35");     // -35,00 → -35
    expect(afasBedrag(-6120)).toBe("-61,2");   // -61,20 → -61,2
    expect(afasBedrag(17389)).toBe("173,89");
    expect(afasBedrag(0)).toBe("0");
    expect(afasBedrag(89100)).toBe("891");
    expect(afasBedrag(-735)).toBe("-7,35");
  });

  it("vervaldatum telt de betaaltermijn op bij de factuurdatum (over maandgrens)", () => {
    expect(vervaldatum("2026-07-25", 14)).toBe("08-08-2026");
    expect(vervaldatum("2026-12-31", 30)).toBe("30-01-2027");
  });

  it("laat Nederland leeg, normaliseert buurlanden, laat onbekend land staan", () => {
    expect(csvLand("Nederland")).toBe("");
    expect(csvLand("NL")).toBe("");
    expect(csvLand("Nederlandt")).toBe(""); // tikfout in de live klantdata
    expect(csvLand(null)).toBe("");
    expect(csvLand("Belgie")).toBe("België");
    expect(csvLand("Duitsland")).toBe("Duitsland");
    expect(csvLand("DEUTSCHLAND")).toBe("DEUTSCHLAND"); // onbekend → letterlijk, zoals in het voorbeeld
  });

  it("quoteert velden met puntkomma of aanhalingsteken", () => {
    const row = buildAfasCsvRow({ ...BASIS, orderReference: 'ref; met "quote"' });
    expect(row).toContain('"ref; met ""quote"""');
  });

  it("creditnota rendert negatieve bedragen", () => {
    const row = buildAfasCsvRow({ ...BASIS, subtotalCents: -59900, btwCents: -12579, totalCents: -72479 });
    expect(row).toContain(";-599;-125,79;-724,79;8002;1");
  });

  it("volledige CSV begint met BOM + header, één regel per factuur", () => {
    const csv = buildAfasCsv([BASIS, BASIS]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[0]).toContain("Debiteur;Naam1;Naam2");
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});
