import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  AFAS_XLSX_HEADER,
  afasGrootboek,
  buildAfasXlsx,
  csvLand,
  vervaldatum,
} from "./afas-xlsx";

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

/** Leest de door buildAfasXlsx geproduceerde bytes terug — het enige dat de tests mogen aannemen is het bytes-contract. */
function readWorkbook(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true, cellNF: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  return { wb, ws, sheetName, aoa };
}

describe("afas-xlsx — grootboek-/BTW-code (ongewijzigd t.o.v. afas-csv, verplaatst)", () => {
  it("9% heeft geen bekende grootboekcode → kolommen blijven leeg (geen gok)", () => {
    expect(afasGrootboek(9, "Nederland")).toEqual({ tegenrekening: "", btwCode: "" });
    expect(afasGrootboek(21, "Nederland")).toEqual({ tegenrekening: "8002", btwCode: "1" });
    expect(afasGrootboek(0, "Nederland")).toEqual({ tegenrekening: "8018", btwCode: "34" });
  });

  it("0%-factuur naar een land buiten de EU boekt op 8019/33", () => {
    expect(afasGrootboek(0, "Zwitserland")).toEqual({ tegenrekening: "8019", btwCode: "33" });
  });

  it("0%-factuur zonder land of met onbekend land is NOOIT buiten-EU (fail-safe) → 8018/34", () => {
    expect(afasGrootboek(0, "")).toEqual({ tegenrekening: "8018", btwCode: "34" });
    expect(afasGrootboek(0, null)).toEqual({ tegenrekening: "8018", btwCode: "34" });
    expect(afasGrootboek(0, undefined)).toEqual({ tegenrekening: "8018", btwCode: "34" });
  });

  it("0%-factuur naar een EU-lidstaat blijft op 8018/34 (ICL, geen buiten-EU-boeking)", () => {
    expect(afasGrootboek(0, "België")).toEqual({ tegenrekening: "8018", btwCode: "34" });
  });

  it("0%-factuur naar Nederland zelf blijft op 8018/34 (NL is nooit buiten-EU)", () => {
    expect(afasGrootboek(0, "Nederland")).toEqual({ tegenrekening: "8018", btwCode: "34" });
  });

  it("0%-factuur naar Nederland via een alias-schrijfwijze blijft óók op 8018/34 (bugfix code review d93af97)", () => {
    expect(afasGrootboek(0, "NL")).toEqual({ tegenrekening: "8018", btwCode: "34" });
    expect(afasGrootboek(0, "Netherlands")).toEqual({ tegenrekening: "8018", btwCode: "34" });
    expect(afasGrootboek(0, "Holland")).toEqual({ tegenrekening: "8018", btwCode: "34" });
    expect(afasGrootboek(0, "Nederlandt")).toEqual({ tegenrekening: "8018", btwCode: "34" }); // tikfout in live klantdata
  });

  it("21% blijft binnenland-boeking, ook bij een buiten-EU-land (21% komt in de praktijk niet met buiten-EU voor, maar het tarief bepaalt de code)", () => {
    expect(afasGrootboek(21, "Zwitserland")).toEqual({ tegenrekening: "8002", btwCode: "1" });
  });
});

describe("afas-xlsx — Land-kolom (ongewijzigd t.o.v. afas-csv, verplaatst)", () => {
  it("laat Nederland leeg, normaliseert buurlanden, laat onbekend land staan", () => {
    expect(csvLand("Nederland")).toBe("");
    expect(csvLand("NL")).toBe("");
    expect(csvLand("Nederlandt")).toBe(""); // tikfout in de live klantdata
    expect(csvLand(null)).toBe("");
    expect(csvLand("Belgie")).toBe("België");
    expect(csvLand("Duitsland")).toBe("Duitsland");
    expect(csvLand("DEUTSCHLAND")).toBe("DEUTSCHLAND"); // onbekend → letterlijk, zoals in het voorbeeld
  });
});

