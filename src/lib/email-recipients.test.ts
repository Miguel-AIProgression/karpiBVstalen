import { describe, expect, it } from "vitest";
import { invalidRecipients, parseEmailRecipients } from "./email-recipients";

describe("email-recipients", () => {
  it("splitst een veld met meerdere adressen (HOME CENTER WOLVEGA, live data)", () => {
    expect(parseEmailRecipients("zr-pdf@einrichtungspartnerring.com, factuur@homecenter.nl")).toEqual([
      "zr-pdf@einrichtungspartnerring.com",
      "factuur@homecenter.nl",
    ]);
  });

  it("negeert een trailing separator (NOVA PROJECT, live data)", () => {
    expect(parseEmailRecipients("info@novaproject.nl,")).toEqual(["info@novaproject.nl"]);
  });

  it("accepteert puntkomma en spaties als scheidingsteken", () => {
    expect(parseEmailRecipients("a@x.nl; b@x.nl  c@x.nl")).toEqual(["a@x.nl", "b@x.nl", "c@x.nl"]);
  });

  it("leeg/null geeft een lege lijst (geen ontvanger)", () => {
    expect(parseEmailRecipients(null)).toEqual([]);
    expect(parseEmailRecipients("")).toEqual([]);
    expect(parseEmailRecipients("   ")).toEqual([]);
  });

  it("wijst adressen zonder e-mailvorm aan", () => {
    expect(invalidRecipients(["a@x.nl", "geen-adres", "b@x.nl"])).toEqual(["geen-adres"]);
    expect(invalidRecipients(["a@x.nl", "b@x.nl"])).toEqual([]);
  });
});
