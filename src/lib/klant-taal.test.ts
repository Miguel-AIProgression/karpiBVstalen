import { describe, it, expect } from "vitest";
import { bepaalFactuurTaal } from "./klant-taal";

describe("bepaalFactuurTaal — geen/onbekend land", () => {
  it("null/undefined/leeg → nl (binnenlands is de veilige default)", () => {
    expect(bepaalFactuurTaal(null)).toBe("nl");
    expect(bepaalFactuurTaal(undefined)).toBe("nl");
    expect(bepaalFactuurTaal("")).toBe("nl");
    expect(bepaalFactuurTaal("   ")).toBe("nl");
  });

  it("een bekend maar niet-herkend land → en (veilige middenweg)", () => {
    expect(bepaalFactuurTaal("Frankrijk")).toBe("en");
    expect(bepaalFactuurTaal("France")).toBe("en");
    expect(bepaalFactuurTaal("België")).toBe("en");
    expect(bepaalFactuurTaal("Belgium")).toBe("en");
    expect(bepaalFactuurTaal("onzin-land")).toBe("en");
    expect(bepaalFactuurTaal("United Kingdom")).toBe("en");
  });
});

describe("bepaalFactuurTaal — NL-varianten", () => {
  it("herkent alle NL-schrijfwijzen, ongeacht hoofdletters/leestekens", () => {
    expect(bepaalFactuurTaal("NL")).toBe("nl");
    expect(bepaalFactuurTaal("nl")).toBe("nl");
    expect(bepaalFactuurTaal("Nederland")).toBe("nl");
    expect(bepaalFactuurTaal("NEDERLAND")).toBe("nl");
    expect(bepaalFactuurTaal("Netherlands")).toBe("nl");
    expect(bepaalFactuurTaal("The Netherlands")).toBe("nl");
    expect(bepaalFactuurTaal("N.L.")).toBe("nl");
  });
});

describe("bepaalFactuurTaal — DE/AT/CH-varianten", () => {
  it("Duitsland in elke spelling → de", () => {
    expect(bepaalFactuurTaal("DE")).toBe("de");
    expect(bepaalFactuurTaal("de")).toBe("de");
    expect(bepaalFactuurTaal("Duitsland")).toBe("de");
    expect(bepaalFactuurTaal("Deutschland")).toBe("de");
    expect(bepaalFactuurTaal("GERMANY")).toBe("de");
  });

  it("Oostenrijk in elke spelling → de", () => {
    expect(bepaalFactuurTaal("AT")).toBe("de");
    expect(bepaalFactuurTaal("Oostenrijk")).toBe("de");
    expect(bepaalFactuurTaal("Österreich")).toBe("de");
    expect(bepaalFactuurTaal("Austria")).toBe("de");
  });

  it("Zwitserland in elke spelling → de", () => {
    expect(bepaalFactuurTaal("CH")).toBe("de");
    expect(bepaalFactuurTaal("Zwitserland")).toBe("de");
    expect(bepaalFactuurTaal("Schweiz")).toBe("de");
    expect(bepaalFactuurTaal("Switzerland")).toBe("de");
  });
});
