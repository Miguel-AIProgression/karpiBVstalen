"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readVoorraadbeeld } from "@/lib/voorraadbeeld/snapshot";
import { buildSampleState } from "@/lib/voorraadbeeld/sample-state";

/* ─── Types ──────────────────────────────────────────── */

interface WerkbonSample {
  sampleId: string;
  qualityId: string;
  colorCodeId: string;
  dimensionId: string;
  bundleId: string | null;
  articleNumber: string;
  qualityName: string;
  colorCode: string;
  dimensionName: string;
  afwerking: string | null;
  location: string | null;
  needed: number;
  available: number;
  toProduce: number;
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
  totalToProduce: number;
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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

    // 2. Alle order_lines voor geselecteerde orders
    const { data: linesRaw } = await supabase
      .from("order_lines")
      .select(`
        quantity, bundle_id, sample_id,
        samples(id, article_number, location, quality_id, color_code_id, dimension_id,
          qualities(name),
          color_codes(code),
          sample_dimensions(name),
          finishing_types(name)
        )
      `)
      .in("order_id", orderIds)
      .not("sample_id", "is", null);

    const lines = (linesRaw ?? []) as any[];

    // 3. Aggregeer bestelde aantallen per sample
    const neededMap = new Map<string, number>(); // sampleId → totaal besteld
    for (const line of lines) {
      const sid = line.sample_id;
      if (!sid) continue;
      neededMap.set(sid, (neededMap.get(sid) ?? 0) + (line.quantity ?? 1));
    }

    // 4. Voorraad ophalen via voorraadbeeld
    const vb = await readVoorraadbeeld(supabase, new Date()).catch(() => null);
    const sampleStates = vb ? buildSampleState(vb) : new Map<string, { finished: number; reserved: number; available: number }>();

    // 5. Bundel- en collectienamen
    const bundleIds = [...new Set(lines.map((l) => l.bundle_id).filter(Boolean))] as string[];
    const bundleNameMap = new Map<string, string>();
    const collectionNameMap = new Map<string, string>();

    if (bundleIds.length > 0) {
      const { data: bundleData } = await supabase.from("bundles").select("id, name").in("id", bundleIds);
      for (const b of bundleData ?? []) bundleNameMap.set(b.id, b.name);

      const { data: cbData } = await supabase
        .from("collection_bundles").select("bundle_id, collections(name)").in("bundle_id", bundleIds);
      for (const cb of (cbData ?? []) as any[]) {
        if (cb.collections?.name) collectionNameMap.set(cb.bundle_id, cb.collections.name);
      }
    }

    // 6. Bouw werkbon-items: alleen items die bijgemaakt moeten worden
    // Dedupliceer per sampleId (één entry per uniek staal)
    const seen = new Set<string>();
    const collMap = new Map<string, Map<string, Map<string, WerkbonSample>>>();
    const looseMap = new Map<string, WerkbonSample>();

    for (const line of lines) {
      const s = line.samples;
      const sid = line.sample_id;
      if (!s || !sid || seen.has(sid)) continue;
      seen.add(sid);

      const needed = neededMap.get(sid) ?? 0;
      const state = sampleStates.get(sid);
      const available = state?.available ?? 0;
      const toProduce = Math.max(0, needed - Math.max(0, available));

      // Alleen tonen als er iets bijgemaakt moet worden
      if (toProduce === 0) continue;

      const item: WerkbonSample = {
        sampleId: sid,
        qualityId: s.quality_id,
        colorCodeId: s.color_code_id,
        dimensionId: s.dimension_id,
        bundleId: line.bundle_id ?? null,
        articleNumber: s.article_number,
        qualityName: s.qualities?.name ?? "?",
        colorCode: s.color_codes?.code ?? "?",
        dimensionName: s.sample_dimensions?.name ?? "?",
        afwerking: s.finishing_types?.name ?? null,
        location: s.location ?? null,
        needed,
        available: Math.max(0, available),
        toProduce,
      };

      if (line.bundle_id) {
        const collName = collectionNameMap.get(line.bundle_id) ?? "Geen collectie";
        const bundleName = bundleNameMap.get(line.bundle_id) ?? "Bundel";
        if (!collMap.has(collName)) collMap.set(collName, new Map());
        const bm = collMap.get(collName)!;
        if (!bm.has(bundleName)) bm.set(bundleName, new Map());
        bm.get(bundleName)!.set(sid, item);
      } else {
        looseMap.set(sid, item);
      }
    }

