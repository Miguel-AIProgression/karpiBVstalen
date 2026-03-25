"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Zap, Plus, ChevronRight, ChevronDown, AlertTriangle, Package, Pencil } from "lucide-react";
import { QuickEntryModal } from "@/components/quick-entry-modal";
import { SampleFormModal, type SampleRow } from "@/components/sample-form-modal";

/* ─── Types ──────────────────────────────────────────── */

interface SampleData {
  id: string;
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  min_stock: number;
  photo_url: string | null;
  description: string | null;
  active: boolean;
  quality_name: string;
  quality_code: string;
  color_name: string;
  color_code: string;
  hex_color: string | null;
  dimension_name: string;
}

interface StockEntry {
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  location_id: string;
  quantity: number;
  location_label: string;
}

interface BackorderEntry {
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  quantity: number;
}

interface QualityOption {
  id: string;
  name: string;
  code: string;
}

interface DimensionOption {
  id: string;
  name: string;
}

/* ─── Helpers ──────────────────────────────────────────── */

function stockKey(qualityId: string, colorCodeId: string, dimensionId: string) {
  return `${qualityId}|${colorCodeId}|${dimensionId}`;
}

/* ─── Component ──────────────────────────────────────── */

export default function StalenVoorraadPage() {
  const supabase = createClient();

  const [samples, setSamples] = useState<SampleData[]>([]);
  const [rawStock, setRawStock] = useState<StockEntry[]>([]);
  const [finishedStock, setFinishedStock] = useState<StockEntry[]>([]);
  const [backorders, setBackorders] = useState<BackorderEntry[]>([]);
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [dimensions, setDimensions] = useState<DimensionOption[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterQuality, setFilterQuality] = useState("");
  const [filterDimension, setFilterDimension] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [sampleFormOpen, setSampleFormOpen] = useState(false);
  const [editSample, setEditSample] = useState<SampleRow | null>(null);

  const [loading, setLoading] = useState(true);

  /* ─── Data loading ─── */

  const loadData = useCallback(async () => {
    const [
      { data: samplesData },
      { data: rawData },
      { data: finData },
      { data: ordersData },
      { data: qualsData },
      { data: dimsData },
    ] = await Promise.all([
      supabase
        .from("samples")
        .select("*, qualities(name, code), color_codes(name, code, hex_color), sample_dimensions(name)")
        .eq("active", true),
      supabase
        .from("raw_stock")
        .select("quality_id, color_code_id, dimension_id, location_id, quantity, locations(label)"),
      supabase
        .from("finished_stock")
        .select("quality_id, color_code_id, dimension_id, location_id, quantity, locations(label)"),
      supabase
        .from("orders")
        .select("order_lines(bundle_id, quantity, bundles(quality_id, dimension_id, bundle_colors(color_code_id)))")
        .neq("status", "completed"),
      supabase
        .from("qualities")
        .select("id, name, code")
        .eq("active", true)
        .order("name"),
      supabase
        .from("sample_dimensions")
        .select("id, name")
        .order("name"),
    ]);

    // Map samples
    const mappedSamples: SampleData[] = (samplesData ?? []).map((s: any) => ({
      id: s.id,
      quality_id: s.quality_id,
      color_code_id: s.color_code_id,
      dimension_id: s.dimension_id,
      min_stock: s.min_stock,
      photo_url: s.photo_url,
      description: s.description,
      active: s.active,
      quality_name: s.qualities?.name ?? "",
      quality_code: s.qualities?.code ?? "",
      color_name: s.color_codes?.name ?? "",
      color_code: s.color_codes?.code ?? "",
      hex_color: s.color_codes?.hex_color ?? null,
      dimension_name: s.sample_dimensions?.name ?? "",
    }));

    // Map raw stock
    const mappedRaw: StockEntry[] = (rawData ?? []).map((r: any) => ({
      quality_id: r.quality_id,
      color_code_id: r.color_code_id,
      dimension_id: r.dimension_id,
      location_id: r.location_id,
      quantity: r.quantity,
      location_label: r.locations?.label ?? "?",
    }));

    // Map finished stock
    const mappedFinished: StockEntry[] = (finData ?? []).map((f: any) => ({
      quality_id: f.quality_id,
      color_code_id: f.color_code_id,
      dimension_id: f.dimension_id,
      location_id: f.location_id,
      quantity: f.quantity,
      location_label: f.locations?.label ?? "?",
    }));

    // Calculate backorders from orders
    const boMap = new Map<string, number>();
    for (const order of ordersData ?? []) {
      for (const line of (order as any).order_lines ?? []) {
        const bundle = line.bundles;
        if (!bundle) continue;
        const lineQty = line.quantity ?? 0;
        for (const bc of bundle.bundle_colors ?? []) {
          const k = stockKey(bundle.quality_id, bc.color_code_id, bundle.dimension_id);
          boMap.set(k, (boMap.get(k) ?? 0) + lineQty);
        }
      }
    }
    const mappedBackorders: BackorderEntry[] = Array.from(boMap.entries()).map(([k, qty]) => {
      const [quality_id, color_code_id, dimension_id] = k.split("|");
      return { quality_id, color_code_id, dimension_id, quantity: qty };
    });

    setSamples(mappedSamples);
    setRawStock(mappedRaw);
    setFinishedStock(mappedFinished);
    setBackorders(mappedBackorders);
    setQualities(qualsData ?? []);
    setDimensions(dimsData ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Computed data ─── */

  // Aggregate stock sums
  const rawSumMap = new Map<string, number>();
  for (const r of rawStock) {
    const k = stockKey(r.quality_id, r.color_code_id, r.dimension_id);
    rawSumMap.set(k, (rawSumMap.get(k) ?? 0) + r.quantity);
  }

  const finSumMap = new Map<string, number>();
  for (const f of finishedStock) {
    const k = stockKey(f.quality_id, f.color_code_id, f.dimension_id);
    finSumMap.set(k, (finSumMap.get(k) ?? 0) + f.quantity);
  }

  const boSumMap = new Map<string, number>();
  for (const b of backorders) {
    const k = stockKey(b.quality_id, b.color_code_id, b.dimension_id);
    boSumMap.set(k, (boSumMap.get(k) ?? 0) + b.quantity);
  }

  // Filter samples
  const filtered = samples.filter((s) => {
    if (filterQuality && s.quality_id !== filterQuality) return false;
    if (filterDimension && s.dimension_id !== filterDimension) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !s.quality_name.toLowerCase().includes(q) &&
        !s.color_name.toLowerCase().includes(q) &&
        !s.color_code.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // Stats
  let negativeCount = 0;
  let warningCount = 0;
  for (const s of filtered) {
    const k = stockKey(s.quality_id, s.color_code_id, s.dimension_id);
    const fin = finSumMap.get(k) ?? 0;
    const bo = boSumMap.get(k) ?? 0;
    const vrij = fin - bo;
    if (vrij < 0) negativeCount++;
    else if (vrij <= s.min_stock) warningCount++;
  }

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getLocations(entries: StockEntry[], qualityId: string, colorCodeId: string, dimensionId: string) {
    return entries.filter(
      (e) => e.quality_id === qualityId && e.color_code_id === colorCodeId && e.dimension_id === dimensionId && e.quantity > 0
    );
  }

  function handleEdit(s: SampleData) {
    setEditSample({
      id: s.id,
      quality_id: s.quality_id,
      color_code_id: s.color_code_id,
      dimension_id: s.dimension_id,
      photo_url: s.photo_url,
      description: s.description,
      min_stock: s.min_stock,
      active: s.active,
    });
    setSampleFormOpen(true);
  }

  function handleNewSample() {
    setEditSample(null);
    setSampleFormOpen(true);
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">
            Stalen &amp; Voorraad
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Overzicht van alle stalen met voorraad en beschikbaarheid
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setQuickEntryOpen(true)}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            <Zap size={14} /> Snelle invoer
          </Button>
          <Button onClick={handleNewSample}>
            <Plus size={14} /> Nieuw staal
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op kwaliteit of kleur..."
            className="pl-8"
          />
        </div>
        <select
          value={filterQuality}
          onChange={(e) => setFilterQuality(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Alle kwaliteiten</option>
          {qualities.map((q) => (
            <option key={q.id} value={q.id}>
              {q.code} — {q.name}
            </option>
          ))}
        </select>
        <select
          value={filterDimension}
          onChange={(e) => setFilterDimension(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Alle afmetingen</option>
          {dimensions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <Package size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {samples.length === 0
              ? "Nog geen stalen aangemaakt. Klik op '+ Nieuw staal' om te beginnen."
              : "Geen stalen gevonden voor deze filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Staal</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kwaliteit</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kleur</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Afmeting</th>
                  <th className="px-4 py-3 text-right font-medium text-amber-700">Gesneden</th>
                  <th className="px-4 py-3 text-right font-medium text-green-700">Afgewerkt</th>
                  <th className="px-4 py-3 text-right font-medium text-red-700">Backorders</th>
                  <th className="px-4 py-3 text-right font-medium text-foreground">Vrij</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Min.</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const k = stockKey(s.quality_id, s.color_code_id, s.dimension_id);
                  const rawTotal = rawSumMap.get(k) ?? 0;
                  const finTotal = finSumMap.get(k) ?? 0;
                  const boTotal = boSumMap.get(k) ?? 0;
                  const vrij = finTotal - boTotal;
                  const isExpanded = expandedRows.has(s.id);

                  const isNegative = vrij < 0;
                  const isWarning = !isNegative && vrij <= s.min_stock;

                  const rowBg = isNegative
                    ? "bg-red-50"
                    : isWarning
                    ? "bg-amber-50"
                    : "";

                  const rawLocations = getLocations(rawStock, s.quality_id, s.color_code_id, s.dimension_id);
                  const finLocations = getLocations(finishedStock, s.quality_id, s.color_code_id, s.dimension_id);

                  return (
                    <tbody key={s.id}>
                      <tr
                        className={`border-b border-border/50 transition-colors hover:bg-muted/30 cursor-pointer ${rowBg}`}
                        onClick={() => toggleRow(s.id)}
                      >
                        <td className="px-2 py-3 text-center text-muted-foreground">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-8 w-8 shrink-0 rounded"
                              style={{ backgroundColor: s.hex_color || "#e5e7eb" }}
                            />
                            <span className="font-medium text-card-foreground">
                              {s.quality_name} {s.color_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-card-foreground">{s.quality_name}</td>
                        <td className="px-4 py-3 text-card-foreground">
                          <span className="font-mono">{s.color_code}</span>
                          {s.color_name !== s.color_code && (
                            <span className="ml-1.5 text-xs text-muted-foreground">{s.color_name}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-card-foreground">{s.dimension_name}</td>
                        <td className="px-4 py-3 text-right">
                          {rawTotal > 0 ? (
                            <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                              {rawTotal}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">&mdash;</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {finTotal > 0 ? (
                            <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                              {finTotal}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">&mdash;</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {boTotal > 0 ? (
                            <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                              {boTotal}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">&mdash;</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-flex min-w-[2rem] justify-center text-sm font-bold ${
                              isNegative ? "text-red-700" : "text-foreground"
                            }`}
                          >
                            {vrij}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-muted-foreground">{s.min_stock}</span>
                            {(isNegative || isWarning) && (
                              <AlertTriangle size={14} className="text-amber-500" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEdit(s); }}
                            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Bewerken"
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>

                      {/* Expanded location details */}
                      {isExpanded && (
                        <tr className={`border-b border-border/50 ${rowBg}`}>
                          <td />
                          <td colSpan={10} className="px-4 py-3">
                            <div className="grid grid-cols-2 gap-6">
                              {/* Raw stock locations */}
                              <div>
                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
                                  Gesneden — locaties
                                </h4>
                                {rawLocations.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Geen voorraad</p>
                                ) : (
                                  <div className="space-y-1">
                                    {rawLocations.map((loc) => (
                                      <div
                                        key={loc.location_id}
                                        className="flex items-center justify-between rounded bg-amber-50 px-3 py-1.5 text-xs ring-1 ring-amber-200/50"
                                      >
                                        <span className="font-mono font-medium text-amber-800">
                                          {loc.location_label}
                                        </span>
                                        <span className="font-semibold text-amber-900">
                                          {loc.quantity}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Finished stock locations */}
                              <div>
                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-green-700">
                                  Afgewerkt — locaties
                                </h4>
                                {finLocations.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Geen voorraad</p>
                                ) : (
                                  <div className="space-y-1">
                                    {finLocations.map((loc) => (
                                      <div
                                        key={loc.location_id}
                                        className="flex items-center justify-between rounded bg-green-50 px-3 py-1.5 text-xs ring-1 ring-green-200/50"
                                      >
                                        <span className="font-mono font-medium text-green-800">
                                          {loc.location_label}
                                        </span>
                                        <span className="font-semibold text-green-900">
                                          {loc.quantity}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>{filtered.length} stalen gevonden</span>
          {negativeCount > 0 && (
            <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
              {negativeCount} negatieve voorraad
            </span>
          )}
          {warningCount > 0 && (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {warningCount} op minimum
            </span>
          )}
        </div>
      )}

      {/* Modals */}
      <QuickEntryModal
        open={quickEntryOpen}
        onOpenChange={setQuickEntryOpen}
        onBooked={loadData}
      />
      <SampleFormModal
        open={sampleFormOpen}
        onOpenChange={setSampleFormOpen}
        sample={editSample}
        onSaved={loadData}
      />
    </div>
  );
}
