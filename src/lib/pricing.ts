import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PRICE_LIST_NR } from "./articles";

/**
 * Prijssysteem (v3): per (price_list_nr, quality_id, carpet_dimension_id, unit) → prijs.
 *
 * - `unit = 'piece'`: stuksprijs voor een vaste carpet-afmeting
 * - `unit = 'm2'`:    m²-prijs voor maatwerk (carpet_dimension_id = NULL)
 *
 * `price_list_lines` slaat INKOOPprijzen op (wat de klant aan Karpi betaalt).
 * Voor stickers worden VERKOOPprijzen berekend met
 *   verkoop = roundTo5or9( inkoop × clients.price_factor )
 * Eén staal heeft dus geen single prijs — sticker toont een tabel + een m²-regel.
 */

export type CarpetPrice = {
  carpet_dimension_id: string;
  carpet_dimension_name: string;
  width_cm: number;
  height_cm: number;
  price_cents: number;
};

export type QualityPrices = {
  carpet_prices: CarpetPrice[];
  m2_price_cents: number | null;
};

export type PriceListContext = {
  list_nr: string;
  list_name: string;
};

const DEFAULT_PRICE_FACTOR = 2.5;

/** Rond af naar dichtstbijzijnde euro eindigend op 5, 9 of (decade-1). */
function roundTo5or9(cents: number): number {
  const rounded = Math.round(cents / 100);
  const base = Math.floor(rounded / 10) * 10;
  const candidates = [base - 1, base + 5, base + 9];
  let best = candidates[0];
  let bestDist = Math.abs(rounded - best);
  for (const c of candidates) {
    const dist = Math.abs(rounded - c);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best * 100;
}

/** verkoopprijs = roundTo5or9(inkoop × factor). Negatief/0 → 0. */
export function applySalesPrice(costCents: number, factor: number): number {
  if (costCents <= 0 || factor <= 0) return 0;
  return roundTo5or9(Math.round(costCents * factor));
}

/**
 * Resolveer prijslijst-nr en price_factor voor een klant.
 * Valt terug op de standaard-prijslijst en factor 2.5.
 */
async function resolveClientPricingContext(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ listNr: string; factor: number }> {
  const { data } = await supabase
    .from("clients")
    .select("price_list_nr, price_factor")
    .eq("id", clientId)
    .maybeSingle();
  const row = data as { price_list_nr: string | null; price_factor: number | string | null } | null;
  const factorRaw = row?.price_factor;
  const factor =
    factorRaw == null
      ? DEFAULT_PRICE_FACTOR
      : typeof factorRaw === "number"
        ? factorRaw
        : parseFloat(factorRaw) || DEFAULT_PRICE_FACTOR;
  return {
    listNr: row?.price_list_nr ?? DEFAULT_PRICE_LIST_NR,
    factor,
  };
}

async function loadPriceListMeta(
  supabase: SupabaseClient,
  listNr: string
): Promise<PriceListContext> {
  const { data } = await supabase
    .from("price_lists")
    .select("nr, name")
    .eq("nr", listNr)
    .maybeSingle();
  return {
    list_nr: (data?.nr as string | undefined) ?? listNr,
    list_name: (data?.name as string | undefined) ?? "Standaard",
  };
}

/**
 * Haal alle verkoopprijzen op per quality_id voor één klant: alle
 * standaard carpet-afmetingen + de m²-prijs voor maatwerk. Inkoopprijzen
 * uit de prijslijst van de klant worden vermenigvuldigd met
 * `clients.price_factor` en afgerond naar …5/…9/…(decade-1).
 *
 * De caller ontvangt Map<quality_id, QualityPrices> met carpet_prices
 * gesorteerd op width_cm × height_cm (klein → groot).
 */
export async function getCarpetPricesForQualities(
  supabase: SupabaseClient,
  clientId: string,
  qualityIds: string[]
): Promise<{
  ctx: PriceListContext;
  factor: number;
  pricesByQuality: Map<string, QualityPrices>;
}> {
  const { listNr, factor } = await resolveClientPricingContext(supabase, clientId);
  const ctx = await loadPriceListMeta(supabase, listNr);
  const pricesByQuality = new Map<string, QualityPrices>();

  if (qualityIds.length === 0) return { ctx, factor, pricesByQuality };

  const uniqueIds = Array.from(new Set(qualityIds));
  const { data } = await supabase
    .from("price_list_lines")
    .select(
      `quality_id, price_cents, unit,
       carpet_dimensions (id, name, width_cm, height_cm, active)`
    )
    .eq("price_list_nr", listNr)
    .in("quality_id", uniqueIds)
    .gt("price_cents", 0);

  type Row = {
    quality_id: string;
    price_cents: number;
    unit: "piece" | "m2";
    carpet_dimensions: {
      id: string;
      name: string;
      width_cm: number;
      height_cm: number;
      active: boolean | null;
    } | null;
  };

  function getOrCreate(qid: string): QualityPrices {
    let entry = pricesByQuality.get(qid);
    if (!entry) {
      entry = { carpet_prices: [], m2_price_cents: null };
      pricesByQuality.set(qid, entry);
    }
    return entry;
  }

  for (const row of (data ?? []) as unknown as Row[]) {
    if (row.unit === "m2") {
      const entry = getOrCreate(row.quality_id);
      entry.m2_price_cents = applySalesPrice(row.price_cents, factor);
      continue;
    }
    const cd = row.carpet_dimensions;
    if (!cd || cd.active === false) continue;
    const entry = getOrCreate(row.quality_id);
    entry.carpet_prices.push({
      carpet_dimension_id: cd.id,
      carpet_dimension_name: cd.name,
      width_cm: cd.width_cm,
      height_cm: cd.height_cm,
      price_cents: applySalesPrice(row.price_cents, factor),
    });
  }

  for (const entry of pricesByQuality.values()) {
    entry.carpet_prices.sort(carpetSort);
  }

  return { ctx, factor, pricesByQuality };
}

/**
 * Sticker-volgorde:
 *   1. rechthoekige afmetingen, klein → groot (oppervlak)
 *   2. ronde afmetingen, klein → groot (diameter)
 * Detectie van "rond" via de naam ("ROND") — `width == height` alleen klopt
 * niet, want vierkanten zoals 200x200 zijn óók width==height maar niet rond.
 */
function isRound(name: string): boolean {
  return /\bROND\b/i.test(name);
}

function carpetSort(a: CarpetPrice, b: CarpetPrice): number {
  const ar = isRound(a.carpet_dimension_name);
  const br = isRound(b.carpet_dimension_name);
  if (ar !== br) return ar ? 1 : -1;
  return a.width_cm * a.height_cm - b.width_cm * b.height_cm;
}
