/**
 * Fulfillability — bepaalt per open order of alle regels uit de huidige
 * `finishedStock` geleverd kunnen worden.
 *
 * Algoritme: FIFO over orders in de volgorde die de read-laag al heeft
 * gesorteerd op `(deliveryDate ASC NULLS LAST, orderNumber ASC)`. Per regel
 * wordt het minimum van `needed` en de resterende voorraad voor de
 * `StockKey` toegewezen; de werkkopie van de voorraadmap wordt lokaal
 * gemuteerd. De `Voorraadbeeld`-input zelf wordt nooit gemuteerd.
 *
 * Status (Q7 = A, binair): `compleet` ⇔ elke regel `assigned === needed`
 * EN `legacyLineCount === 0`. Anders `onvolledig`.
 *
 * Pure functie. Geen `new Date()`, geen Supabase, geen async.
 */

import type { StockKey, Voorraadbeeld } from "./types";

export type FulfillmentStatus = "compleet" | "onvolledig";

export interface FulfillmentLineResult {
  readonly sampleId: string;
  readonly stockKey: StockKey;
  readonly needed: number;
  readonly assigned: number;
}

export interface OrderFulfillment {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: FulfillmentStatus;
  readonly deliveryDate: Date | null;
  readonly lines: ReadonlyArray<FulfillmentLineResult>;
  readonly legacyLineCount: number;
}

export function buildFulfillability(
  vb: Voorraadbeeld,
): ReadonlyMap<string, OrderFulfillment> {
  // Werkkopie zodat we vb.finishedStock niet muteren.
  const remaining = new Map<StockKey, number>(vb.finishedStock);
  const result = new Map<string, OrderFulfillment>();

  for (const order of vb.openOrders) {
    const lines: FulfillmentLineResult[] = [];
    let allLinesComplete = true;

    for (const line of order.lines) {
      const available = remaining.get(line.stockKey) ?? 0;
      const assigned = Math.min(line.quantity, available);
      if (assigned > 0) {
        remaining.set(line.stockKey, available - assigned);
      }
      if (assigned !== line.quantity) {
        allLinesComplete = false;
      }
      lines.push({
        sampleId: line.sampleId,
        stockKey: line.stockKey,
        needed: line.quantity,
        assigned,
      });
    }

    const status: FulfillmentStatus =
      allLinesComplete && order.legacyLineCount === 0 ? "compleet" : "onvolledig";

    result.set(order.orderId, {
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      status,
      deliveryDate: order.deliveryDate,
      lines,
      legacyLineCount: order.legacyLineCount,
    });
  }

  return result;
}
