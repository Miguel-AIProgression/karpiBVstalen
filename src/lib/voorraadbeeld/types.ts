/**
 * Voorraadbeeld-types — read-model voor voorraad, fulfillability en tekorten.
 *
 * Zie `docs/architecture/decisions.md` ("Voorraadbeeld als seam") voor de
 * motivatie achter de zes Q-keuzes (StockKey-blijft-intern, FIFO op leesmoment,
 * binaire fulfillability, etc.).
 *
 * Deze module exporteert UITSLUITEND types + de `stockKey`-helper. Alle
 * compute- en read-laag zit elders (`fulfillability.ts`, `sample-state.ts`,
 * `snapshot.ts`).
 *
 * `StockKey` en `stockKey` worden hergebruikt uit `lib/productie/planning.ts`
 * zodat callers die op beide seams leunen (productie + voorraad) gegarandeerd
 * dezelfde sleutel-shape zien. `SampleInfo` is daarentegen een nieuwe,
 * sample-driven shape met `id` + `articleNumber` — bewust níet hergebruikt,
 * omdat planning.ts' `SampleInfo` op denormalised display-velden leunt
 * (qualityName, hexColor, …) die voor het Voorraadbeeld niet nodig zijn.
 */

import type { StockKey } from "@/lib/productie/planning";
export { stockKey, type StockKey } from "@/lib/productie/planning";

/**
 * Sample-meta zoals het Voorraadbeeld het ziet. Bevat de samengestelde
 * StockKey-componenten én de `id`/`articleNumber` zodat sample-driven
 * callers (orders, modals, stalen-overzicht) niet via de samengestelde
 * key terug-hoeven-resolven naar het sample.
 */
export interface SampleInfo {
  /** sample_id — UUID uit `samples.id`. */
  readonly id: string;
  /** `samples.article_number`, format `{quality_code}-{color_code}-{dim_short}`. */
  readonly articleNumber: string;
  readonly qualityId: string;
  readonly colorCodeId: string;
  readonly dimensionId: string;
  readonly minStock: number;
  /** `samples.location`, format `X-00-00` of `null` als nog niet toegewezen. */
  readonly location: string | null;
}

/**
 * Eén regel van een open order, gereduceerd tot de velden die de
 * fulfillability- en shortages-compute nodig hebben.
 *
 * Legacy `bundle_id`-only regels (zonder `sample_id`) staan NIET in deze
 * lijst — die worden via `OrderDemand.legacyLineCount` geteld.
 */
export interface OrderLineDemand {
  readonly sampleId: string;
  readonly stockKey: StockKey;
  readonly quantity: number;
}

/**
 * Eén open order binnen het Voorraadbeeld. De read-laag bepaalt centraal
 * welke statussen "open" zijn en sorteert orders op
 * `(deliveryDate ASC, orderNumber ASC)` voordat ze aan compute-functies
 * worden doorgegeven (FIFO-toewijzing, conform Q4 = B).
 */
export interface OrderDemand {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: string;
  /** `null` ⇒ order zonder leverdatum; gaat achteraan in FIFO-volgorde. */
  readonly deliveryDate: Date | null;
  readonly lines: ReadonlyArray<OrderLineDemand>;
  /**
   * Aantal `bundle_id`-only `order_lines` dat is geskipt (Q6 = A).
   * UI's kunnen hier een banner aan ophangen; compute-functies negeren ze.
   */
  readonly legacyLineCount: number;
}

/**
 * Het complete leesmodel — één snapshot van de huidige werkelijkheid voor
 * alle drie compute-functies (`buildShortagesFromVoorraadbeeld`,
 * `buildFulfillability`, `buildSampleState`).
 *
 * `samplesByKey` en `samplesById` indexeren dezelfde onderliggende
 * sample-set; consumenten kiezen de view die past bij hun lookup-pad
 * (Q1 = B: StockKey blijft intern, sample_id is óók beschikbaar).
 */
export interface Voorraadbeeld {
  /** Geïnjecteerde leesdatum — compute-functies lezen NOOIT `new Date()`. */
  readonly today: Date;
  readonly samplesByKey: ReadonlyMap<StockKey, SampleInfo>;
  readonly samplesById: ReadonlyMap<string, SampleInfo>;
  readonly finishedStock: ReadonlyMap<StockKey, number>;
  readonly openOrders: ReadonlyArray<OrderDemand>;
}
