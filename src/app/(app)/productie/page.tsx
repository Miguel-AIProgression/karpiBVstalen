"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Factory, AlertTriangle, ShoppingCart, CheckCircle2, ArrowUp, ArrowDown, ArrowUpDown, Settings2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { FinishingModal } from "@/components/finishing-modal";
import { isoWeek } from "@/lib/dates/iso-week";
import {
  planWeeks,
  stockKey,
  type SampleInfo,
  type ShortageRow,
  type StockKey,
} from "@/lib/productie/planning";
import { readVoorraadbeeld } from "@/lib/voorraadbeeld/snapshot";
import { buildShortagesFromVoorraadbeeld } from "@/lib/voorraadbeeld/shortages";
import type { Voorraadbeeld } from "@/lib/voorraadbeeld/types";

type SortField = "deadline" | "quality" | "shortage";
type SortDir = "asc" | "desc";

interface QualityOption {
  id: string;
  name: string;
  code: string;
}

interface ProductionData {
  vb: Voorraadbeeld;
  planningSamples: ReadonlyMap<StockKey, SampleInfo>;
}

export default function ProductiePage() {
  const supabase = createClient();

  const [data, setData] = useState<ProductionData | null>(null);
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [openOrderCount, setOpenOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [filterQuality, setFilterQuality] = useState("");
  const [filterType, setFilterType] = useState<"" | "backorder" | "minimum">("");

  const [sortField, setSortField] = useState<SortField>("deadline");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set());
  const [finishingOpen, setFinishingOpen] = useState(false);
  const [finishingSample, setFinishingSample] = useState<ShortageRow | null>(null);

  // Production capacity planning
  const [weeklyCapacity, setWeeklyCapacity] = useState<number>(50);
  const [showPlanning, setShowPlanning] = useState(false);

  const today = useMemo(() => {
    const t = new Date();
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("karpi_weekly_capacity");
      if (saved) setWeeklyCapacity(Number(saved));
    } catch {
      // localStorage unavailable
    }
  }, []);

  function updateCapacity(val: number) {
    const capped = Math.max(1, val);
    setWeeklyCapacity(capped);
    try {
      localStorage.setItem("karpi_weekly_capacity", String(capped));
    } catch {
      // localStorage unavailable
    }
  }

  /* ─── Data loading ─── */

  const loadData = useCallback(async () => {
    const [
      { data: qualsData },
      { count: orderCount },
      vb,
      { data: samplesData },
    ] = await Promise.all([
      supabase
        .from("qualities")
        .select("id, name, code")
        .eq("active", true)
        .order("name"),
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .neq("status", "completed"),
      readVoorraadbeeld(supabase, today),
      supabase
        .from("samples")
        .select(
          "*, qualities(name, code), color_codes(name, hex_color), sample_dimensions(name)"
        )
        .eq("active", true),
    ]);

    setQualities(qualsData ?? []);
    setOpenOrderCount(orderCount ?? 0);

    const planningSamples = new Map<StockKey, SampleInfo>();
    for (const s of (samplesData ?? []) as Array<Record<string, unknown> & { quality_id: string; color_code_id: string; dimension_id: string; min_stock: number }>) {
      const k = stockKey(s.quality_id, s.color_code_id, s.dimension_id);
      const q = s.qualities as { name?: string } | null;
      const c = s.color_codes as { name?: string; hex_color?: string | null } | null;
      const d = s.sample_dimensions as { name?: string } | null;
      planningSamples.set(k, {
        qualityId: s.quality_id,
        colorCodeId: s.color_code_id,
        dimensionId: s.dimension_id,
        qualityName: q?.name ?? "",
        colorName: c?.name ?? "",
        hexColor: c?.hex_color ?? null,
        dimensionName: d?.name ?? "",
        minStock: s.min_stock,
      });
    }

    setData({ vb, planningSamples });
    setLoading(false);
  }, [supabase, today]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Derived: shortages + week plan ─── */

  const shortages = useMemo<ShortageRow[]>(() => {
    if (!data) return [];
    return buildShortagesFromVoorraadbeeld(data.vb, {
      planningSamples: data.planningSamples,
    });
  }, [data]);

  const weekPlanning = useMemo(
    () => planWeeks(shortages, weeklyCapacity, today),
    [shortages, weeklyCapacity, today],
  );

  /* ─── Filters ─── */

  const filtered = shortages.filter((s) => {
    if (filterQuality && s.quality_id !== filterQuality) return false;
    if (filterType && s.reason !== filterType) return false;
    return true;
  });

  /* ─── Sort ─── */

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
    switch (sortField) {
      case "deadline": {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline) * dir;
      }
      case "quality":
        return a.qualityName.localeCompare(b.qualityName) * dir;
      case "shortage":
        return (a.shortage - b.shortage) * dir;
      default:
        return 0;
    }
  });

  /* ─── Stats ─── */

  const backorderShortageCount = shortages.filter((s) => s.reason === "backorder").length;
  const minimumShortageCount = shortages.filter((s) => s.reason === "minimum").length;
  const totalShortageCount = shortages.reduce((sum, s) => sum + s.shortage, 0);

  const totalWeeksNeeded = totalShortageCount > 0
    ? Math.ceil(totalShortageCount / weeklyCapacity)
    : 0;

  const behindSchedule = weekPlanning.some((wp) => wp.weekNr !== 9999 && wp.surplus < 0);

  const currentWeek = isoWeek(today);

  /* ─── Checkbox handling ─── */

  function toggleCheck(key: string) {
    setCheckedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCheckboxChange(row: ShortageRow) {
    const k = stockKey(row.quality_id, row.color_code_id, row.dimension_id) + "|" + row.reason;
    if (!checkedRows.has(k)) {
      toggleCheck(k);
      setFinishingSample(row);
      setFinishingOpen(true);
    } else {
      toggleCheck(k);
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-3xl tracking-tight text-foreground">Productie</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Overzicht van alle tekorten en productiebehoeften
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-red-50 p-5 ring-1 ring-red-200/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
              <Factory size={20} className="text-red-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-700">Te produceren</p>
              <p className="text-2xl font-bold text-red-900">{totalShortageCount}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
              <AlertTriangle size={20} className="text-amber-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-700">Onder minimum</p>
              <p className="text-2xl font-bold text-amber-900">{minimumShortageCount}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-200/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
              <ShoppingCart size={20} className="text-green-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-700">Openstaande orders</p>
              <p className="text-2xl font-bold text-green-900">{openOrderCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Production capacity & planning */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Settings2 size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium text-card-foreground">Productiecapaciteit</span>
            <input
              type="number"
              min={1}
              value={weeklyCapacity}
              onChange={(e) => updateCapacity(Number(e.target.value))}
              className="w-20 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">stalen / week</span>
          </div>

          <div className="flex items-center gap-4">
            {totalShortageCount > 0 && (
              <span className="text-sm text-muted-foreground">
                Totaal tekort: <strong className="text-card-foreground">{totalShortageCount}</strong> stalen
                {" "}= <strong className="text-card-foreground">{totalWeeksNeeded}</strong> {totalWeeksNeeded === 1 ? "week" : "weken"} werk
              </span>
            )}
            <button
              onClick={() => setShowPlanning(!showPlanning)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-card-foreground hover:bg-muted transition-colors"
            >
              <TrendingUp size={14} />
              {showPlanning ? "Verberg planning" : "Toon weekplanning"}
            </button>
          </div>
        </div>

        {/* Capacity warning */}
        {behindSchedule && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 ring-1 ring-red-200/50">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <span className="text-sm text-red-800">
              <strong>Capaciteit onvoldoende!</strong> Met {weeklyCapacity} stalen/week kun je niet alle deadlines halen.
              Verhoog de capaciteit of herverdeel de planning.
            </span>
          </div>
        )}

        {/* Week planning view */}
        {showPlanning && weekPlanning.length > 0 && (
          <div className="overflow-hidden rounded-xl ring-1 ring-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Week</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Nodig</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Cumulatief nodig</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Capaciteit (cum.)</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Marge</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {weekPlanning.map((wp) => {
                  const isOverdue = wp.weekNr !== 9999 && wp.surplus < 0;
                  const isTight = wp.weekNr !== 9999 && wp.surplus >= 0 && wp.surplus < wp.capacity;
                  const isThisWeek = wp.weekNr === currentWeek;

                  return (
                    <tr
                      key={`${wp.weekYear}-${wp.weekNr}`}
                      className={`border-b border-border/50 transition-colors ${
                        isOverdue ? "bg-red-50/50" : isThisWeek ? "bg-blue-50/30" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${isThisWeek ? "text-blue-700" : "text-card-foreground"}`}>
                          {wp.weekLabel}
                        </span>
                        {isThisWeek && (
                          <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                            nu
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-card-foreground">
                        {wp.needed}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {wp.cumNeeded}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {wp.weekNr === 9999 ? "—" : wp.cumCapacity}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {wp.weekNr === 9999 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={`font-semibold ${
                            wp.surplus < 0 ? "text-red-700" : wp.surplus === 0 ? "text-amber-700" : "text-green-700"
                          }`}>
                            {wp.surplus > 0 ? "+" : ""}{wp.surplus}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {wp.weekNr === 9999 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            <Minus size={10} /> Geen deadline
                          </span>
                        ) : wp.surplus < 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                            <TrendingDown size={10} /> Niet haalbaar
                          </span>
                        ) : isTight ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            <Minus size={10} /> Krap
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                            <TrendingUp size={10} /> Op schema
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
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
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as "" | "backorder" | "minimum")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Alle tekorten</option>
          <option value="backorder">Backorder</option>
          <option value="minimum">Onder minimum</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <Factory size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {shortages.length === 0
              ? "Geen tekorten gevonden. Alle voorraad is op peil!"
              : "Geen tekorten voor deze filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="w-10 px-3 py-3" />
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("quality")}>
                    Staal<SortIcon field="quality" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("deadline")}>
                    Deadline<SortIcon field="deadline" />
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Nodig</th>
                  <th className="px-4 py-3 text-right font-medium text-green-700">Afgewerkt</th>
                  <th className="px-4 py-3 text-right font-medium text-red-700 cursor-pointer select-none hover:text-red-900" onClick={() => toggleSort("shortage")}>
                    Tekort<SortIcon field="shortage" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reden</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                    Actie
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const rowKey =
                    stockKey(row.quality_id, row.color_code_id, row.dimension_id) +
                    "|" +
                    row.reason;
                  const isChecked = checkedRows.has(rowKey);

                  return (
                    <tr
                      key={rowKey}
                      className="border-b border-border/50 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleCheckboxChange(row)}
                          className="h-4 w-4 rounded border-border text-foreground focus:ring-ring"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-8 w-8 shrink-0 rounded"
                            style={{ backgroundColor: row.hexColor || "#e5e7eb" }}
                          />
                          <div>
                            <div className="font-medium text-card-foreground">
                              {row.qualityName} {row.colorName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.dimensionName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.deadline ? (() => {
                          const dl = new Date(row.deadline + "T00:00:00Z");
                          const weekNr = isoWeek(dl);
                          const isOverdue = dl.getTime() < today.getTime();
                          const isThisWeek = weekNr === currentWeek;
                          const isNextWeek = weekNr === currentWeek + 1;
                          const formatted = dl.toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" });
                          return (
                            <div>
                              <span className={`text-sm font-bold ${isOverdue ? "text-red-700" : isThisWeek ? "text-amber-700" : "text-card-foreground"}`}>
                                Wk {weekNr}
                              </span>
                              <div className={`text-xs ${isOverdue ? "text-red-600 font-semibold" : isThisWeek ? "text-amber-600" : "text-muted-foreground"}`}>
                                {isOverdue
                                  ? `Te laat (${formatted})`
                                  : isThisWeek
                                  ? "Deze week"
                                  : isNextWeek
                                  ? "Volgende week"
                                  : `vr ${formatted}`}
                              </div>
                            </div>
                          );
                        })() : (
                          <span className="text-xs text-muted-foreground/40">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-card-foreground">{row.needed}</td>
                      <td className="px-4 py-3 text-right">
                        {row.finished > 0 ? (
                          <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                            {row.finished}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { setFinishingSample(row); setFinishingOpen(true); }}
                          className="inline-flex min-w-[2rem] justify-center rounded-md bg-red-100 px-2 py-0.5 text-sm font-bold text-red-700 hover:bg-red-200 hover:text-red-900 transition-colors cursor-pointer"
                          title="Klik om tekort aan te vullen"
                        >
                          {row.shortage}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {row.reason === "backorder" ? (
                          <span className="inline-flex rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                            Backorder
                          </span>
                        ) : (
                          <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            Onder minimum
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => { setFinishingSample(row); setFinishingOpen(true); }}
                            className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-800 hover:bg-green-200 transition-colors"
                            title="Afwerken boeken"
                          >
                            <CheckCircle2 size={12} /> Afwerken
                          </button>
                        </div>
                      </td>
                    </tr>
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
          <span>{sorted.length} tekorten gevonden</span>
          {backorderShortageCount > 0 && (
            <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
              {backorderShortageCount} backorder
            </span>
          )}
          {minimumShortageCount > 0 && (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {minimumShortageCount} onder minimum
            </span>
          )}
        </div>
      )}

      {/* Afwerken modal */}
      {finishingSample && (
        <FinishingModal
          open={finishingOpen}
          onOpenChange={setFinishingOpen}
          sample={{
            quality_id: finishingSample.quality_id,
            color_code_id: finishingSample.color_code_id,
            dimension_id: finishingSample.dimension_id,
            qualityName: finishingSample.qualityName,
            colorName: finishingSample.colorName,
            dimensionName: finishingSample.dimensionName,
          }}
          shortage={finishingSample.shortage}
          onResolved={loadData}
        />
      )}
    </div>
  );
}
