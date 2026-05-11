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
  colors: { code: string; name: string; articleNumber: string; karpiNaam: string | null }[];
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

interface SlipData {
  orderNumber: string;
  clientName: string;
  deliveryDate: string;
  reference: string | null;
  notes: string | null;
  bundles: SlipBundle[];
  looseLines: SlipLooseLine[];
}

interface PackingSlipProps {
  orderId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ─── Helpers ──────────────────────────────────────────── */

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
}

/* ─── Component ──────────────────────────────────────── */

export function PackingSlip({ orderId, clientId, open, onOpenChange }: PackingSlipProps) {
  const supabase = createClient();
  const [data, setData] = useState<SlipData | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    // 1. Order basis
    const { data: orderRow } = await supabase
      .from("orders")
      .select("order_number, delivery_date, notes, reference, clients(name)")
      .eq("id", orderId)
      .single();
    if (!orderRow) { setLoading(false); return; }

    // 2. Order lines met sample + bundle info
    const { data: linesRaw } = await supabase
      .from("order_lines")
      .select(`
        id, quantity, sample_id, bundle_id,
        samples(article_number, quality_id, location, description,
          qualities(name, code),
          color_codes(code, name),
          sample_dimensions(name)
        )
      `)
      .eq("order_id", orderId)
      .not("sample_id", "is", null)
      .order("bundle_id")
      .order("created_at");

    const lines = (linesRaw ?? []) as any[];

    // 3. Bundelnamen + collectienamen
    const bundleIds = [...new Set(lines.map((l) => l.bundle_id).filter(Boolean))] as string[];
    const bundleNameMap = new Map<string, string>();
    const collectionNameMap = new Map<string, string | null>();
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
      const { data: cbRows } = await supabase
        .from("collection_bundles")
        .select("bundle_id, collections(name)")
        .in("bundle_id", bundleIds);
      for (const cb of cbRows ?? []) {
        collectionNameMap.set(cb.bundle_id, (cb.collections as any)?.name ?? null);
      }
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
            collectionName: collectionNameMap.get(line.bundle_id) ?? null,
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

    setData({
      orderNumber: (orderRow as any).order_number,
      clientName: (orderRow as any).clients?.name ?? "Onbekend",
      deliveryDate: (orderRow as any).delivery_date,
      reference: (orderRow as any).reference ?? null,
      notes: (orderRow as any).notes,
      bundles,
      looseLines,
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
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-4">
          <div>
            <h1 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-none mb-1">Pakbon</h1>
            <p className="text-xl font-bold leading-tight">{data.clientName}</p>
            <p className="text-sm text-gray-500 mt-0.5">{data.orderNumber}</p>
            {data.reference && (
              <p className="text-sm font-semibold mt-0.5">Ref: {data.reference}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">{formatDate(data.deliveryDate)}</p>
            <p className="text-[10px] text-gray-400 mt-1">{totalBundles} bundels · {totalStalen} stalen</p>
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
                  <th className="py-1 text-left w-[90px]">Karpi naam</th>
                  <th className="py-1 text-left w-[80px]">Klantnaam</th>
                  <th className="py-1 text-left">Kleuren (volgorde)</th>
                  <th className="py-1 text-right w-[35px]">Stuks</th>
                  <th className="py-1 text-right w-[55px]">Locatie</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(collGroups.entries()).map(([collName, bundles]) => (
                  <>
                    <tr key={`coll-${collName}`}>
                      <td colSpan={6} className="pt-3 pb-1">
                        <div style={{background:"#f3f4f6",padding:"4px 8px",borderRadius:"4px"}}>
                          <span style={{fontSize:"8px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#9ca3af",display:"block"}}>Collectie</span>
                          <span style={{fontSize:"11px",fontWeight:700,color:"#111827"}}>{collName}</span>
                        </div>
                      </td>
                    </tr>
                    {bundles.map((b, i) => (
                      <tr key={b.bundleId} className={`align-top ${i % 2 === 0 ? "" : "bg-gray-50"}`}>
                        <td className="py-1.5 pr-2 font-semibold">{b.bundleName}</td>
                        <td className="py-1.5 pr-2 text-gray-700">{b.karpiNaam ?? "—"}</td>
                        <td className="py-1.5 pr-2 text-gray-600">{b.clientQualityName ?? "—"}</td>
                        <td className="py-1.5 pr-2">
                          <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                            {b.colors.map((c, ci) => (
                              <span key={ci} className="text-gray-700">
                                <span className="font-mono">{c.code}</span>
                                {ci < b.colors.length - 1 && <span className="text-gray-300 mx-0.5">·</span>}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-1.5 text-right font-semibold">{b.colors.length * b.quantity}</td>
                        <td className="py-1.5 text-right text-gray-500">{b.location ?? "—"}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black">
                  <td className="py-1 font-bold" colSpan={4}>Totaal bundels</td>
                  <td className="py-1 text-right font-bold">{totalStk}</td>
                  <td />
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
            <h2 className="text-lg font-semibold">Pakbon — {data?.orderNumber}</h2>
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
