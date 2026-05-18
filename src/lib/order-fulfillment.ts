import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCarpetPricesForQualities,
  type CarpetPrice,
  type PriceListContext,
  type QualityPrices,
} from "./pricing";

/**
 * Order fulfillment — wat zit er in deze order, uitgepakt naar staal-niveau,
 * met klant-context (logo, eigen kwaliteitsnamen) en carpet-prijzen per
 * kwaliteit (uit de prijslijst van de klant).
 *
 * Strict sample-driven: legacy `order_lines.bundle_id` zonder `sample_id`
 * worden NIET geëxpandeerd. Run eerst `20260503_order_lines_sample_id.sql`
 * om die regels naar sample-niveau om te zetten.
 *
 * Voorraad zit hier niet in — dat is dynamische runtime-state, niet eigendom
 * van de order. Order-detail loadt voorraad apart.
 */

export interface FulfillmentClient {
  id: string;
  name: string;
  logoUrl: string | null;
  priceListNr: string | null;
}

export interface FulfillmentOrderInfo {
  id: string;
  orderNumber: string;
  deliveryDate: string;
  status: string;
  notes: string | null;
  reference: string | null;
  shippingStreet: string | null;
  shippingPostalCode: string | null;
  shippingCity: string | null;
  shippingCountry: string | null;
  showPricesOnSticker: boolean;
  priceFactor: number;
  stickerNameType: "karpi" | "client";
}

export interface FulfillmentLine {
  lineId: string;
  sampleId: string;
  bundleId: string | null;
  bundleName: string | null;
  collectionId: string | null;
  collectionName: string | null;
  articleNumber: string;
  qualityId: string;
  /** Karpi-naam (altijd de eigen naam uit de qualities tabel). */
  qualityKarpiName: string;
  /** Klant-eigen naam als die bestaat, anders de Karpi-naam. */
  qualityName: string;
  qualityCode: string;
  materialType: string | null;
  colorCode: string;
  colorName: string;
  hexColor: string | null;
  /** De afmeting van het sample-kaartje zelf (bv. "30x50"). NIET de carpet-prijs-afmeting. */
  dimensionName: string;
  location: string | null;
  quantity: number;
  /** Vastgelegde factuurprijs op het moment van bestellen (collectie-, bundel- of staalprijs). */
  priceCents: number | null;
  /** Verkoopprijzen per standaard carpet-afmeting voor de kwaliteit van dit staal. */
  carpetPrices: CarpetPrice[];
  /** Verkoopprijs per m² voor maatwerk; null als geen m²-prijs in de prijslijst. */
  m2PriceCents: number | null;
  m2InkoopCents: number | null;
}

export interface FulfillmentTotals {
  totalQuantity: number;
  lineCount: number;
}

export interface Fulfillment {
  order: FulfillmentOrderInfo;
  client: FulfillmentClient;
  priceList: PriceListContext;
  lines: FulfillmentLine[];
  totals: FulfillmentTotals;
}

type RawOrder = {
  id: string;
  order_number: string;
  delivery_date: string;
  status: string;
  notes: string | null;
  reference: string | null;
  shipping_street: string | null;
  shipping_postal_code: string | null;
  shipping_city: string | null;
  shipping_country: string | null;
  price_factor: number | null;
  show_prices_on_sticker: boolean | null;
  sticker_name_type: string | null;
  clients: {
    id: string;
    name: string;
    logo_url: string | null;
    price_list_nr: string | null;
  } | null;
};

type RawSample = {
  id: string;
  article_number: string;
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  location: string | null;
  qualities: { id: string; name: string; code: string; material_type: string | null } | null;
  color_codes: { code: string; name: string; hex_color: string | null } | null;
  sample_dimensions: { name: string } | null;
};

type RawLine = {
  id: string;
  quantity: number;
  sample_id: string | null;
  bundle_id: string | null;
  collection_id: string | null;
  price_cents: number | null;
  created_at: string;
  samples: RawSample | null;
};

