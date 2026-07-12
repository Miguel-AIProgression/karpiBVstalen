import { describe, it, expect } from "vitest";
import { creditAmountForLine, computeCreditTotals, remainingCreditCents, parseEuroInputToCents } from "./credit-calc";

describe("creditAmountForLine — spiegelt de RPC (mig 20260712_credit_invoices.sql, create_credit_invoice)", () => {
  it("een volle regel crediteert exact het regelbedrag (geen afronding)", () => {
    const line = { quantity: 3, amountCents: 1000 };
    expect(creditAmountForLine(line, 3)).toBe(1000);
  });

  it("een deelcredit is pro-rata afgerond op het regelbedrag", () => {
    const line = { quantity: 3, amountCents: 1000 };
    // 1000 * 1 / 3 = 333.33... → 333
    expect(creditAmountForLine(line, 1)).toBe(333);
    // 1000 * 2 / 3 = 666.66... → 667
    expect(creditAmountForLine(line, 2)).toBe(667);
  });
});

describe("computeCreditTotals — modus regels", () => {
  it("spiegelt btw/total exact van het origineel bij volledige credit (geen afrondingsdrift)", () => {
    // Origineel heeft een btw die NIET exact ROUND(subtotal*pct/100) is (bv. door
    // eerdere handmatige correctie) — een volledige credit moet dat toch exact spiegelen.
    const totals = computeCreditTotals({
      mode: "lines",
      selections: [
        { line: { quantity: 1, amountCents: 5000 }, creditQuantity: 1 },
        { line: { quantity: 2, amountCents: 2000 }, creditQuantity: 2 },
      ],
      original: { subtotalCents: 7000, btwCents: 1471, totalCents: 8471, btwPct: 21 },
    });
    expect(totals.subtotalCents).toBe(-7000);
    expect(totals.btwCents).toBe(-1471);
    expect(totals.totalCents).toBe(-8471);
  });

  it("herrekent btw met de standaardformule bij een deelcredit", () => {
    const totals = computeCreditTotals({
      mode: "lines",
      selections: [{ line: { quantity: 3, amountCents: 1000 }, creditQuantity: 1 }],
      original: { subtotalCents: 7000, btwCents: 1470, totalCents: 8470, btwPct: 21 },
    });
    // regelbedrag: round(1000*1/3) = 333 → subtotal -333
    expect(totals.subtotalCents).toBe(-333);
    // btw = -round(333 * 21 / 100) = -round(69.93) = -70
    expect(totals.btwCents).toBe(-70);
    expect(totals.totalCents).toBe(-403);
  });
});

describe("computeCreditTotals — modus vrij bedrag", () => {
  it("exclusief BTW: subtotal = -bedrag, btw herrekend", () => {
    const totals = computeCreditTotals({
      mode: "free_amount",
      amountCents: 10000,
      inclBtw: false,
      btwPct: 21,
    });
    expect(totals.subtotalCents).toBe(-10000);
    expect(totals.btwCents).toBe(-2100);
    expect(totals.totalCents).toBe(-12100);
  });

  it("inclusief BTW: €100 bij 21% → subtotal -8264, btw -1736", () => {
    const totals = computeCreditTotals({
      mode: "free_amount",
      amountCents: 10000,
      inclBtw: true,
      btwPct: 21,
    });
    expect(totals.totalCents).toBe(-10000);
    expect(totals.subtotalCents).toBe(-8264);
    expect(totals.btwCents).toBe(-1736);
  });
});

describe("remainingCreditCents — resterend credit-budget + 1-cent-marge", () => {
  it("zonder eerdere credits is het resterende bedrag het volledige debet-totaal", () => {
    expect(remainingCreditCents(8470, [])).toBe(8470);
  });

  it("trekt eerdere (negatieve) credit-totalen af van het debet-totaal", () => {
    expect(remainingCreditCents(8470, [-403, -2000])).toBe(6067);
  });

  it("een nieuwe credit tot en met resterend + 1 cent is toegestaan", () => {
    const remaining = remainingCreditCents(8470, [-8000]);
    expect(remaining).toBe(470);
    const newCreditTotal = -471; // |471| = remaining + 1
    expect(Math.abs(newCreditTotal) <= remaining + 1).toBe(true);
  });

  it("een nieuwe credit boven resterend + 1 cent overschrijdt de limiet", () => {
    const remaining = remainingCreditCents(8470, [-8000]);
    const newCreditTotal = -472; // |472| > remaining(470) + 1
    expect(Math.abs(newCreditTotal) <= remaining + 1).toBe(false);
  });
});

describe("parseEuroInputToCents — NL-notatie ('1.234,56') → cents (M2)", () => {
  it("strip duizendtal-punten vóór de komma-vervanging", () => {
    expect(parseEuroInputToCents("1.234,56")).toBe(123456);
  });

  it("parseert een bedrag zonder duizendtallen", () => {
    expect(parseEuroInputToCents("50")).toBe(5000);
    expect(parseEuroInputToCents("12,5")).toBe(1250);
  });

  it("een leeg veld is nog niets ingevuld → 0, geen fout", () => {
    expect(parseEuroInputToCents("")).toBe(0);
    expect(parseEuroInputToCents("   ")).toBe(0);
  });

  it("duizendtal zonder decimalen blijft correct (geen decimaal-verlies)", () => {
    expect(parseEuroInputToCents("1.234")).toBe(123400);
  });

  it("wijst invoer af die niet als bedrag parseert", () => {
    expect(parseEuroInputToCents("abc")).toBeNull();
    expect(parseEuroInputToCents("12,34,56")).toBeNull();
    expect(parseEuroInputToCents("12,345")).toBeNull(); // meer dan 2 decimalen
    expect(parseEuroInputToCents("-50")).toBeNull(); // negatief creditbedrag is ongeldig
  });
});
