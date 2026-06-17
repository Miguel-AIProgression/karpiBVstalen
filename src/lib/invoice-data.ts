import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBillingRows, billingSubtotalCents } from "./billing";

export interface InvoiceLine {
  /** Displaynaam: kwaliteitsnaam + kleur, of bundel-/collectienaam voor losse headers */
  label: string;
  articleNumber: string | null;
  colorCode: string | null;
  /** Bundel- of collectienaam als dit staal er deel van uitmaakt */
  groupLabel: string | null;
  /** true voor het eerste staal in een bundel/collectie-groep → toon groepskop */
  isGroupStart: boolean;
  tag: "Collectie" | "Bundel" | "Staal";
  unitPriceCents: number;
  /** Totaal voor deze regel. Voor collectie/bundel = de groepsprijs (één keer); voor losse stalen = de staalprijs. */
  priceCents: number;
  quantity: number;
  dimensionName: string | null;
}

export interface InvoiceData {
  orderNumber: string;
  orderReference: string | null;
  clientName: string;
  clientNumber: string | null;
  billingAddress: { street: string | null; postalCode: string | null; city: string | null; country: string | null } | null;
  shippingAddress: { street: string | null; postalCode: string | null; city: string | null; country: string | null } | null;
  clientEmail: string | null;
  lines: InvoiceLine[];
  subtotalCents: number;
  company: {
    company_name: string | null;
    address_street: string | null;
    address_postal: string | null;
    address_city: string | null;
    address_country: string | null;
    phone: string | null;
    email: string | null;
    kvk_number: string | null;
    btw_number: string | null;
    iban: string | null;
    bic: string | null;
    bank_name: string | null;
    payment_days: number | null;
  } | null;
}

