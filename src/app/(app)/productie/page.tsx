"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Factory, AlertTriangle, ShoppingCart, CheckCircle2, ArrowUp, ArrowDown, ArrowUpDown, Settings2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { FinishingModal } from "@/components/finishing-modal";

/* ─── Types ──────────────────────────────────────────── */

interface ShortageRow {
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  qualityName: string;
  colorName: string;
  hexColor: string | null;
  dimensionName: string;
  needed: number;
  finished: number;
  shortage: number;
  reason: "backorder" | "minimum";
  deadline: string | null; // delivery_date - 7 days
}

interface WeekPlan {
  weekNr: number;
  weekLabel: string; // "Wk 14 — 4 apr"
  needed: number; // total needed this week
  cumNeeded: number; // cumulative needed up to and including this week
  capacity: number; // weekly capacity
  cumCapacity: number; // cumulative capacity up to and including this week
  surplus: number; // cumCapacity - cumNeeded (negative = behind schedule)
  rows: ShortageRow[];
}

type SortField = "deadline" | "quality" | "shortage";
type SortDir = "asc" | "desc";

interface QualityOption {
  id: string;
  name: string;
  code: string;
}

/* ─── Helpers ──────────────────────────────────────────── */

function stockKey(qualityId: string, colorCodeId: string, dimensionId: string) {
  return `${qualityId}|${colorCodeId}|${dimensionId}`;
}

/** ISO week number (Mon=1 start) */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Get Friday of the ISO week containing the given date */
function getFridayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 5=Fri
  const diff = 5 - (day === 0 ? 7 : day); // distance to Friday
  d.setDate(d.getDate() + diff);
  return d;
}

/* ─── Component ──────────────────────────────────────── */

