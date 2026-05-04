/**
 * SampleState — per-sample geaggregeerde voorraadstand voor het Voorraadbeeld.
 *
 * Combineert `vb.finishedStock` (per StockKey) met de FIFO-toewijzingen uit
 * `buildFulfillability` om per sample de `reserved` (= som van `assigned`
 * over alle open-order-regels die naar dit sample wijzen) en de `available`
 * (= `finished - reserved`) te berekenen. `belowMinimum` triggert als
 * `available <= sample.minStock` ("op de drempel" telt al als onder-minimum,
 * conform UI-conventie voor productie-tekorten).
 *
 * Pure functie. Geen `new Date()`, geen Supabase, geen async, geen mutatie
 * van `vb` of `fulfillment`. `available` mag niet negatief worden zolang
 * `buildFulfillability` zich aan zijn invariant houdt (`assigned ≤ finished`),
 * maar de berekening klemt niet bij 0 zodat caller-bugs zichtbaar blijven
 * i.p.v. stilletjes ingeslikt.
 */

import { stockKey, type StockKey } from "@/lib/productie/planning";
import type { Voorraadbeeld } from "./types";
import { buildFulfillability, type OrderFulfillment } from "./fulfillability";

export interface SampleState {
  readonly sampleId: string;
  readonly articleNumber: string;
  readonly stockKey: StockKey;
  readonly finished: number;
  readonly reserved: number;
  readonly available: number;
  readonly belowMinimum: boolean;
}

export function buildSampleState(
  vb: Voorraadbeeld,
): ReadonlyMap<string, SampleState> {
  return buildSampleStateFromFulfillment(vb, buildFulfillability(vb));
}

export function buildSampleStateFromFulfillment(
  vb: Voorraadbeeld,
  fulfillment: ReadonlyMap<string, OrderFulfillment>,
): ReadonlyMap<string, SampleState> {
  // Pre-aggregate reserved per sampleId in één pass over fulfillment,
  // zodat we niet per sample alle orders opnieuw aflopen.
  const reservedBySampleId = new Map<string, number>();
  for (const f of fulfillment.values()) {
    for (const l of f.lines) {
      reservedBySampleId.set(
        l.sampleId,
        (reservedBySampleId.get(l.sampleId) ?? 0) + l.assigned,
      );
    }
  }

  const result = new Map<string, SampleState>();
  for (const sample of vb.samplesById.values()) {
    const key = stockKey(sample.qualityId, sample.colorCodeId, sample.dimensionId);
    const finished = vb.finishedStock.get(key) ?? 0;
    const reserved = reservedBySampleId.get(sample.id) ?? 0;
    const available = finished - reserved;
    const belowMinimum = available <= sample.minStock;
    result.set(sample.id, {
      sampleId: sample.id,
      articleNumber: sample.articleNumber,
      stockKey: key,
      finished,
      reserved,
      available,
      belowMinimum,
    });
  }
  return result;
}
