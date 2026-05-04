/**
 * Shortages-compute over het Voorraadbeeld.
 *
 * Dit is een dunne wrapper rond `buildShortages` uit `lib/productie/planning.ts`.
 * De wrapper converteert het `Voorraadbeeld`-shape (sample-driven, met `id` +
 * `articleNumber`, zonder display-velden) naar de losse Maps/arrays die
 * `buildShortages` van oudsher verwacht en delegeert daarna.
 *
 * ## Waarom een tweede `planningSamples`-parameter?
 *
 * `buildShortages` leest van zijn `SampleInfo`-Map de display-velden
 * `qualityName`, `colorName`, `hexColor` en `dimensionName` (zie
 * `planning.ts` regels 135-138 voor backorder-rows en regels 159-165 voor
 * minimum-rows). Het Voorraadbeeld's `SampleInfo` heeft die velden bewust NIET
 * — het Voorraadbeeld is sample-driven en denormaliseert niet (zie comment in
 * `types.ts` regel 14-17).
 *
 * In plaats van display-velden onderdeel van het Voorraadbeeld te maken
 * (vervuilt het read-model) of binnen de wrapper extra Supabase-fetches te
 * doen (vervuilt de seam), accepteert de wrapper expliciet een tweede
 * `planningSamples`-Map met de display-velden. De productie-pagina (T009)
 * heeft die toch al nodig naast het Voorraadbeeld en kan beide tegelijk
 * doorgeven.
 *
 * Wanneer `planningSamples` weggelaten wordt:
 *  - backorder-rows: `qualityName`/`colorName` → "Onbekend", `hexColor` → null,
 *    `dimensionName` → "" (consistent met `buildShortages` zijn eigen
 *    fallback-gedrag voor onbekende keys).
 *  - minimum-rows: idem; we leveren een synthetische planning-`SampleInfo`
 *    voor élke sample uit het Voorraadbeeld zodat `buildShortages` de
 *    `minStock`-loop correct uitvoert.
 */

import {
  buildShortages,
  type OrderDemand as PlanningOrderDemand,
  type SampleInfo as PlanningSampleInfo,
  type ShortageRow,
} from "@/lib/productie/planning";
import type { StockKey, Voorraadbeeld } from "./types";

export type { ShortageRow } from "@/lib/productie/planning";

export interface BuildShortagesFromVoorraadbeeldOptions {
  /** Default 7 — doorgegeven aan `buildShortages`. */
  readonly leadTimeDays?: number;
  /**
   * Display-velden per stock-key (qualityName, colorName, hexColor,
   * dimensionName). Wanneer een key ontbreekt valt de wrapper terug op
   * "Onbekend"/null/"".
   */
  readonly planningSamples?: ReadonlyMap<StockKey, PlanningSampleInfo>;
}

/**
 * Bouw een lijst tekorten ({@link ShortageRow}) uit een `Voorraadbeeld`.
 *
 * De output is identiek aan wat `buildShortages` zelf zou produceren wanneer
 * je hetzelfde Voorraadbeeld in de oude losse-Maps-vorm zou aanleveren —
 * zie `shortages.test.ts` voor de equivalence-asserties.
 */
export function buildShortagesFromVoorraadbeeld(
  vb: Voorraadbeeld,
  opts: BuildShortagesFromVoorraadbeeldOptions = {},
): ShortageRow[] {
  const { leadTimeDays, planningSamples } = opts;

  // Bouw een planning-`SampleInfo`-Map voor elke sample uit het Voorraadbeeld.
  // Voor display-velden gebruiken we (in volgorde):
  //   1. de meegegeven `planningSamples`-entry (caller-supplied, denormaliseerd);
  //   2. fallback-strings — consistent met `buildShortages` eigen gedrag voor
  //      onbekende keys (regels 135-138 in planning.ts).
  const samples = new Map<StockKey, PlanningSampleInfo>();
  for (const [key, info] of vb.samplesByKey.entries()) {
    const display = planningSamples?.get(key);
    samples.set(key, {
      qualityId: info.qualityId,
      colorCodeId: info.colorCodeId,
      dimensionId: info.dimensionId,
      qualityName: display?.qualityName ?? "Onbekend",
      colorName: display?.colorName ?? "Onbekend",
      hexColor: display?.hexColor ?? null,
      dimensionName: display?.dimensionName ?? "",
      minStock: info.minStock,
    });
  }

  // Converteer Voorraadbeeld-orders → planning-orders.
  // `Date | null` → `string | null` (YYYY-MM-DD, UTC).
  // `OrderLineDemand` → `{ sampleKeys: [stockKey], quantity }`.
  const orders: PlanningOrderDemand[] = vb.openOrders.map((order) => ({
    deliveryDate: dateToIsoDay(order.deliveryDate),
    lines: order.lines.map((line) => ({
      sampleKeys: [line.stockKey],
      quantity: line.quantity,
    })),
  }));

  return buildShortages({
    today: vb.today,
    samples,
    finishedStock: vb.finishedStock,
    orders,
    leadTimeDays,
  });
}

/**
 * Format een UTC-Date als `YYYY-MM-DD`. `null` blijft `null` zodat orders
 * zonder leverdatum hun deadline-loze status behouden.
 */
function dateToIsoDay(d: Date | null): string | null {
  if (d === null) return null;
  return d.toISOString().slice(0, 10);
}
