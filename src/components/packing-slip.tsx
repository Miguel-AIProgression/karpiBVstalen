"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Printer } from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface SlipBundle {
  bundleId: string;
  bundleName: string;
  collectionName: string | null;
  karpiNaam: string | null;
  karpiQualityName: string;
  clientQualityName: string | null;
  dimensionName: string;
  colors: { code: string; name: string; articleNumber: string; karpiNaam: string | null; qualityName: string; finishingType: string | null; quantity: number; location: string | null }[];
  quantity: number;
  location: string | null;
}

interface SlipLooseLine {
  articleNumber: string;
  karpiQualityName: string;
  clientQualityName: string | null;
  colorCode: string;
  colorName: string;
  dimensionName: string;
  quantity: number;
  location: string | null;
}

interface CompanySettings {
  company_name: string | null;
  address_street: string | null;
  address_postal: string | null;
  address_city: string | null;
  address_country: string | null;
  phone: string | null;
  email: string | null;
}

interface InvoiceLine {
  label: string;
  tag: "Collectie" | "Bundel" | "Staal";
  priceCents: number | null;
}

interface SlipData {
  orderNumber: string;
  clientName: string;
  clientNumber: string | null;
  clientAddress: { street: string | null; postalCode: string | null; city: string | null; country: string | null } | null;
  deliveryDate: string;
  reference: string | null;
  notes: string | null;
  bundles: SlipBundle[];
  looseLines: SlipLooseLine[];
  invoiceLines: InvoiceLine[];
  company: CompanySettings | null;
}

interface PackingSlipProps {
  orderId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "intern" | "klant";
}

/* ─── Helpers ──────────────────────────────────────────── */

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
}

/* ─── Component ──────────────────────────────────────── */

