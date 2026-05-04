/**
 * Voorraadbeeld read-laag — leest in één keer alle ruwe data van Supabase die
 * de drie compute-functies (`buildShortagesFromVoorraadbeeld`,
 * `buildFulfillability`, `buildSampleState`) nodig hebben en levert het terug
 * als immutable `Voorraadbeeld`-snapshot.
 *
 * Deze module is een dunne wrapper:
 *   - geen `new Date()` (de leesdatum wordt geïnjecteerd)
 *   - geen mutatie van inputs
 *   - geen business-logica (dat zit in de compute-modules)
 *
 * Open orders worden centraal gesorteerd op
 * `(deliveryDate ASC NULLS LAST, orderNumber ASC)` zodat compute-functies de
 * FIFO-volgorde kunnen aannemen (Q4 = B in de architectuur-ADR).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { stockKey } from "@/lib/productie/planning";
import type {
  OrderDemand,
  OrderLineDemand,
  SampleInfo,
  StockKey,
  Voorraadbeeld,
} from "./types";

/**
 * Minimale shape van wat we uit `samples` ophalen. Lokaal gedeclareerd zodat
 * we niet vastlopen op nested-select-typing in `Database`.
 */
interface RawSampleRow {
  id: string;
  article_number: string;
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  min_stock: number;
  location: string | null;
}

interface RawFinishedStockRow {
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  quantity: number;
}

interface RawOrderLineRow {
  id: string;
  sample_id: string | null;
  bundle_id: string | null;
  quantity: number | null;
  samples: {
    quality_id: string;
    color_code_id: string;
    dimension_id: string;
  } | null;
}

interface RawOrderRow {
  id: string;
  order_number: string;
  status: string;
  /** Schema zegt `string` maar runtime kan `null` zijn — defensief afgehandeld. */
  delivery_date: string | null;
  order_lines: RawOrderLineRow[] | null;
}

/**
 * Bouw één snapshot van de huidige werkelijkheid.
 *
 * @param supabase — getypeerde Supabase-client (browser of server).
 * @param today    — geïnjecteerde leesdatum; alle compute-functies gebruiken
 *                   deze waarde voor deterministische output.
 *
 * @throws `Error` als één van de drie queries een fout retourneert. Caller
 *          handelt af; we gooien hier expres ruw zodat React-error-boundaries
 *          (of API-routes) een eigen rapportage-strategie kunnen kiezen.
 */
export async function readVoorraadbeeld(
  supabase: SupabaseClient<Database>,
  today: Date,
): Promise<Voorraadbeeld> {
  const [samplesResult, finishedResult, ordersResult] = await Promise.all([
    supabase
      .from("samples")
      .select("id, article_number, quality_id, color_code_id, dimension_id, min_stock, location")
      .eq("active", true),
    supabase
      .from("finished_stock")
      .select("quality_id, color_code_id, dimension_id, quantity"),
    supabase
      .from("orders")
      .select(
        "id, order_number, status, delivery_date, order_lines(id, sample_id, bundle_id, quantity, samples(quality_id, color_code_id, dimension_id))",
      )
      .neq("status", "completed"),
  ]);

  if (samplesResult.error) {
    throw new Error(`Voorraadbeeld: kon samples niet laden — ${samplesResult.error.message}`);
  }
  if (finishedResult.error) {
    throw new Error(
      `Voorraadbeeld: kon finished_stock niet laden — ${finishedResult.error.message}`,
    );
  }
  if (ordersResult.error) {
    throw new Error(`Voorraadbeeld: kon orders niet laden — ${ordersResult.error.message}`);
  }

  const sampleRows = (samplesResult.data ?? []) as RawSampleRow[];
  const finishedRows = (finishedResult.data ?? []) as RawFinishedStockRow[];
  const orderRows = (ordersResult.data ?? []) as unknown as RawOrderRow[];

  const samplesByKey = new Map<StockKey, SampleInfo>();
  const samplesById = new Map<string, SampleInfo>();
  for (const row of sampleRows) {
    const info: SampleInfo = {
      id: row.id,
      articleNumber: row.article_number,
      qualityId: row.quality_id,
      colorCodeId: row.color_code_id,
      dimensionId: row.dimension_id,
      minStock: row.min_stock,
      location: row.location ?? null,
    };
    samplesByKey.set(stockKey(row.quality_id, row.color_code_id, row.dimension_id), info);
    samplesById.set(row.id, info);
  }

  // Finished_stock kan meerdere rijen per (quality, color, dimension) hebben
  // wegens variatie in finishing_type_id / location_id — wij sommeren zodat
  // de compute-laag alleen totalen ziet.
  const finishedStock = new Map<StockKey, number>();
  for (const row of finishedRows) {
    const key = stockKey(row.quality_id, row.color_code_id, row.dimension_id);
    finishedStock.set(key, (finishedStock.get(key) ?? 0) + row.quantity);
  }

  const openOrders: OrderDemand[] = orderRows.map((order) => {
    const rawLines = order.order_lines ?? [];

    const lines: OrderLineDemand[] = [];
    let legacyLineCount = 0;

    for (const line of rawLines) {
      if (line.bundle_id !== null && line.sample_id === null) {
        legacyLineCount += 1;
        continue;
      }
      if (line.sample_id === null) continue;
      if (line.quantity === null) continue;
      const s = line.samples;
      if (!s) continue;
      lines.push({
        sampleId: line.sample_id,
        stockKey: stockKey(s.quality_id, s.color_code_id, s.dimension_id),
        quantity: line.quantity,
      });
    }

    const deliveryDate = parseDeliveryDate(order.delivery_date);

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      deliveryDate,
      lines,
      legacyLineCount,
    };
  });

  openOrders.sort(compareOrderDemand);

  return {
    today,
    samplesByKey,
    samplesById,
    finishedStock,
    openOrders,
  };
}

/**
 * Parse een ISO-date-string (YYYY-MM-DD of vol-ISO) naar een UTC-`Date`. Het
 * Supabase-schema typeert `orders.delivery_date` als `string` maar runtime kan
 * de waarde `null`/`""` zijn (oude orders). Defensief: bij elke niet-parsebare
 * waarde geven we `null` terug, zodat de order achteraan in FIFO-volgorde komt.
 */
function parseDeliveryDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

/**
 * Sorteer-comparator: `(deliveryDate ASC NULLS LAST, orderNumber ASC)`.
 *
 * Orders zonder leverdatum gaan achteraan zodat compute-functies eerst de
 * geplande orders bedienen. OrderNumbers zijn in dit project lexicografisch
 * sorteerbaar (zero-padded), dus `localeCompare` is veilig.
 */
function compareOrderDemand(a: OrderDemand, b: OrderDemand): number {
  if (a.deliveryDate === null && b.deliveryDate === null) {
    return a.orderNumber.localeCompare(b.orderNumber);
  }
  if (a.deliveryDate === null) return 1;
  if (b.deliveryDate === null) return -1;

  const diff = a.deliveryDate.getTime() - b.deliveryDate.getTime();
  if (diff !== 0) return diff;
  return a.orderNumber.localeCompare(b.orderNumber);
}