describe("afas-xlsx — vervaldatum (Date, geen string meer)", () => {
  it("telt de betaaltermijn op bij de factuurdatum (over maandgrens)", () => {
    const d = vervaldatum("2026-07-25", 14);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 8, 8]);
  });

  it("telt correct over een jaargrens heen (31-12 + 30 dagen → 30-01-2027)", () => {
    const d = vervaldatum("2026-12-31", 30);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2027, 1, 30]);
  });
});

describe("afas-xlsx — werkblad: header (slice 1)", () => {
  it("precies één werkblad; rij 1 bevat exact de 17 AFAS-kolomkoppen in dezelfde volgorde als voorheen", () => {
    const buf = buildAfasXlsx([]);
    const { wb, aoa } = readWorkbook(buf);
    expect(wb.SheetNames).toHaveLength(1);
    expect(aoa[0]).toEqual([...AFAS_XLSX_HEADER]);
    expect([...AFAS_XLSX_HEADER]).toEqual([
      "Debiteur", "Naam1", "Naam2", "Adres", "Postcode", "Woonplaats", "Land",
      "Ordernummer", "Klant ref", "Factuurnr", "Datum", "Verv.datum",
      "Bedrag ex", "BTW bedrag", "Totaal", "Tegenrekening", "BTW",
    ]);
  });

  it("zonder facturen bevat het werkblad alleen de headerrij", () => {
    const buf = buildAfasXlsx([]);
    const { aoa } = readWorkbook(buf);
    expect(aoa).toHaveLength(1);
  });
});

// Kolomindices (0-based, matcht AFAS_XLSX_HEADER-volgorde)
const COL = {
  datum: 10,
  vervDatum: 11,
};

describe("afas-xlsx — datumcellen: echte Date-cellen, geforceerd celformaat dd-mm-yyyy (slice 2)", () => {
  it("Datum en Verv.datum zijn echte datumcellen (type 'd') met celformaat dd-mm-yyyy", () => {
    const buf = buildAfasXlsx([BASIS]);
    const { ws } = readWorkbook(buf);
    const datumCell = ws[XLSX.utils.encode_cell({ r: 1, c: COL.datum })];
    const vervCell = ws[XLSX.utils.encode_cell({ r: 1, c: COL.vervDatum })];

    expect(datumCell.t).toBe("d");
    expect(datumCell.z).toBe("dd-mm-yyyy");
    expect([datumCell.v.getFullYear(), datumCell.v.getMonth() + 1, datumCell.v.getDate()]).toEqual([2026, 7, 3]);

    expect(vervCell.t).toBe("d");
    expect(vervCell.z).toBe("dd-mm-yyyy");
    // BASIS: invoiceDate 2026-07-03 + 14 dagen betaaltermijn
    expect([vervCell.v.getFullYear(), vervCell.v.getMonth() + 1, vervCell.v.getDate()]).toEqual([2026, 7, 17]);
  });

  it("TZ-randgeval 1 januari: geen dag-verschuiving door UTC-parse (jaargrens-start)", () => {
    const buf = buildAfasXlsx([{ ...BASIS, invoiceDate: "2026-01-01", paymentDays: 0 }]);
    const { ws } = readWorkbook(buf);
    const datumCell = ws[XLSX.utils.encode_cell({ r: 1, c: COL.datum })];
    expect([datumCell.v.getFullYear(), datumCell.v.getMonth() + 1, datumCell.v.getDate()]).toEqual([2026, 1, 1]);
    expect(datumCell.z).toBe("dd-mm-yyyy");
  });

  it("TZ-randgeval 31 december: geen dag-verschuiving door UTC-parse (jaargrens-eind)", () => {
    const buf = buildAfasXlsx([{ ...BASIS, invoiceDate: "2026-12-31", paymentDays: 0 }]);
    const { ws } = readWorkbook(buf);
    const datumCell = ws[XLSX.utils.encode_cell({ r: 1, c: COL.datum })];
    expect([datumCell.v.getFullYear(), datumCell.v.getMonth() + 1, datumCell.v.getDate()]).toEqual([2026, 12, 31]);
    expect(datumCell.z).toBe("dd-mm-yyyy");
  });
});