export function PackingSlip({ orderId, clientId, open, onOpenChange, mode = "intern" }: PackingSlipProps) {
  const supabase = createClient();
  const [data, setData] = useState<SlipData | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    // 1. Order basis + klantinfo + bedrijfsinstellingen
    const [{ data: orderRow }, { data: addrRow }, { data: companyRow }] = await Promise.all([
      supabase.from("orders").select("order_number, delivery_date, notes, reference, clients(name, client_number)").eq("id", orderId).single(),
      supabase.from("client_addresses").select("street, postal_code, city, country").eq("client_id", clientId).eq("is_primary", true).maybeSingle(),
      supabase.from("company_settings" as any).select("company_name, address_street, address_postal, address_city, address_country, phone, email").eq("id", "00000000-0000-0000-0000-000000000001").maybeSingle(),
    ]);
    if (!orderRow) { setLoading(false); return; }

    // 2. Order lines met sample + bundle info
    const { data: linesRaw } = await supabase
      .from("order_lines")
      .select(`
        id, quantity, sample_id, bundle_id, collection_id, price_cents,
        samples(article_number, quality_id, location, description,
          qualities(name, code),
          color_codes(code, name),
          sample_dimensions(name),
          finishing_types(name)
        )
      `)
      .eq("order_id", orderId)
      .not("sample_id", "is", null)
      .order("bundle_id")
      .order("created_at");

    const lines = (linesRaw ?? []) as any[];

    // 3. Bundelnamen + collectienamen
    const bundleIds = [...new Set(lines.map((l) => l.bundle_id).filter(Boolean))] as string[];
    const collectionIds = [...new Set(lines.map((l) => l.collection_id).filter(Boolean))] as string[];
    const bundleNameMap = new Map<string, string>();
    const collectionNameMap = new Map<string, string>();
    if (bundleIds.length > 0) {
      const { data: bundles } = await supabase
        .from("bundles")
        .select("id, name, bundle_colors(position, color_codes(code))")
        .in("id", bundleIds);
      for (const b of bundles ?? []) {
        bundleNameMap.set(b.id, b.name);
        bundleColorOrder.set(b.id, (b.bundle_colors ?? [])
          .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
          .map((bc: any) => bc.color_codes?.code ?? ""));
      }
    }
    if (collectionIds.length > 0) {
      const { data: colls } = await supabase.from("collections").select("id, name").in("id", collectionIds);
      for (const c of colls ?? []) collectionNameMap.set(c.id, c.name);
    }

    // 4. Klant eigen namen
    const qualityIds = [...new Set(lines.map((l) => l.samples?.quality_id).filter(Boolean))] as string[];
    const customNameMap = new Map<string, string>();
    if (qualityIds.length > 0) {
      const { data: customNames } = await supabase
        .from("client_quality_names")
        .select("quality_id, custom_name")
        .eq("client_id", clientId)
        .in("quality_id", qualityIds);
      for (const cn of customNames ?? []) customNameMap.set(cn.quality_id, cn.custom_name);
    }

    // 5. Groepeer per bundel
    const bundleMap = new Map<string, SlipBundle>();
    const looseLines: SlipLooseLine[] = [];

    for (const line of lines) {
      const s = line.samples;
      if (!s) continue;
      const qty = line.quantity ?? 1;
      const karpiName = s.qualities?.name ?? "?";
      const clientName = customNameMap.get(s.quality_id) ?? null;
      const dimName = s.sample_dimensions?.name ?? "";
      const location = s.location ?? null;

      if (line.bundle_id) {
        if (!bundleMap.has(line.bundle_id)) {
          bundleMap.set(line.bundle_id, {
            bundleId: line.bundle_id,
            bundleName: bundleNameMap.get(line.bundle_id) ?? "Bundel",
            collectionName: line.collection_id ? (collectionNameMap.get(line.collection_id) ?? null) : null,
            karpiNaam: s.description ?? null,
            karpiQualityName: karpiName,
            clientQualityName: clientName,
            dimensionName: dimName,
            colors: [],
            quantity: qty,
            location,
          });
        }
        bundleMap.get(line.bundle_id)!.colors.push({
          code: s.color_codes?.code ?? "",
          name: s.color_codes?.name ?? "",
          articleNumber: s.article_number,
          karpiNaam: s.description ?? null,
          qualityName: karpiName,
          finishingType: s.finishing_types?.name ?? null,
          quantity: qty,
          location: s.location ?? null,
        });
      } else {
        looseLines.push({
          articleNumber: s.article_number,
          karpiQualityName: karpiName,
          clientQualityName: clientName,
          colorCode: s.color_codes?.code ?? "",
          colorName: s.color_codes?.name ?? "",
          dimensionName: dimName,
          quantity: qty,
          location,
        });
      }
    }

    // Sorteer kleuren binnen bundel op bundel-volgorde
    const bundles = Array.from(bundleMap.values()).map((b) => {
      const order = bundleColorOrder.get(b.bundleId) ?? [];
      if (order.length > 0) {
        b.colors.sort((a, z) => {
          const ai = order.indexOf(a.code);
          const zi = order.indexOf(z.code);
          return (ai === -1 ? 999 : ai) - (zi === -1 ? 999 : zi);
        });
      }
      return b;
    });

    // Invoice lines bouwen (gegroepeerd per collectie / bundel / los staal)
    const invoiceCollections = new Map<string, { name: string; priceCents: number | null }>();
    const invoiceBundles = new Map<string, { name: string; priceCents: number | null }>();
    const invoiceLoose: { name: string; priceCents: number | null; qty: number }[] = [];
    for (const line of lines) {
      const s = line.samples;
      if (!s) continue;
      if (line.collection_id) {
        if (!invoiceCollections.has(line.collection_id)) {
          invoiceCollections.set(line.collection_id, { name: collectionNameMap.get(line.collection_id) ?? "Collectie", priceCents: line.price_cents ?? null });
        }
      } else if (line.bundle_id) {
        if (!invoiceBundles.has(line.bundle_id)) {
          invoiceBundles.set(line.bundle_id, { name: bundleNameMap.get(line.bundle_id) ?? "Bundel", priceCents: line.price_cents ?? null });
        }
      } else {
        const qualName = (customNameMap.get(s.quality_id) ?? s.qualities?.name ?? "?");
        invoiceLoose.push({ name: `${qualName} ${s.color_codes?.code ?? ""}`.trim(), priceCents: line.price_cents ?? null, qty: line.quantity ?? 1 });
      }
    }
    const invoiceLines: InvoiceLine[] = [
      ...Array.from(invoiceCollections.values()).map(r => ({ label: r.name, tag: "Collectie" as const, priceCents: r.priceCents })),
      ...Array.from(invoiceBundles.values()).map(r => ({ label: r.name, tag: "Bundel" as const, priceCents: r.priceCents })),
      ...invoiceLoose.map(r => ({ label: `${r.name} ×${r.qty}`, tag: "Staal" as const, priceCents: r.priceCents != null ? r.priceCents * r.qty : null })),
    ];

    setData({
      orderNumber: (orderRow as any).order_number,
      clientName: (orderRow as any).clients?.name ?? "Onbekend",
      clientNumber: (orderRow as any).clients?.client_number ?? null,
      clientAddress: addrRow ? {
        street: addrRow.street ?? null,
        postalCode: addrRow.postal_code ?? null,
        city: addrRow.city ?? null,
        country: addrRow.country ?? null,
      } : null,
      deliveryDate: (orderRow as any).delivery_date,
      reference: (orderRow as any).reference ?? null,
      notes: (orderRow as any).notes,
      bundles,
      looseLines,
      invoiceLines,
      company: (companyRow as CompanySettings | null) ?? null,
    });
    setLoading(false);
  }, [supabase, orderId, clientId]);

  useEffect(() => { if (open) loadData(); }, [open, loadData]);

  if (!open) return null;

  const totalStalen = (data?.bundles ?? []).reduce((s, b) => s + b.colors.length * b.quantity, 0)
    + (data?.looseLines ?? []).reduce((s, l) => s + l.quantity, 0);
  const totalBundles = data?.bundles.length ?? 0;

  function SlipContent() {
    if (!data) return null;
    return (
      <div className="packing-slip-content bg-white text-black text-[11px] leading-tight">
        {/* Header — compact 2-kolom */}
        <div className="border-b-2 border-black pb-2 mb-3">
          {/* Rij 1: pakbon label + ordernummer + datum | logo */}
          <div className="flex items-start justify-between">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{mode === "klant" ? "Pakbon" : "Pakbon Intern"}</span>
              <span className="text-sm font-bold text-gray-800">{data.orderNumber}</span>
              {data.reference && <span className="text-[10px] text-gray-500">Ref: {data.reference}</span>}
              <span className="text-[10px] text-gray-400">{formatDate(data.deliveryDate)}</span>
            </div>
            <img src="/karpi-logo.svg" alt="Karpi Group" className="h-8 w-auto shrink-0 ml-4" />
          </div>

          {/* Rij 2: klant links | karpi gegevens rechts */}
          <div className="flex items-start justify-between mt-1.5">
            {/* Klantblok */}
            <div>
              <p className="text-base font-bold leading-tight">{data.clientName}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {[
                  data.clientNumber ? `Debiteur ${data.clientNumber}` : null,
                  data.clientAddress?.street,
                  [data.clientAddress?.postalCode, data.clientAddress?.city].filter(Boolean).join(" "),
                  data.clientAddress?.country,
                ].filter(Boolean).join("  ·  ")}
              </p>
            </div>

            {/* Karpi-blok */}
            <div className="text-right text-[9px] text-gray-400 leading-snug ml-4 shrink-0">
              {data.company && (
                <>
                  <p>{[data.company.address_street, [data.company.address_postal, data.company.address_city].filter(Boolean).join(" ")].filter(Boolean).join("  ·  ")}</p>
                  <p>{[data.company.phone, data.company.email].filter(Boolean).join("  ·  ")}</p>
                </>
              )}
              <p className="mt-0.5 text-gray-300">{totalBundles} bundels · {totalStalen} stalen</p>
            </div>
          </div>
        </div>

        {/* Bundels gegroepeerd per collectie */}
        {data.bundles.length > 0 && (() => {
          // Groepeer op collectienaam
          const collGroups = new Map<string, SlipBundle[]>();
          for (const b of data.bundles) {
            const key = b.collectionName ?? "—";
            if (!collGroups.has(key)) collGroups.set(key, []);
            collGroups.get(key)!.push(b);
          }
          const totalStk = data.bundles.reduce((s, b) => s + b.colors.length * b.quantity, 0);
          return (
            <table className="w-full border-collapse mb-4">
              <thead>
                <tr className="border-b border-black text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="py-1 text-left w-[110px]">Bundel</th>
                  <th className="py-1 text-left">Stalen (volgorde bundelen)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(collGroups.entries()).map(([collName, bundles]) => (
                  <>
                    <tr key={`coll-${collName}`}>
                      <td colSpan={2} className="pt-3 pb-1">
                        <div style={{background:"#f3f4f6",padding:"4px 8px",borderRadius:"4px"}}>
                          <span style={{fontSize:"8px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#9ca3af",display:"block"}}>Collectie</span>
                          <span style={{fontSize:"11px",fontWeight:700,color:"#111827"}}>{collName}</span>
                        </div>
                      </td>
                    </tr>
                    {bundles.map((b, i) => (
                      <tr key={b.bundleId} className={`align-top border-b border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50"}`}>
                        <td className="py-2 pr-3 align-top">
                          <div className="font-semibold">{b.bundleName}</div>
                          {b.quantity > 1 && (
                            <div className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-black px-1.5 py-0.5 text-[10px] font-bold text-white">
                              × {b.quantity}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex flex-col gap-0.5">
                            {b.colors.map((c, ci) => (
                              <div key={ci} className="flex items-baseline gap-1.5">
                                <span className="text-[9px] text-gray-400 w-4 text-right shrink-0 tabular-nums">{ci + 1}.</span>
                                {mode === "intern" && (
                                  <span className="font-semibold text-gray-900 min-w-[80px]">{c.karpiNaam ?? c.qualityName}</span>
                                )}
                                <span className="text-gray-500 text-[10px]">{c.qualityName}</span>
                                <span className="font-mono font-bold text-gray-800">{c.code}</span>
                                {mode === "intern" && c.finishingType && (
                                  <span className="text-[9px] text-gray-400 italic">({c.finishingType})</span>
                                )}
                                {c.quantity > 1 && (
                                  <span className="ml-1 rounded bg-black px-1 py-0.5 text-[9px] font-bold text-white">× {c.quantity}</span>
                                )}
                                {mode === "intern" && c.location && (
                                  <span className="ml-auto font-mono text-[10px] text-blue-600 font-semibold">{c.location}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black">
                  <td className="py-1 font-bold" colSpan={2}>Totaal bundels</td>
                  <td className="py-1 text-right font-bold">{totalStk} stalen</td>
                </tr>
              </tfoot>
            </table>
          );
        })()}

        {/* Losse stalen */}
        {data.looseLines.length > 0 && (
          <>
            <p className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Losse stalen</p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="py-1 text-left">Artikelnr</th>
                  <th className="py-1 text-left">Kwaliteit</th>
                  <th className="py-1 text-left">Kleur</th>
                  <th className="py-1 text-left">Afm.</th>
                  <th className="py-1 text-right">Stuks</th>
                  <th className="py-1 text-right">Locatie</th>
                </tr>
              </thead>
              <tbody>
                {data.looseLines.map((l, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-1 font-mono text-[10px]">{l.articleNumber}</td>
                    <td className="py-1">{l.clientQualityName ?? l.karpiQualityName}</td>
                    <td className="py-1">{l.colorCode}</td>
                    <td className="py-1 text-gray-500">{l.dimensionName}</td>
                    <td className="py-1 text-right">{l.quantity}</td>
                    <td className="py-1 text-right text-gray-500">{l.location ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Notities */}
        {data.notes && (
          <div className="mt-3 border-t border-gray-300 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Opmerkingen</p>
            <p className="mt-0.5">{data.notes}</p>
          </div>
        )}

        {/* Factuursamenvatting — alleen op klantpakbon */}
        {mode === "klant" && data.invoiceLines.some(l => l.priceCents != null) && (() => {
          const fmt = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;
          const total = data.invoiceLines.reduce((s, l) => s + (l.priceCents ?? 0), 0);
          return (
            <div className="mt-4 border-t-2 border-black pt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Factuursamenvatting</p>
              <table className="w-full border-collapse">
                <tbody>
                  {data.invoiceLines.map((line, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-0.5 text-[9px] text-gray-400 uppercase pr-2 w-16">{line.tag}</td>
                      <td className="py-0.5">{line.label}</td>
                      <td className="py-0.5 text-right font-semibold">
                        {line.priceCents != null ? fmt(line.priceCents) : "—"}
                      </td>
                    </tr>
                  ))}
                  {data.invoiceLines.length > 1 && (
                    <tr className="border-t border-black">
                      <td className="pt-1" />
                      <td className="pt-1 font-bold">Totaal</td>
                      <td className="pt-1 text-right font-bold">{fmt(total)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .packing-slip-print-root, .packing-slip-print-root * { visibility: visible !important; }
          .packing-slip-print-root {
            position: absolute !important; left: 0; top: 0;
            width: 100%; padding: 12mm 15mm; box-sizing: border-box;
          }
          @page { size: A4; margin: 8mm; }
        }
        @media screen { .packing-slip-print-root { display: none !important; } }
      `}</style>

      <div className="packing-slip-print-root" ref={printRef}>
        <SlipContent />
      </div>

      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-background ring-1 ring-border shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">{mode === "klant" ? "Pakbon klant" : "Pakbon intern"} — {data?.orderNumber}</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => window.print()} disabled={loading || !data}>
                <Printer size={14} /> Afdrukken
              </Button>
              <button onClick={() => onOpenChange(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <p className="text-center text-sm text-muted-foreground">Laden...</p>
            ) : !data ? (
              <p className="text-center text-sm text-muted-foreground">Geen data gevonden.</p>
            ) : (
              <div className="mx-auto rounded-lg border border-border bg-white p-8 shadow-sm">
                <SlipContent />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Module-level cache voor bundel kleur-volgorde
const bundleColorOrder = new Map<string, string[]>();
