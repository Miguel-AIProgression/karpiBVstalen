"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Zap, Plus, AlertTriangle, Package, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { QuickEntryModal } from "@/components/quick-entry-modal";
import { SampleFormModal, type SampleRow } from "@/components/sample-form-modal";
import { BundelStockTab } from "@/components/bundel-stock-tab";
import { CollectieStockTab } from "@/components/collectie-stock-tab";
import { ExtrasTab } from "@/components/extras-tab";

/* ─── Types ──────────────────────────────────────────── */

interface SampleData {
  id: string;
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  min_stock: number;
  photo_url: string | null;
  description: string | null;
  location: string | null;
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
  quantity: number;
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

type SortField = "color_code" | "quality" | "dimension" | "location" | "raw" | "backorders" | "vrij" | "min_stock";
type SortDir = "asc" | "desc";

/* ─── Helpers ──────────────────────────────────────────── */

function stockKey(qualityId: string, colorCodeId: string, dimensionId: string) {
  return `${qualityId}|${colorCodeId}|${dimensionId}`;
}

/* ─── Component ──────────────────────────────────────── */

export default function StalenVoorraadPage() {
  const supabase = createClient();

  const [samples, setSamples] = useState<SampleData[]>([]);
  const [rawStock, setRawStock] = useState<StockEntry[]>([]);
  const [backorders, setBackorders] = useState<BackorderEntry[]>([]);
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [dimensions, setDimensions] = useState<DimensionOption[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterQuality, setFilterQuality] = useState("");
  const [filterDimension, setFilterDimension] = useState("");

  const [sortField, setSortField] = useState<SortField>("color_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [sampleFormOpen, setSampleFormOpen] = useState(false);
  const [editSample, setEditSample] = useState<SampleRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"staaltjes" | "bundels" | "collecties" | "extras">("staaltjes");

  /* ─── Data loading ─── */

  const loadData = useCallback(async () => {
    const [
      { data: samplesData },
      { data: rawData },
      { data: ordersData },
      { data: qualsData },
      { data: dimsData },
    ] = await Promise.all([
      supabase
        .from("samples")
        .select("*, qualities(name, code), color_codes(name, code, hex_color), sample_dimensions(name)")
        .eq("active", true),
      supabase
        .from("finished_stock")
        .select("quality_id, color_code_id, dimension_id, quantity"),
      supabase
        .from("orders")
        .select("order_lines(bundle_id, quantity, bundles(quality_id, dimension_id, bundle_colors(color_code_id), bundle_items(samples(quality_id, color_code_id, dimension_id))))")
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
      location: s.location ?? null,
      active: s.active,
      quality_name: s.qualities?.name ?? "",
      quality_code: s.qualities?.code ?? "",
      color_name: s.color_codes?.name ?? "",
      color_code: s.color_codes?.code ?? "",
      hex_color: s.color_codes?.hex_color ?? null,
      dimension_name: s.sample_dimensions?.name ?? "",
    }));

    // Map finished stock
    const mappedRaw: StockEntry[] = (rawData ?? []).map((r: any) => ({
      quality_id: r.quality_id,
      color_code_id: r.color_code_id,
      dimension_id: r.dimension_id,
      quantity: r.quantity,
    }));

    // Calculate backorders from orders
    const boMap = new Map<string, number>();
    for (const order of ordersData ?? []) {
      for (const line of (order as any).order_lines ?? []) {
        const bundle = line.bundles;
        if (!bundle) continue;
        const lineQty = line.quantity ?? 0;
        // Handle both old-style (bundle_colors) and multi-quality (bundle_items)
        const sampleKeys: string[] = [];
        if (bundle.quality_id && (bundle.bundle_colors?.length ?? 0) > 0) {
          for (const bc of bundle.bundle_colors) {
            sampleKeys.push(stockKey(bundle.quality_id, bc.color_code_id, bundle.dimension_id));
          }
        } else if ((bundle.bundle_items?.length ?? 0) > 0) {
          for (const bi of bundle.bundle_items) {
            const s = bi.samples;
            if (s) sampleKeys.push(stockKey(s.quality_id, s.color_code_id, s.dimension_id));
          }
        }
        for (const k of sampleKeys) {
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

  // Sort
  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown size={12} className="ml-1 inline opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp size={12} className="ml-1 inline" />
      : <ArrowDown size={12} className="ml-1 inline" />;
  }

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const ka = stockKey(a.quality_id, a.color_code_id, a.dimension_id);
    const kb = stockKey(b.quality_id, b.color_code_id, b.dimension_id);

    switch (sortField) {
      case "color_code": {
        const numA = parseInt(a.color_code, 10);
        const numB = parseInt(b.color_code, 10);
        if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * dir;
        return a.color_code.localeCompare(b.color_code) * dir;
      }
      case "quality":
        return a.quality_name.localeCompare(b.quality_name) * dir;
      case "dimension":
        return a.dimension_name.localeCompare(b.dimension_name) * dir;
      case "location":
        return (a.location ?? "").localeCompare(b.location ?? "") * dir;
      case "raw":
        return ((rawSumMap.get(ka) ?? 0) - (rawSumMap.get(kb) ?? 0)) * dir;
      case "backorders":
        return ((boSumMap.get(ka) ?? 0) - (boSumMap.get(kb) ?? 0)) * dir;
      case "vrij": {
        const va = (rawSumMap.get(ka) ?? 0) - (boSumMap.get(ka) ?? 0);
        const vb = (rawSumMap.get(kb) ?? 0) - (boSumMap.get(kb) ?? 0);
        return (va - vb) * dir;
      }
      case "min_stock":
        return (a.min_stock - b.min_stock) * dir;
      default:
        return 0;
    }
  });

  // Stats
  let negativeCount = 0;
  let warningCount = 0;
  for (const s of sorted) {
    const k = stockKey(s.quality_id, s.color_code_id, s.dimension_id);
    const raw = rawSumMap.get(k) ?? 0;
    const bo = boSumMap.get(k) ?? 0;
    const vrij = raw - bo;
    if (vrij < 0) negativeCount++;
    else if (vrij <= s.min_stock) warningCount++;
  }


  function handleEdit(s: SampleData) {
    setEditSample({
      id: s.id,
      quality_id: s.quality_id,
      color_code_id: s.color_code_id,
      dimension_id: s.dimension_id,
      photo_url: s.photo_url,
      description: s.description,
      location: s.location ?? null,
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
        {activeTab === "staaltjes" && (
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
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: "staaltjes", label: "Staaltjes" },
          { key: "bundels", label: "Bundels" },
          { key: "collecties", label: "Collecties" },
          { key: "extras", label: "Extra's" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Bundels */}
      {activeTab === "bundels" && <BundelStockTab />}

      {/* Tab: Collecties */}
      {activeTab === "collecties" && <CollectieStockTab />}

      {/* Tab: Extra's */}
      {activeTab === "extras" && <ExtrasTab />}

      {/* Tab: Staaltjes — Filters */}
      {activeTab !== "staaltjes" ? null : (
      <>

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
      ) : sorted.length === 0 ? (
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
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "6%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("quality")}>
                    Staal<SortIcon field="quality" />
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("color_code")}>
                    Nr.<SortIcon field="color_code" />
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("dimension")}>
                    Afmeting<SortIcon field="dimension" />
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("location")}>
                    Locatie<SortIcon field="location" />
                  </th>
                  <th className="px-3 py-3 text-right font-medium text-green-700 cursor-pointer select-none hover:text-green-900" onClick={() => toggleSort("raw")}>
                    Afgewerkt<SortIcon field="raw" />
                  </th>
                  <th className="px-3 py-3 text-right font-medium text-red-700 cursor-pointer select-none hover:text-red-900" onClick={() => toggleSort("backorders")}>
                    Backord.<SortIcon field="backorders" />
                  </th>
                  <th className="px-3 py-3 text-right font-medium text-foreground cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("vrij")}>
                    Vrij<SortIcon field="vrij" />
                  </th>
                  <th className="px-3 py-3 text-right font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("min_stock")}>
                    Min.<SortIcon field="min_stock" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const k = stockKey(s.quality_id, s.color_code_id, s.dimension_id);
                  const rawTotal = rawSumMap.get(k) ?? 0;
                  const boTotal = boSumMap.get(k) ?? 0;
                  const vrij = rawTotal - boTotal;
                  const isNegative = vrij < 0;
                  const isWarning = !isNegative && vrij <= s.min_stock;

                  const rowBg = isNegative
                    ? "bg-red-50"
                    : isWarning
                    ? "bg-amber-50"
                    : "";

                  return (
                    <React.Fragment key={s.id}>
                      <tr
                        className={`border-b border-border/50 transition-colors hover:bg-muted/30 cursor-pointer ${rowBg}`}
                        onClick={() => handleEdit(s)}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="h-7 w-7 shrink-0 rounded"
                              style={{ backgroundColor: s.hex_color || "#e5e7eb" }}
                            />
                            <div className="min-w-0">
                              <span className="font-medium text-card-foreground">{s.quality_name}</span>
                              {s.color_name !== s.color_code && (
                                <span className="ml-1.5 text-muted-foreground">{s.color_name}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-card-foreground">{s.color_code}</td>
                        <td className="px-3 py-2.5 text-card-foreground">{s.dimension_name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{s.location ?? ""}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {rawTotal > 0 ? (
                            <span className="inline-flex min-w-[1.5rem] justify-center rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-800">
                              {rawTotal}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/30">&mdash;</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {boTotal > 0 ? (
                            <span className="inline-flex min-w-[1.5rem] justify-center rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">
                              {boTotal}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/30">&mdash;</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          <span className={`font-bold ${isNegative ? "text-red-700" : "text-foreground"}`}>
                            {vrij}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-muted-foreground">{s.min_stock}</span>
                            {(isNegative || isWarning) && (
                              <AlertTriangle size={12} className="text-amber-500" />
                            )}
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      {!loading && sorted.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>{sorted.length} stalen gevonden</span>
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

      </>
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
