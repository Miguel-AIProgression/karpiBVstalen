// Pure spiegel van de RPC-berekening in `supabase/migrations/20260712_credit_invoices.sql`
// (create_credit_invoice). Elke wijziging aan de RPC-rekenlogica moet hier
// mee-veranderen — anders lopen UI-preview en de daadwerkelijke DB-berekening uiteen.

export interface CreditableLine {
  quantity: number;
  amountCents: number;
}

/** Regelbedrag: volle regel = exact het regelbedrag, deelcredit = pro-rata afgerond. */
export function creditAmountForLine(line: CreditableLine, creditQuantity: number): number {
  if (creditQuantity === line.quantity) return line.amountCents;
  return Math.round((line.amountCents * creditQuantity) / line.quantity);
}

export interface LineCreditSelection {
  line: CreditableLine;
  creditQuantity: number;
}

export interface CreditTotalsInputLines {
  mode: "lines";
  selections: LineCreditSelection[];
  /** De geboekte totalen van de originele (debet)factuur. */
  original: { subtotalCents: number; btwCents: number; totalCents: number; btwPct: number };
}

export interface CreditTotalsInputFreeAmount {
  mode: "free_amount";
  /** Positief bedrag; het teken wordt hier gezet. */
  amountCents: number;
  inclBtw: boolean;
  btwPct: number;
}

export type CreditTotalsInput = CreditTotalsInputLines | CreditTotalsInputFreeAmount;

export interface CreditTotals {
  subtotalCents: number;
  btwCents: number;
  totalCents: number;
}

export function computeCreditTotals(input: CreditTotalsInput): CreditTotals {
  if (input.mode === "lines") {
    const subtotalCents = -input.selections.reduce(
      (sum, s) => sum + creditAmountForLine(s.line, s.creditQuantity),
      0
    );

    // Volledige credit → exact de geboekte totalen spiegelen (geen afrondingsdrift
    // t.o.v. een origineel dat zelf niet exact ROUND(subtotal*pct/100) was).
    if (subtotalCents === -input.original.subtotalCents) {
      return {
        subtotalCents,
        btwCents: -input.original.btwCents,
        totalCents: -input.original.totalCents,
      };
    }

    const btwCents = -Math.round((-subtotalCents * input.original.btwPct) / 100);
    return { subtotalCents, btwCents, totalCents: subtotalCents + btwCents };
  }

  // modus: vrij bedrag
  if (input.inclBtw) {
    const totalCents = -input.amountCents;
    const subtotalCents = -Math.round(input.amountCents / (1 + input.btwPct / 100));
    const btwCents = totalCents - subtotalCents;
    return { subtotalCents, btwCents, totalCents };
  }
  const subtotalCents = -input.amountCents;
  const btwCents = -Math.round((input.amountCents * input.btwPct) / 100);
  return { subtotalCents, btwCents, totalCents: subtotalCents + btwCents };
}

/**
 * Resterend credit-budget: debet-totaal + som van eerder geboekte credit-totalen
 * (die zijn ≤ 0). De RPC staat een nieuwe credit toe zolang |nieuw total| ≤
 * resterend + 1 cent (marge voor centenafronding over meerdere deelcredits).
 */
export function remainingCreditCents(debitTotalCents: number, existingCreditTotalsCents: number[]): number {
  const existingSum = existingCreditTotalsCents.reduce((sum, v) => sum + v, 0);
  return debitTotalCents + existingSum;
}

/**
 * Parseert een euro-bedrag uit vrije NL-tekstinvoer ("1.234,56") naar cents.
 * Duizendtal-punten worden gestript vóór de komma→punt-vervanging — anders levert
 * "1.234,56" een tweede decimaalteken op en leest `parseFloat` het stil af als
 * €1,23 in plaats van €1.234,56. Retourneert `null` bij invoer die niet als bedrag
 * parseert (i.p.v. de oude `|| 0`-stilzwijgende afwijzing) zodat de dialoog dat kan
 * onderscheiden van "nog niets ingevuld" (lege string → 0).
 */
export function parseEuroInputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}
