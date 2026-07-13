import { describe, it, expect } from "vitest";
import { customerCountryLine, defaultBtwPct, iclNotice } from "./btw";

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

  it("België + btw-nummer → 0% (ICL)", () => {
    expect(defaultBtwPct({ country: "België", vatNumber: "BE0123456789" })).toBe(0);
  });
});

describe("iclNotice — vrijstellingsregel op de PDF", () => {
  it("0% + btw-nummer → de exacte RugFlow-vrijstellingstekst", () => {
    expect(iclNotice(0, "DE123456789")).toBe(
      "Vrijgestelde intracommunautaire levering — btw-nr afnemer: DE123456789"
    );
  });

  it("21% (ook met btw-nummer) → geen regel", () => {
    expect(iclNotice(21, "DE123456789")).toBeNull();
  });

  it("0% zonder btw-nummer → geen regel (geen ICL)", () => {
    expect(iclNotice(0, null)).toBeNull();
    expect(iclNotice(0, "")).toBeNull();
    expect(iclNotice(0, "   ")).toBeNull();
  });

  it("9% → geen regel", () => {
    expect(iclNotice(9, "DE123456789")).toBeNull();
  });
});
