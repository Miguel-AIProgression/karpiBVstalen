"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WerkbonSample {
  articleNumber: string;
  qualityName: string;
  colorCode: string;
  dimensionName: string;
  quantity: number;
  location: string | null;
}

interface WerkbonBundle {
  name: string;
  samples: WerkbonSample[];
}

interface WerkbonCollection {
  name: string;
  bundles: WerkbonBundle[];
}

interface WerkbonData {
  orderNumbers: string[];
  collections: WerkbonCollection[];
  loose: WerkbonSample[];
  totalCollections: number;
  totalBundles: number;
  totalSamples: number;
}

interface WerkbonModalProps {
  orderIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatToday() {
  return new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function WerkbonModal({ orderIds, open, onOpenChange }: WerkbonModalProps) {
  const supabase = createClient();
  const [data, setData] = useState<WerkbonData | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (!orderIds.length) return;
    setLoading(true);

    // 1. Order nummers
    const { data: ordersRaw } = await supabase
      .from("orders")
      .select("order_number")
      .in("id", orderIds);
    const orderNumbers = (ordersRaw ?? []).map((o: any) => o.order_number).sort();

    // 2. Alle order_lines voor de geselecteerde orders
    const { data: linesRaw } = await supabase
      .from("order_lines")
      .select(`
        quantity, bundle_id,
        samples(article_number, location, description,
          qualities(name),
          color_codes(code),
          sample_dimensions(name)
        )
      `)
      .in("order_id", orderIds)
      .not("sample_id", "is", null);

    const lines = (linesRaw ?? []) as any[];

    // 3. Bundel- en collectienamen ophalen
    const bundleIds = [...new Set(lines.map((l) => l.bundle_id).filter(Boolean))] as string[];
    const bundleNameMap = new Map<string, string>();
    const collectionNameMap = new Map<string, string>();

    if (bundleIds.length > 0) {
      const { data: bundleData } = await supabase
        .from("bundles").select("id, name").in("id", bundleIds);
      for (const b of bundleData ?? []) bundleNameMap.set(b.id, b.name);

      const { data: cbData } = await supabase
        .from("collection_bundles")
        .select("bundle_id, collections(name)")
        .in("bundle_id", bundleIds);
      for (const cb of (cbData ?? []) as any[]) {
        if (cb.collections?.name) collectionNameMap.set(cb.bundle_id, cb.collections.name);
      }
    }

    // 4. Aggregeer: collectie → bundel → staal → som aantallen
    const collMap = new Map<string, Map<string, Map<string, WerkbonSample>>>();
    const looseMap = new Map<string, WerkbonSample>();

    for (const line of lines) {
      const s = line.samples;
      if (!s) continue;
      const qty = line.quantity ?? 1;
      const key = s.article_number;
      const sample: WerkbonSample = {
        articleNumber: key,
        qualityName: s.qualities?.name ?? "?",
        colorCode: s.color_codes?.code ?? "?",
        dimensionName: s.sample_dimensions?.name ?? "?",
        quantity: qty,
        location: s.location ?? null,
      };

      if (line.bundle_id) {
        const collName = collectionNameMap.get(line.bundle_id) ?? "Geen collectie";
        const bundleName = bundleNameMap.get(line.bundle_id) ?? "Bundel";

        if (!collMap.has(collName)) collMap.set(collName, new Map());
        const bundleMap = collMap.get(collName)!;
        if (!bundleMap.has(bundleName)) bundleMap.set(bundleName, new Map());
        const sampleMap = bundleMap.get(bundleName)!;

        if (sampleMap.has(key)) {
          sampleMap.get(key)!.quantity += qty;
        } else {
          sampleMap.set(key, { ...sample });
        }
      } else {
        if (looseMap.has(key)) {
          looseMap.get(key)!.quantity += qty;
        } else {
          looseMap.set(key, { ...sample });
        }
      }
    }

    // 5. Naar gesorteerde structuur
    const collections: WerkbonCollection[] = Array.from(collMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([collName, bundleMap]) => ({
        name: collName,
        bundles: Array.from(bundleMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([bundleName, sampleMap]) => ({
            name: bundleName,
            samples: Array.from(sampleMap.values()).sort((a, b) => a.articleNumber.localeCompare(b.articleNumber)),
          })),
      }));

    const loose = Array.from(looseMap.values()).sort((a, b) => a.articleNumber.localeCompare(b.articleNumber));

    const totalBundles = collections.reduce((s, c) => s + c.bundles.length, 0);
    const totalSamples = collections.reduce((s, c) => s + c.bundles.reduce((bs, b) => bs + b.samples.reduce((ss, sa) => ss + sa.quantity, 0), 0), 0)
      + loose.reduce((s, l) => s + l.quantity, 0);

    setData({
      orderNumbers,
      collections,
      loose,
      totalCollections: collections.length,
      totalBundles,
      totalSamples,
    });
    setLoading(false);
  }, [supabase, orderIds]);

