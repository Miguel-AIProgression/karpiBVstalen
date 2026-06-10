import type { SupabaseClient } from "@supabase/supabase-js";

export interface InvoiceLine {
  label: string;
  tag: "Collectie" | "Bundel" | "Staal";
  priceCents: number;
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
      .select("order_number, reference, email, shipping_street, shipping_postal_code, shipping_city, shipping_country, clients(name, client_number, contact_email)")
      .eq("id", orderId)
      .single(),
    supabase
      .from("order_lines")
      .select("id, quantity, sample_id, bundle_id, collection_id, price_cents")
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

  const lines = (linesRaw ?? []) as {
    id: string; quantity: number; sample_id: string | null;
    bundle_id: string | null; collection_id: string | null; price_cents: number | null;
  }[];

  // Haal collectie- en bundelnamen op
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
  const bundleMap = new Map((bundleRows.data ?? []).map(b => [b.id, b.name]));

  // Groepeer per collectie → bundel → los staal (zelfde logica als InvoiceSummary)
  const invoiceCollections = new Map<string, { name: string; priceCents: number }>();
  const invoiceBundles = new Map<string, { name: string; priceCents: number }>();
  let loosePriceCents = 0;
  let looseCount = 0;

  for (const l of lines) {
    const price = l.price_cents ?? 0;
    if (l.collection_id) {
      if (!invoiceCollections.has(l.collection_id)) {
        invoiceCollections.set(l.collection_id, { name: collMap.get(l.collection_id) ?? "Collectie", priceCents: price });
      }
    } else if (l.bundle_id) {
      if (!invoiceBundles.has(l.bundle_id)) {
        invoiceBundles.set(l.bundle_id, { name: bundleMap.get(l.bundle_id) ?? "Bundel", priceCents: price });
      }
    } else {
      loosePriceCents += price * l.quantity;
      looseCount += l.quantity;
    }
  }

  const invoiceLines: InvoiceLine[] = [
    ...Array.from(invoiceCollections.values()).map(c => ({
      label: c.name,
      tag: "Collectie" as const,
      priceCents: c.priceCents,
    })),
    ...Array.from(invoiceBundles.values()).map(b => ({
      label: b.name,
      tag: "Bundel" as const,
      priceCents: b.priceCents,
    })),
    ...(loosePriceCents > 0 ? [{
      label: `Losse stalen (${looseCount} stuk${looseCount !== 1 ? "s" : ""})`,
      tag: "Staal" as const,
      priceCents: loosePriceCents,
    }] : []),
  ];

  const subtotalCents = invoiceLines.reduce((s, l) => s + l.priceCents, 0);
  const o = orderRow as any;
  const client = o.clients ?? {};

  return {
    orderNumber: o.order_number,
    orderReference: o.reference ?? null,
    clientName: client.name ?? "Onbekend",
    clientNumber: client.client_number ?? null,
    clientEmail: o.email ?? client.contact_email ?? null,
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