describe("afas-xlsx — vervaldatum-cel over maand-/jaargrens (slice 3)", () => {
  it("31-12 + 30 dagen betaaltermijn → Verv.datum-cel is 30-01-2027", () => {
    const buf = buildAfasXlsx([{ ...BASIS, invoiceDate: "2026-12-31", paymentDays: 30 }]);
    const { ws } = readWorkbook(buf);
    const vervCell = ws[XLSX.utils.encode_cell({ r: 1, c: COL.vervDatum })];
    expect([vervCell.v.getFullYear(), vervCell.v.getMonth() + 1, vervCell.v.getDate()]).toEqual([2027, 1, 30]);
    expect(vervCell.z).toBe("dd-mm-yyyy");
  });
});

const AMOUNT_COL = { subtotal: 12, btw: 13, total: 14 };

describe("afas-xlsx — bedragen als echte getallen (slice 4)", () => {
  it("Bedrag ex/BTW bedrag/Totaal zijn numerieke cellen (type 'n'), centen/100", () => {
    const buf = buildAfasXlsx([BASIS]);
    const { ws } = readWorkbook(buf);
    const subtotalCell = ws[XLSX.utils.encode_cell({ r: 1, c: AMOUNT_COL.subtotal })];
    const btwCell = ws[XLSX.utils.encode_cell({ r: 1, c: AMOUNT_COL.btw })];
    const totalCell = ws[XLSX.utils.encode_cell({ r: 1, c: AMOUNT_COL.total })];

    expect(subtotalCell.t).toBe("n");
    expect(subtotalCell.v).toBe(599); // 59900 cent
    expect(btwCell.t).toBe("n");
    expect(btwCell.v).toBe(125.79); // 12579 cent
    expect(totalCell.t).toBe("n");
    expect(totalCell.v).toBe(724.79); // 72479 cent
  });

  it("creditnota levert negatieve getallen op (geen minteken-als-tekst)", () => {
    const buf = buildAfasXlsx([{ ...BASIS, subtotalCents: -59900, btwCents: -12579, totalCents: -72479 }]);
    const { ws } = readWorkbook(buf);
    const subtotalCell = ws[XLSX.utils.encode_cell({ r: 1, c: AMOUNT_COL.subtotal })];
    const btwCell = ws[XLSX.utils.encode_cell({ r: 1, c: AMOUNT_COL.btw })];
    const totalCell = ws[XLSX.utils.encode_cell({ r: 1, c: AMOUNT_COL.total })];

    expect(subtotalCell.t).toBe("n");
    expect(subtotalCell.v).toBe(-599);
    expect(btwCell.t).toBe("n");
    expect(btwCell.v).toBe(-125.79);
    expect(totalCell.t).toBe("n");
    expect(totalCell.v).toBe(-724.79);
  });

  it("0-bedrag blijft een numerieke 0 (geen lege cel)", () => {
    const buf = buildAfasXlsx([{ ...BASIS, subtotalCents: 0, btwCents: 0, totalCents: 0 }]);
    const { ws } = readWorkbook(buf);
    const subtotalCell = ws[XLSX.utils.encode_cell({ r: 1, c: AMOUNT_COL.subtotal })];
    expect(subtotalCell.t).toBe("n");
    expect(subtotalCell.v).toBe(0);
  });
});

const GROOTBOEK_COL = { tegenrekening: 15, btw: 16 };

/** Leest Tegenrekening + BTW-cel van de eerste datarij terug, met celtype. */
function readGrootboekCells(buf: Buffer) {
  const { ws } = readWorkbook(buf);
  const tCell = ws[XLSX.utils.encode_cell({ r: 1, c: GROOTBOEK_COL.tegenrekening })];
  const bCell = ws[XLSX.utils.encode_cell({ r: 1, c: GROOTBOEK_COL.btw })];
  return { tCell, bCell };
}