export async function getOrderFulfillment(
  supabase: SupabaseClient,
  orderId: string
): Promise<Fulfillment | null> {
  // 1. Order + klant in één call
  const { data: orderData } = await supabase
    .from("orders")
    .select(
      `id, order_number, delivery_date, status, notes, reference,
       shipping_street, shipping_postal_code, shipping_city, shipping_country,
       price_factor, show_prices_on_sticker, sticker_name_type,
       clients (id, name, logo_url, price_list_nr)`
    )
    .eq("id", orderId)
    .maybeSingle();

  const orderRow = orderData as unknown as RawOrder | null;
  if (!orderRow || !orderRow.clients) return null;
  const clientRow = orderRow.clients;

  // 2. Order_lines met samples — strict sample-driven (sample_id NOT NULL)
  const { data: linesData } = await supabase
    .from("order_lines")
    .select(
      `id, quantity, sample_id, bundle_id, collection_id, price_cents, created_at,
       samples (
         id, article_number, quality_id, color_code_id, dimension_id, location,
         qualities (id, name, code, material_type),
         color_codes (code, name, hex_color),
         sample_dimensions (name)
       )`
    )
    .eq("order_id", orderId)
    .not("sample_id", "is", null)
    .order("bundle_id")
    .order("created_at");

  const rawLines = (linesData ?? []) as unknown as RawLine[];
  const sampleLines = rawLines.filter((l): l is RawLine & { samples: RawSample } => !!l.samples);

  // 2b. Bundel- en collectienamen ophalen
  const bundleIds = [...new Set(sampleLines.map((l) => l.bundle_id).filter(Boolean))] as string[];
  const collectionIds = [...new Set(sampleLines.map((l) => l.collection_id).filter(Boolean))] as string[];
  const bundleNameMap = new Map<string, string>();
  const collectionNameMap = new Map<string, string>();

  await Promise.all([
    bundleIds.length > 0
      ? (async () => {
          const { data } = await supabase.from("bundles").select("id, name").in("id", bundleIds);
          for (const b of (data ?? []) as { id: string; name: string }[]) bundleNameMap.set(b.id, b.name);
        })()
      : Promise.resolve(),
    collectionIds.length > 0
      ? (async () => {
          const { data } = await supabase.from("collections").select("id, name").in("id", collectionIds);
          for (const c of (data ?? []) as { id: string; name: string }[]) collectionNameMap.set(c.id, c.name);
        })()
      : Promise.resolve(),
  ]);

  // 3. Klant-eigen kwaliteitsnamen — ALTIJD toepassen als de klant ze heeft.
  // `stickerNameType` op de order blijft bestaan voor andere doeleinden maar
  // gate de naam niet meer; klanten met eigen benamingen krijgen die altijd.
  const stickerNameType: "karpi" | "client" =
    orderRow.sticker_name_type === "client" ? "client" : "karpi";

  const customNameMap = new Map<string, string>();
  if (sampleLines.length > 0) {
    const qualityIdsForCustom = Array.from(
      new Set(sampleLines.map((l) => l.samples.quality_id))
    );
    const { data: customNames } = await supabase
      .from("client_quality_names")
      .select("quality_id, custom_name")
      .eq("client_id", clientRow.id)
      .in("quality_id", qualityIdsForCustom);
    for (const cn of (customNames ?? []) as { quality_id: string; custom_name: string }[]) {
      customNameMap.set(cn.quality_id, cn.custom_name);
    }
  }

  // 4. Verkoopprijzen per quality, uit de prijslijst van de klant
  const qualityIds = Array.from(new Set(sampleLines.map((l) => l.samples.quality_id)));
  const { ctx: priceList, pricesByQuality } = await getCarpetPricesForQualities(
    supabase,
    clientRow.id,
    qualityIds
  );
  const emptyPrices: QualityPrices = { carpet_prices: [], m2_price_cents: null, m2_inkoop_cents: null };

  // 5. Project naar FulfillmentLine
  const lines: FulfillmentLine[] = sampleLines.map((l) => {
    const s = l.samples;
    const karpiName = s.qualities?.name ?? "Onbekend";
    const qualityName = customNameMap.get(s.quality_id) ?? karpiName;

    const qp = pricesByQuality.get(s.quality_id) ?? emptyPrices;
    return {
      lineId: l.id,
      sampleId: s.id,
      bundleId: l.bundle_id ?? null,
      bundleName: l.bundle_id ? (bundleNameMap.get(l.bundle_id) ?? null) : null,
      collectionId: l.collection_id ?? null,
      collectionName: l.collection_id ? (collectionNameMap.get(l.collection_id) ?? null) : null,
      priceCents: l.price_cents ?? null,
      articleNumber: s.article_number,
      qualityId: s.quality_id,
      qualityKarpiName: karpiName,
      qualityName,
      qualityCode: s.qualities?.code ?? "",
      materialType: s.qualities?.material_type ?? null,
      colorCode: s.color_codes?.code ?? "",
      colorName: s.color_codes?.name ?? "",
      hexColor: s.color_codes?.hex_color ?? null,
      dimensionName: s.sample_dimensions?.name ?? "",
      location: s.location,
      quantity: l.quantity,
      carpetPrices: qp.carpet_prices,
      m2PriceCents: qp.m2_price_cents,
      m2InkoopCents: qp.m2_inkoop_cents ?? null,
    };
  });

  const totals: FulfillmentTotals = {
    totalQuantity: lines.reduce((sum, ln) => sum + ln.quantity, 0),
    lineCount: lines.length,
  };

  const order: FulfillmentOrderInfo = {
    id: orderRow.id,
    orderNumber: orderRow.order_number,
    deliveryDate: orderRow.delivery_date,
    status: orderRow.status,
    notes: orderRow.notes,
    reference: orderRow.reference ?? null,
    shippingStreet: orderRow.shipping_street,
    shippingPostalCode: orderRow.shipping_postal_code,
    shippingCity: orderRow.shipping_city,
    shippingCountry: orderRow.shipping_country,
    showPricesOnSticker: orderRow.show_prices_on_sticker ?? true,
    priceFactor: orderRow.price_factor ?? 2.5,
    stickerNameType,
  };

  const client: FulfillmentClient = {
    id: clientRow.id,
    name: clientRow.name,
    logoUrl: clientRow.logo_url,
    priceListNr: clientRow.price_list_nr,
  };

  return { order, client, priceList, lines, totals };
}
