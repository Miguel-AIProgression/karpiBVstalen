import { describe, it, expect } from "vitest";
import { customerCountryLine, defaultBtwPct, iclNotice, isEuForeignCountry } from "./btw";

describe("customerCountryLine — landregel klantblok (verhuisd van invoice-pdf.ts)", () => {
  it("geeft null voor onbekend/leeg land", () => {
    expect(customerCountryLine(null)).toBeNull();
    expect(customerCountryLine(undefined)).toBeNull();
    expect(customerCountryLine("")).toBeNull();
  });

  it("geeft null voor NL/Nederland in elke schrijfwijze", () => {
    expect(customerCountryLine("NL")).toBeNull();
    expect(customerCountryLine("Nederland")).toBeNull();
    expect(customerCountryLine("The Netherlands")).toBeNull();
  });

  it("geeft het land uppercased terug wanneer het afwijkt van NL", () => {
    expect(customerCountryLine("Deutschland")).toBe("DEUTSCHLAND");
    expect(customerCountryLine("belgië")).toBe("BELGIË");
  });
});

describe("defaultBtwPct — ICL-default vóór opslaan", () => {
  it("Nederlandse klant → 21%, ook met btw-nummer", () => {
    expect(defaultBtwPct({ country: "Nederland", vatNumber: null })).toBe(21);
    expect(defaultBtwPct({ country: "Nederland", vatNumber: "NL123456789B01" })).toBe(21);
  });

  it("Duitsland + btw-nummer → 0% (ICL)", () => {
    expect(defaultBtwPct({ country: "Duitsland", vatNumber: "DE123456789" })).toBe(0);
  });

  it("Duitsland zonder btw-nummer → 21% (geen ICL zonder btw-nr)", () => {
    expect(defaultBtwPct({ country: "Duitsland", vatNumber: null })).toBe(21);
    expect(defaultBtwPct({ country: "Duitsland", vatNumber: "" })).toBe(21);
    expect(defaultBtwPct({ country: "Duitsland", vatNumber: "   " })).toBe(21);
  });

  it("onbekend land (null) → 21%, ook met btw-nummer", () => {
    expect(defaultBtwPct({ country: null, vatNumber: "DE123456789" })).toBe(21);
  });

  it("België + btw-nummer → 0% (ICL), ook met diakriet/native spelling", () => {
    expect(defaultBtwPct({ country: "België", vatNumber: "BE0123456789" })).toBe(0);
    expect(defaultBtwPct({ country: "Belgique", vatNumber: "BE0123456789" })).toBe(0);
    expect(defaultBtwPct({ country: "Österreich", vatNumber: "ATU12345678" })).toBe(0);
  });

  it("NL-varianten die NIET in de whitelist staan → 21% (veilige richting, geen onterecht 0%)", () => {
    expect(defaultBtwPct({ country: "Holland", vatNumber: "NL123456789B01" })).toBe(21);
    expect(defaultBtwPct({ country: "Pays-Bas", vatNumber: "NL123456789B01" })).toBe(21);
  });

  it("niet-EU-land met btw-nummer → 21% (ICL is EU-only)", () => {
    expect(defaultBtwPct({ country: "Zwitserland", vatNumber: "CHE123456789" })).toBe(21);
    expect(defaultBtwPct({ country: "onzin-land", vatNumber: "XX123" })).toBe(21);
  });
});

describe("isEuForeignCountry — positieve EU-landmatch (excl. NL)", () => {
  it("herkent EU-lidstaten in diverse spellingen", () => {
    expect(isEuForeignCountry("Duitsland")).toBe(true);
    expect(isEuForeignCountry("Deutschland")).toBe(true);
    expect(isEuForeignCountry("GERMANY")).toBe(true);
    expect(isEuForeignCountry("Österreich")).toBe(true);
  });
  it("NL en onbekend/niet-EU → false", () => {
    expect(isEuForeignCountry("Nederland")).toBe(false);
    expect(isEuForeignCountry("Holland")).toBe(false);
    expect(isEuForeignCountry("Zwitserland")).toBe(false);
    expect(isEuForeignCountry(null)).toBe(false);
  });
});

describe("iclNotice — vrijstellingsregel op de PDF", () => {
  it("0% + btw-nummer + EU-land → de exacte RugFlow-vrijstellingstekst", () => {
    expect(iclNotice(0, "DE123456789", "Duitsland")).toBe(
      "Vrijgestelde intracommunautaire levering — btw-nr afnemer: DE123456789"
    );
  });

  it("21% (ook met btw-nummer + EU-land) → geen regel", () => {
    expect(iclNotice(21, "DE123456789", "Duitsland")).toBeNull();
  });

  it("0% zonder btw-nummer → geen regel (geen ICL)", () => {
    expect(iclNotice(0, null, "Duitsland")).toBeNull();
    expect(iclNotice(0, "", "Duitsland")).toBeNull();
    expect(iclNotice(0, "   ", "Duitsland")).toBeNull();
  });

  it("0% + NL-btw-nr op binnenlandse factuur → geen valse ICL-verklaring", () => {
    expect(iclNotice(0, "NL123456789B01", "Nederland")).toBeNull();
    expect(iclNotice(0, "NL123456789B01", "Holland")).toBeNull();
    expect(iclNotice(0, "NL123456789B01", null)).toBeNull();
  });

  it("9% → geen regel", () => {
    expect(iclNotice(9, "DE123456789", "Duitsland")).toBeNull();
  });
});