export default function ProductiePage() {
  const supabase = createClient();

  const [shortages, setShortages] = useState<ShortageRow[]>([]);
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
  const [weeklyCapacity, setWeeklyCapacity] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("karpi_weekly_capacity");
      return saved ? Number(saved) : 50;
    }
    return 50;
  });
  const [showPlanning, setShowPlanning] = useState(false);

  function updateCapacity(val: number) {
    const capped = Math.max(1, val);
    setWeeklyCapacity(capped);
    localStorage.setItem("karpi_weekly_capacity", String(capped));
  }

  /* ─── Data loading ─── */

  const loadData = useCallback(async () => {
    const [
      { data: ordersData },
      { data: finData },
      { data: samplesData },
      { data: qualsData },
      { count: orderCount },
    ] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "delivery_date, order_lines(quantity, bundles(quality_id, dimension_id, bundle_colors(color_code_id), bundle_items(samples(quality_id, color_code_id, dimension_id))))"
        )
        .neq("status", "completed"),
      supabase
        .from("finished_stock")
        .select("quality_id, color_code_id, dimension_id, quantity"),
      supabase
        .from("samples")
        .select(
          "*, qualities(name, code), color_codes(name, hex_color), sample_dimensions(name)"
        )
        .eq("active", true),
      supabase
        .from("qualities")
        .select("id, name, code")
        .eq("active", true)
        .order("name"),
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .neq("status", "completed"),
    ]);

    setQualities(qualsData ?? []);
    setOpenOrderCount(orderCount ?? 0);

    // Build finished stock map
    const finMap = new Map<string, number>();
    for (const f of finData ?? []) {
      const k = stockKey(f.quality_id, f.color_code_id, f.dimension_id);
      finMap.set(k, (finMap.get(k) ?? 0) + f.quantity);
    }

    // Build backorder map + earliest deadline map from orders
    const boMap = new Map<string, number>();
    const deadlineMap = new Map<string, string>(); // stockKey → earliest delivery_date - 7 days
    for (const order of ordersData ?? []) {
      const deliveryDate = (order as any).delivery_date as string | null;
      let deadline: string | null = null;
      if (deliveryDate) {
        const d = new Date(deliveryDate);
        d.setDate(d.getDate() - 7); // one week before delivery
        const fri = getFridayOfWeek(d); // snap to Friday of that week
        deadline = fri.toISOString().slice(0, 10);
      }
      for (const line of (order as any).order_lines ?? []) {
        const bundle = line.bundles;
        if (!bundle) continue;
        const lineQty = line.quantity ?? 0;
        // Collect sample keys: from bundle_colors (old-style) or bundle_items (multi-quality)
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
          if (deadline) {
            const existing = deadlineMap.get(k);
            if (!existing || deadline < existing) {
              deadlineMap.set(k, deadline);
            }
          }
        }
      }
    }

    // Build sample info map for name lookups
    const sampleInfoMap = new Map<
      string,
      { qualityName: string; colorName: string; hexColor: string | null; dimensionName: string; minStock: number }
    >();
    for (const s of (samplesData ?? []) as any[]) {
      const k = stockKey(s.quality_id, s.color_code_id, s.dimension_id);
      sampleInfoMap.set(k, {
        qualityName: s.qualities?.name ?? "",
        colorName: s.color_codes?.name ?? "",
        hexColor: s.color_codes?.hex_color ?? null,
        dimensionName: s.sample_dimensions?.name ?? "",
        minStock: s.min_stock,
      });
    }

    const result: ShortageRow[] = [];
    const seen = new Set<string>();

    // 1. Backorder shortages
    for (const [k, needed] of boMap.entries()) {
      const fin = finMap.get(k) ?? 0;
      const shortage = needed - fin;
      if (shortage <= 0) continue;

      const [quality_id, color_code_id, dimension_id] = k.split("|");
      const info = sampleInfoMap.get(k);

      const boKey = `backorder|${k}`;
      seen.add(boKey);

      result.push({
        quality_id,
        color_code_id,
        dimension_id,
        qualityName: info?.qualityName ?? "Onbekend",
        colorName: info?.colorName ?? "Onbekend",
        hexColor: info?.hexColor ?? null,
        dimensionName: info?.dimensionName ?? "",
        needed,
        finished: fin,
        shortage,
        reason: "backorder",
        deadline: deadlineMap.get(k) ?? null,
      });
    }

    // 2. Minimum stock shortages
    for (const s of (samplesData ?? []) as any[]) {
      if (s.min_stock <= 0) continue;
      const k = stockKey(s.quality_id, s.color_code_id, s.dimension_id);
      const fin = finMap.get(k) ?? 0;
      const bo = boMap.get(k) ?? 0;
      const vrij = fin - bo;
      const shortage = s.min_stock - vrij;
      if (shortage <= 0) continue;

      const info = sampleInfoMap.get(k);

      result.push({
        quality_id: s.quality_id,
        color_code_id: s.color_code_id,
        dimension_id: s.dimension_id,
        qualityName: info?.qualityName ?? "",
        colorName: info?.colorName ?? "",
        hexColor: info?.hexColor ?? null,
        dimensionName: info?.dimensionName ?? "",
        needed: s.min_stock,
        finished: fin,
        shortage,
        reason: "minimum",
        deadline: null,
      });
    }

    setShortages(result);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // nulls (minimum stock, no deadline) go last when ascending
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

  /* ─── Week planning ─── */

  const weekPlanning: WeekPlan[] = (() => {
    // Group backorder shortages by deadline week
    const backorderRows = shortages.filter((s) => s.reason === "backorder" && s.deadline);
    const minimumRows = shortages.filter((s) => s.reason === "minimum" || !s.deadline);

    // Group by ISO week
    const weekMap = new Map<number, { rows: ShortageRow[]; firstDate: Date }>();

    for (const row of backorderRows) {
      const dl = new Date(row.deadline! + "T00:00:00");
      const wk = getISOWeek(dl);
      const existing = weekMap.get(wk);
      if (existing) {
        existing.rows.push(row);
      } else {
        weekMap.set(wk, { rows: [row], firstDate: dl });
      }
    }

    // Add minimum stock rows as "geen deadline" week (week 99 for sorting)
    if (minimumRows.length > 0) {
      const totalMinShortage = minimumRows.reduce((sum, r) => sum + r.shortage, 0);
      if (totalMinShortage > 0) {
        weekMap.set(9999, { rows: minimumRows, firstDate: new Date("2099-12-31") });
      }
    }

    // Sort weeks and calculate cumulative
    const sortedWeeks = Array.from(weekMap.entries()).sort((a, b) => a[0] - b[0]);
    const currentWeek = getISOWeek(new Date());

    let cumNeeded = 0;
    let cumCapacity = 0;

    return sortedWeeks.map(([wk, { rows, firstDate }]) => {
      const needed = rows.reduce((sum, r) => sum + r.shortage, 0);
      cumNeeded += needed;

      // Calculate how many weeks of capacity we've had up to this point
      if (wk === 9999) {
        // Minimum stock items — capacity continues from last backorder week
        cumCapacity += weeklyCapacity;
      } else {
        const weeksFromNow = Math.max(1, wk - currentWeek + 1);
        cumCapacity = weeksFromNow * weeklyCapacity;
      }

      const fri = wk === 9999 ? null : getFridayOfWeek(firstDate);
      const weekLabel = wk === 9999
        ? "Geen deadline"
        : `Wk ${wk} — ${fri!.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`;

      return {
        weekNr: wk,
        weekLabel,
        needed,
        cumNeeded,
        capacity: weeklyCapacity,
        cumCapacity,
        surplus: cumCapacity - cumNeeded,
        rows,
      };
    });
  })();

  const totalWeeksNeeded = totalShortageCount > 0
    ? Math.ceil(totalShortageCount / weeklyCapacity)
    : 0;

  const behindSchedule = weekPlanning.some((wp) => wp.weekNr !== 9999 && wp.surplus < 0);

  /* ─── Checkbox handling ─── */

  function toggleCheck(key: string) {
    setCheckedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // When a checkbox is toggled on, open the finishing modal for that row
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
                  const currentWk = getISOWeek(new Date());
                  const isThisWeek = wp.weekNr === currentWk;

                  return (
                    <tr
                      key={wp.weekNr}
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
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const dl = new Date(row.deadline + "T00:00:00");
                          const weekNr = getISOWeek(dl);
                          const currentWeek = getISOWeek(today);
                          const isOverdue = dl.getTime() < today.getTime();
                          const isThisWeek = weekNr === currentWeek;
                          const isNextWeek = weekNr === currentWeek + 1;
                          const formatted = dl.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
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