describe("afas-xlsx — grootboek-mapping als tekstcellen (slice 5)", () => {
  it("21% (NL) → Tegenrekening '8002', BTW '1', beide tekstcellen (type 's')", () => {
    const buf = buildAfasXlsx([BASIS]); // BASIS: btwPct 21, country Nederland
    const { tCell, bCell } = readGrootboekCells(buf);
    expect(tCell.t).toBe("s");
    expect(tCell.v).toBe("8002");
    expect(bCell.t).toBe("s");
    expect(bCell.v).toBe("1");
  });

  it("0% ICL (EU-buurland) → Tegenrekening '8018', BTW '34', tekstcellen", () => {
    const buf = buildAfasXlsx([{ ...BASIS, btwPct: 0, country: "Duitsland" }]);
    const { tCell, bCell } = readGrootboekCells(buf);
    expect(tCell.t).toBe("s");
    expect(tCell.v).toBe("8018");
    expect(bCell.t).toBe("s");
    expect(bCell.v).toBe("34");
  });

  it("0% buiten-EU (Zwitserland) → Tegenrekening '8019', BTW '33', tekstcellen", () => {
    const buf = buildAfasXlsx([{ ...BASIS, btwPct: 0, country: "Zwitserland" }]);
    const { tCell, bCell } = readGrootboekCells(buf);
    expect(tCell.t).toBe("s");
    expect(tCell.v).toBe("8019");
    expect(bCell.t).toBe("s");
    expect(bCell.v).toBe("33");
  });

  it("9% (geen bekende code) → beide kolommen lege tekstcellen, geen gok", () => {
    const buf = buildAfasXlsx([{ ...BASIS, btwPct: 9 }]);
    const { tCell, bCell } = readGrootboekCells(buf);
    expect(tCell.t).toBe("s");
    expect(tCell.v).toBe("");
    expect(bCell.t).toBe("s");
    expect(bCell.v).toBe("");
  });
});

describe("afas-xlsx — sortering op factuurnummer, debet vóór credit (slice 6)", () => {
  it("sorteert oplopend op factuurnummer, ongeacht aanlevervolgorde", () => {
    const credit = { ...BASIS, invoiceNumber: "STL-2026-046" };
    const debet = { ...BASIS, invoiceNumber: "STL-2026-045" };
    const buf = buildAfasXlsx([credit, debet]); // credit eerst aangeleverd
    const { aoa } = readWorkbook(buf);
    expect(aoa[1][9]).toBe("STL-2026-045");
    expect(aoa[2][9]).toBe("STL-2026-046");
  });

  it("sorteert ook over een jaargrens heen (STL-2025-999 vóór STL-2026-001)", () => {
    const nieuw = { ...BASIS, invoiceNumber: "STL-2026-001" };
    const oud = { ...BASIS, invoiceNumber: "STL-2025-999" };
    const buf = buildAfasXlsx([nieuw, oud]);
    const { aoa } = readWorkbook(buf);
    expect(aoa[1][9]).toBe("STL-2025-999");
    expect(aoa[2][9]).toBe("STL-2026-001");
  });
});

describe("afas-xlsx — Debiteur-cel is een getal", () => {
  it("Debiteur is een numerieke cel (type 'n') wanneer clientNumber bekend is", () => {
    const buf = buildAfasXlsx([BASIS]); // BASIS.clientNumber = "590100"
    const { ws } = readWorkbook(buf);
    const debiteurCell = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
    expect(debiteurCell.t).toBe("n");
    expect(debiteurCell.v).toBe(590100);
  });

  it("valt terug op de klantnaam (tekstcel) wanneer clientNumber ontbreekt", () => {
    const buf = buildAfasXlsx([{ ...BASIS, clientNumber: null }]);
    const { ws } = readWorkbook(buf);
    const debiteurCell = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
    expect(debiteurCell.t).toBe("s");
    expect(debiteurCell.v).toBe(BASIS.clientName);
  });
});