  useEffect(() => { if (open) loadData(); }, [open, loadData]);

  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Werkbon</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:20px}
      table{width:100%;border-collapse:collapse}
      th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:#666;padding:3px 4px;border-bottom:1px solid #000}
      td{padding:3px 4px;border-bottom:1px solid #eee}
      .coll-header{background:#f3f4f6;padding:6px 8px;margin:12px 0 4px;border-radius:4px}
      .coll-label{font-size:8px;font-weight:700;text-transform:uppercase;color:#9ca3af;display:block}
      .coll-name{font-size:13px;font-weight:700}
      .bundle-header{background:#fef3c7;padding:4px 8px;margin:6px 0 2px;border-left:3px solid #f59e0b;font-weight:700;font-size:11px}
      .bundle-label{font-size:8px;font-weight:700;text-transform:uppercase;color:#92400e;display:block}
      @media print{body{margin:10px}}
    </style></head><body>${content}</body></html>`);
    w.document.close();
    w.print();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-background shadow-xl ring-1 ring-border">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Werkbon</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data?.orderNumbers.join(", ")} · {formatToday()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer size={14} /> Afdrukken
            </Button>
            <button onClick={() => onOpenChange(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : !data ? null : (
            <div ref={printRef}>
              {/* Samenvatting */}
              <div className="mb-4 flex gap-6 text-sm">
                <div><span className="text-muted-foreground">Collecties:</span> <strong>{data.totalCollections}</strong></div>
                <div><span className="text-muted-foreground">Bundels:</span> <strong>{data.totalBundles}</strong></div>
                <div><span className="text-muted-foreground">Stalen totaal:</span> <strong>{data.totalSamples}</strong></div>
              </div>

              {/* Collecties */}
              {data.collections.map((coll) => (
                <div key={coll.name} className="mb-6">
                  {/* Niveau 1: Collectie */}
                  <div className="coll-header mb-3 rounded-xl bg-muted/60 px-4 py-2.5">
                    <span className="coll-label text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">Collectie</span>
                    <span className="coll-name text-base font-bold text-foreground">{coll.name}</span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      {coll.bundles.length} bundel{coll.bundles.length !== 1 ? "s" : ""} · {coll.bundles.reduce((s, b) => s + b.samples.reduce((ss, sa) => ss + sa.quantity, 0), 0)} stalen
                    </span>
                  </div>

                  {/* Niveau 2: Bundels */}
                  <div className="space-y-3 pl-3">
                    {coll.bundles.map((bundle) => (
                      <div key={bundle.name}>
                        <div className="bundle-header mb-1 flex items-center justify-between rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-1.5">
                          <div>
                            <span className="bundle-label text-[9px] font-bold uppercase tracking-widest text-amber-700 block">Bundel</span>
                            <span className="text-sm font-semibold text-foreground">{bundle.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {bundle.samples.reduce((s, sa) => s + sa.quantity, 0)} stalen
                          </span>
                        </div>

                        {/* Niveau 3: Stalen */}
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                              <th className="py-1 px-2 text-left font-medium">Artikel</th>
                              <th className="py-1 px-2 text-left font-medium">Kwaliteit</th>
                              <th className="py-1 px-2 text-left font-medium">Kleur</th>
                              <th className="py-1 px-2 text-left font-medium">Afm.</th>
                              <th className="py-1 px-2 text-left font-medium">Locatie</th>
                              <th className="py-1 px-2 text-right font-medium">Stuks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bundle.samples.map((sa, i) => (
                              <tr key={sa.articleNumber} className={`border-b border-border/30 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                                <td className="py-1.5 px-2 font-mono text-xs text-muted-foreground">{sa.articleNumber}</td>
                                <td className="py-1.5 px-2">{sa.qualityName}</td>
                                <td className="py-1.5 px-2">{sa.colorCode}</td>
                                <td className="py-1.5 px-2 text-muted-foreground">{sa.dimensionName}</td>
                                <td className="py-1.5 px-2 text-muted-foreground">{sa.location ?? "—"}</td>
                                <td className="py-1.5 px-2 text-right font-bold">{sa.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Losse stalen */}
              {data.loose.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 rounded-xl bg-muted/60 px-4 py-2.5">
                    <span className="text-sm font-bold">Losse stalen</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-1 px-2 text-left font-medium">Artikel</th>
                        <th className="py-1 px-2 text-left font-medium">Kwaliteit</th>
                        <th className="py-1 px-2 text-left font-medium">Kleur</th>
                        <th className="py-1 px-2 text-left font-medium">Afm.</th>
                        <th className="py-1 px-2 text-left font-medium">Locatie</th>
                        <th className="py-1 px-2 text-right font-medium">Stuks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.loose.map((sa, i) => (
                        <tr key={sa.articleNumber} className={`border-b border-border/30 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                          <td className="py-1.5 px-2 font-mono text-xs text-muted-foreground">{sa.articleNumber}</td>
                          <td className="py-1.5 px-2">{sa.qualityName}</td>
                          <td className="py-1.5 px-2">{sa.colorCode}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{sa.dimensionName}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{sa.location ?? "—"}</td>
                          <td className="py-1.5 px-2 text-right font-bold">{sa.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