    // 7. Naar gesorteerde structuur
    const collections: WerkbonCollection[] = Array.from(collMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([collName, bundleMap]) => ({
        name: collName,
        bundles: Array.from(bundleMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([bundleName, sampleMap]) => ({
            name: bundleName,
            samples: Array.from(sampleMap.values()).sort((a, b) => a.articleNumber.localeCompare(b.articleNumber)),
          }))
          .filter((b) => b.samples.length > 0),
      }))
      .filter((c) => c.bundles.length > 0);

    const loose = Array.from(looseMap.values()).sort((a, b) => a.articleNumber.localeCompare(b.articleNumber));
    const totalToProduce = [...collections.flatMap((c) => c.bundles.flatMap((b) => b.samples)), ...loose]
      .reduce((s, item) => s + item.toProduce, 0);

    setData({ orderNumbers, collections, loose, totalToProduce });
    setLoading(false);
  }, [supabase, orderIds]);

  useEffect(() => {
    if (open) { setSaved(false); loadData(); }
  }, [open, loadData]);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      // Maak werkbon aan
      const { data: wb, error: wbErr } = await (supabase as any)
        .from("werkbonnen").insert({ status: "open" }).select("id").single();
      if (wbErr || !wb) throw wbErr;
      const werkbonId = wb.id;

      // Koppel orders
      await (supabase as any).from("werkbon_orders").insert(
        orderIds.map((oid, i) => ({ werkbon_id: werkbonId, order_id: oid, order_number: data.orderNumbers[i] ?? "" }))
      );

      // Voeg alle regels in
      const allSamples = [
        ...data.collections.flatMap((c) =>
          c.bundles.flatMap((b) =>
            b.samples.map((sa) => ({ ...sa, collectionName: c.name, bundleName: b.name }))
          )
        ),
        ...data.loose.map((sa) => ({ ...sa, collectionName: null, bundleName: null })),
      ];

      await (supabase as any).from("werkbon_lines").insert(
        allSamples.map((sa: any) => ({
          werkbon_id: werkbonId,
          sample_id: sa.sampleId,
          quality_id: sa.qualityId,
          color_code_id: sa.colorCodeId,
          dimension_id: sa.dimensionId,
          bundle_id: sa.bundleId,
          collection_name: sa.collectionName,
          bundle_name: sa.bundleName,
          article_number: sa.articleNumber,
          quality_name: sa.qualityName,
          color_code: sa.colorCode,
          dimension_name: sa.dimensionName,
          afwerking: sa.afwerking,
          location: sa.location,
          to_produce: sa.toProduce,
          status: "open",
        }))
      );

      setSaved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

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
      @media print{body{margin:10px}}
    </style></head><body>${content}</body></html>`);
    w.document.close();
    w.print();
  }

  if (!open) return null;

  const allEmpty = data && data.collections.length === 0 && data.loose.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-background shadow-xl ring-1 ring-border">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Werkbon — Wat moet er bijgemaakt worden?</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data?.orderNumbers.join(", ")} · {formatToday()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!loading && !allEmpty && !saved && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Opslaan..." : "Werkbon aanmaken"}
              </Button>
            )}
            {saved && (
              <span className="text-sm font-medium text-green-700">✓ Werkbon aangemaakt — zie tab Werkbonnen</span>
            )}
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
            <p className="text-sm text-muted-foreground">Berekenen...</p>
          ) : allEmpty ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-4xl mb-3">✓</div>
              <p className="text-lg font-semibold text-green-700">Alles op voorraad</p>
              <p className="text-sm text-muted-foreground mt-1">Alle stalen uit de geselecteerde orders zijn beschikbaar.</p>
            </div>
          ) : !data ? null : (
            <div ref={printRef}>
              {/* Samenvatting */}
              <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex gap-6 text-sm">
                <div><span className="text-muted-foreground">Collecties tekort:</span> <strong>{data.collections.length}</strong></div>
                <div><span className="text-muted-foreground">Bundels tekort:</span> <strong>{data.collections.reduce((s, c) => s + c.bundles.length, 0)}</strong></div>
                <div><span className="text-muted-foreground">Stuks bijmaken:</span> <strong className="text-amber-700">{data.totalToProduce}</strong></div>
              </div>

              {/* Collecties */}
              {data.collections.map((coll) => (
                <div key={coll.name} className="mb-6">
                  <div className="mb-3 rounded-xl bg-muted/60 px-4 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">Collectie</span>
                    <span className="text-base font-bold text-foreground">{coll.name}</span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      {coll.bundles.reduce((s, b) => s + b.samples.reduce((ss, sa) => ss + sa.toProduce, 0), 0)} stuks bijmaken
                    </span>
                  </div>

                  <div className="space-y-3 pl-3">
                    {coll.bundles.map((bundle) => (
                      <div key={bundle.name}>
                        <div className="mb-1 flex items-center justify-between rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-1.5">
                          <div>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700 block">Bundel</span>
                            <span className="text-sm font-semibold text-foreground">{bundle.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {bundle.samples.reduce((s, sa) => s + sa.toProduce, 0)} stuks bijmaken
                          </span>
                        </div>

                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                              <th className="py-1 px-2 text-left font-medium">Artikel</th>
                              <th className="py-1 px-2 text-left font-medium">Kwaliteit</th>
                              <th className="py-1 px-2 text-left font-medium">Kleur</th>
                              <th className="py-1 px-2 text-left font-medium">Afm.</th>
                              <th className="py-1 px-2 text-left font-medium">Afwerking</th>
                              <th className="py-1 px-2 text-left font-medium">Locatie</th>
                              <th className="py-1 px-2 text-right font-medium">Besteld</th>
                              <th className="py-1 px-2 text-right font-medium">Vrij</th>
                              <th className="py-1 px-2 text-right font-medium text-amber-700">Bijmaken</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bundle.samples.map((sa, i) => (
                              <tr key={sa.sampleId} className={`border-b border-border/30 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                                <td className="py-1.5 px-2 font-mono text-xs text-muted-foreground">{sa.articleNumber}</td>
                                <td className="py-1.5 px-2">{sa.qualityName}</td>
                                <td className="py-1.5 px-2">{sa.colorCode}</td>
                                <td className="py-1.5 px-2 text-muted-foreground">{sa.dimensionName}</td>
                                <td className="py-1.5 px-2 text-muted-foreground">{sa.afwerking ?? "—"}</td>
                                <td className="py-1.5 px-2 text-muted-foreground">{sa.location ?? "—"}</td>
                                <td className="py-1.5 px-2 text-right">{sa.needed}</td>
                                <td className="py-1.5 px-2 text-right text-green-700">{sa.available}</td>
                                <td className="py-1.5 px-2 text-right font-bold text-amber-700">{sa.toProduce}</td>
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
                        <th className="py-1 px-2 text-right font-medium">Besteld</th>
                        <th className="py-1 px-2 text-right font-medium">Vrij</th>
                        <th className="py-1 px-2 text-right font-medium text-amber-700">Bijmaken</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.loose.map((sa, i) => (
                        <tr key={sa.sampleId} className={`border-b border-border/30 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                          <td className="py-1.5 px-2 font-mono text-xs text-muted-foreground">{sa.articleNumber}</td>
                          <td className="py-1.5 px-2">{sa.qualityName}</td>
                          <td className="py-1.5 px-2">{sa.colorCode}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{sa.dimensionName}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{sa.location ?? "—"}</td>
                          <td className="py-1.5 px-2 text-right">{sa.needed}</td>
                          <td className="py-1.5 px-2 text-right text-green-700">{sa.available}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-amber-700">{sa.toProduce}</td>
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