export async function loadInvoiceData(
  supabase: SupabaseClient,
  orderId: string,
  clientId: string
): Promise<InvoiceData | null> {
  const [
    { data: orderRow },
    { data: linesRaw },
    { data: addrRow },
    { data: companyRow },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("order_number, reference, email, email_invoice, shipping_street, shipping_postal_code, shipping_city, shipping_country, clients(name, client_number, contact_email, email_invoice)")
      .eq("id", orderId)
      .single(),
    supabase
      .from("order_lines")
      .select("id, quantity, sample_id, bundle_id, collection_id, price_cents, samples(article_number, qualities(name), color_codes(name, code), sample_dimensions(name))")
      .eq("order_id", orderId)
      .not("sample_id", "is", null),
    supabase
      .from("client_addresses")
      .select("street, postal_code, city, country")
      .eq("client_id", clientId)
      .eq("is_primary", true)
      .maybeSingle(),
    supabase
      .from("company_settings" as any)
      .select("company_name, address_street, address_postal, address_city, address_country, phone, email, kvk_number, btw_number, iban, bic, bank_name, payment_days")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle(),
  ]);

  if (!orderRow) return null;

  const lines = (linesRaw ?? []) as unknown as {
    id: string;
    quantity: number;
    sample_id: string | null;
    bundle_id: string | null;
    collection_id: string | null;
    price_cents: number | null;
    samples: {
      article_number: string | null;
      qualities: { name: string } | null;
      color_codes: { name: string; code: string } | null;
      sample_dimensions: { name: string } | null;
    } | null;
  }[];

  // Haal bundel- en collectienamen op
  const collectionIds = [...new Set(lines.map(l => l.collection_id).filter(Boolean))] as string[];
  const bundleIds = [...new Set(lines.map(l => l.bundle_id).filter(Boolean))] as string[];

  const [collRows, bundleRows] = await Promise.all([
    collectionIds.length > 0
      ? supabase.from("collections").select("id, name").in("id", collectionIds)
      : { data: [] as { id: string; name: string }[] },
    bundleIds.length > 0
      ? supabase.from("bundles").select("id, name").in("id", bundleIds)
      : { data: [] as { id: string; name: string }[] },
  ]);

  const collMap = new Map((collRows.data ?? []).map(c => [c.id, c.name]));
  const bundleMap = new Map((bundleRows.data ?? []).map((b: any) => [b.id, b.name]));

  // Groepeer via de gedeelde billing-seam: één collectie/bundel = één regel met
  // één prijs (geteld over de hele groep), losse stalen blijven per staal. Zo
  // tonen de Factuursamenvatting (orderdetail) en deze factuur exact hetzelfde.
  const billingRows = buildBillingRows(
    lines.map(l => ({
      lineId: l.id,
      bundleId: l.bundle_id,
      bundleName: l.bundle_id ? (bundleMap.get(l.bundle_id) ?? null) : null,
      collectionId: l.collection_id,
      collectionName: l.collection_id ? (collMap.get(l.collection_id) ?? null) : null,
      priceCents: l.price_cents ?? null,
      quantity: l.quantity,
      qualityName: l.samples?.qualities?.name ?? "",
      colorCode: l.samples?.color_codes?.code ?? null,
      colorName: l.samples?.color_codes?.name ?? null,
      articleNumber: l.samples?.article_number ?? null,
      dimensionName: l.samples?.sample_dimensions?.name ?? null,
    }))
  );

  const invoiceLines: InvoiceLine[] = billingRows.map(row => {
    const price = row.priceCents ?? 0;
    if (row.tag === "Staal") {
      const m = row.members[0];
      const label = [m.qualityName, m.colorName].filter(Boolean).join(" — ") || m.articleNumber || "Staal";
      return {
        label,
        articleNumber: m.articleNumber,
        colorCode: m.colorCode,
        groupLabel: null,
        isGroupStart: false,
        tag: "Staal",
        unitPriceCents: price,
        priceCents: price,
        quantity: row.totalQuantity,
        dimensionName: m.dimensionName,
      };
    }
    // Collectie of bundel → één samengevatte regel: "naam — N staaltjes = prijs".
    // De groepsprijs (price) is het TOTAAL voor het aantal bestelde sets (row.members[0].quantity,
    // gelijk over alle regels in de groep) — stukprijs = totaal / aantal sets.
    const staaltjes = `${row.sampleCount} staaltje${row.sampleCount === 1 ? "" : "s"}`;
    const quantity = row.members[0]?.quantity ?? 1;
    const unitPriceCents = quantity > 0 ? Math.round(price / quantity) : price;
    return {
      label: row.label,
      articleNumber: staaltjes,
      colorCode: null,
      groupLabel: null,
      isGroupStart: false,
      tag: row.tag,
      unitPriceCents,
      priceCents: price,
      quantity,
      dimensionName: row.dimensionName,
    };
  });

  const subtotalCents = billingSubtotalCents(billingRows);
  const o = orderRow as any;
  const client = o.clients ?? {};

  return {
    orderNumber: o.order_number,
    orderReference: o.reference ?? null,
    clientName: client.name ?? "Onbekend",
    clientNumber: client.client_number ?? null,
    clientEmail: o.email_invoice ?? client.email_invoice ?? o.email ?? client.contact_email ?? null,
    billingAddress: addrRow ? {
      street: addrRow.street ?? null,
      postalCode: addrRow.postal_code ?? null,
      city: addrRow.city ?? null,
      country: addrRow.country ?? null,
    } : null,
    shippingAddress: {
      street: o.shipping_street ?? null,
      postalCode: o.shipping_postal_code ?? null,
      city: o.shipping_city ?? null,
      country: o.shipping_country ?? null,
    },
    lines: invoiceLines,
    subtotalCents,
    company: (companyRow as any) ?? null,
  };
}

export function formatCents(cents: number): string {
  return "€ " + (cents / 100).toFixed(2).replace(".", ",");
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
}

export function calcBtw(subtotalCents: number, btwPct: number) {
  const btwCents = Math.round(subtotalCents * btwPct / 100);
  const totalCents = subtotalCents + btwCents;
  return { btwCents, totalCents };
}
