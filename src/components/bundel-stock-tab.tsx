"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ChevronRight,
  ChevronDown,
  Package,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface BundleRow {
  id: string;
  name: string;
  quality_name: string;
  quality_code: string;
  dimension_name: string;
  color_count: number;
  colors: { code: string; name: string; hex_color: string | null }[];
  total_stock: number;
}

type SortField = "name" | "quality" | "dimension" | "colors" | "stock";
type SortDir = "asc" | "desc";

/* ─── Component ──────────────────────────────────────── */

export function BundelStockTab() {
  const supabase = createClient();

  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const loadData = useCallback(async () => {
    const [{ data: bundleData }, { data: stockData }] = await Promise.all([
      supabase
        .from("bundles")
        .select(
          "id, name, qualities(name, code), sample_dimensions(name), bundle_colors(color_codes(code, name, hex_color))"
        )
        .eq("active", true)
        .order("name"),
      supabase
        .from("bundle_stock")
        .select("bundle_id, quantity") as any,
    ]);

    // Build stock map: bundle_id -> total quantity
    const stockMap = new Map<string, number>();
    for (const s of (stockData ?? []) as any[]) {
      stockMap.set(s.bundle_id, (stockMap.get(s.bundle_id) ?? 0) + s.quantity);
    }

    const rows: BundleRow[] = (bundleData ?? []).map((b: any) => {
      const colors = (b.bundle_colors ?? [])
        .map((bc: any) => bc.color_codes)
        .filter(Boolean);
      return {
        id: b.id,
        name: b.name,
        quality_name: b.qualities?.name ?? "",
        quality_code: b.qualities?.code ?? "",
        dimension_name: b.sample_dimensions?.name ?? "",
        color_count: colors.length,
        colors,
        total_stock: stockMap.get(b.id) ?? 0,
      };
    });

    setBundles(rows);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (sortField !== field)
      return <ArrowUpDown size={12} className="ml-1 inline opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp size={12} className="ml-1 inline" />
    ) : (
      <ArrowDown size={12} className="ml-1 inline" />
    );
  }

  /* ─── Filter & sort ─── */

  const filtered = bundles.filter((b) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.quality_name.toLowerCase().includes(q) ||
      b.quality_code.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "name":
        return a.name.localeCompare(b.name) * dir;
      case "quality":
        return a.quality_name.localeCompare(b.quality_name) * dir;
      case "dimension":
        return a.dimension_name.localeCompare(b.dimension_name) * dir;
      case "colors":
        return (a.color_count - b.color_count) * dir;
      case "stock":
        return (a.total_stock - b.total_stock) * dir;
      default:
        return 0;
    }
  });

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const inStock = sorted.filter((b) => b.total_stock > 0).length;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <svg
          className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Zoek op bundel of kwaliteit..."
          className="w-full rounded-lg border border-border bg-card pl-8 pr-3 py-2 text-sm text-card-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
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
            {bundles.length === 0
              ? "Nog geen bundels aangemaakt. Ga naar Collecties & Bundels om bundels aan te maken."
              : "Geen bundels gevonden voor deze zoekopdracht."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="w-8 px-2 py-3" />
                  <th
                    className="px-3 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("name")}
                  >
                    Bundel
                    <SortIcon field="name" />
                  </th>
                  <th
                    className="px-3 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("quality")}
                  >
                    Kwaliteit
                    <SortIcon field="quality" />
                  </th>
                  <th
                    className="px-3 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("dimension")}
                  >
                    Afmeting
                    <SortIcon field="dimension" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("colors")}
                  >
                    Kleuren
                    <SortIcon field="colors" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-green-700 cursor-pointer select-none hover:text-green-900"
                    onClick={() => toggleSort("stock")}
                  >
                    Op voorraad
                    <SortIcon field="stock" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((b) => {
                  const isExpanded = expandedRows.has(b.id);
                  return (
                    <React.Fragment key={b.id}>
                      <tr
                        className="border-b border-border/50 transition-colors hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleRow(b.id)}
                      >
                        <td className="px-2 py-2.5 text-center text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-card-foreground">
                          {b.name}
                        </td>
                        <td className="px-3 py-2.5 text-card-foreground">
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">
                            {b.quality_code}
                          </span>
                          {b.quality_name}
                        </td>
                        <td className="px-3 py-2.5 text-card-foreground">
                          {b.dimension_name}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-card-foreground">
                          {b.color_count}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {b.total_stock > 0 ? (
                            <span className="inline-flex min-w-[1.5rem] justify-center rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-800">
                              {b.total_stock}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/30">
                              &mdash;
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded: colors */}
                      {isExpanded && (
                        <tr className="border-b border-border/50">
                          <td />
                          <td colSpan={5} className="px-3 py-3 align-top">
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Kleuren in bundel
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {b.colors.map((c, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-xs ring-1 ring-border/50"
                                >
                                  <div
                                    className="h-3.5 w-3.5 rounded-sm"
                                    style={{
                                      backgroundColor:
                                        c.hex_color || "#e5e7eb",
                                    }}
                                  />
                                  <span className="font-mono">
                                    {c.code}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {c.name}
                                  </span>
                                </div>
                              ))}
                              {b.colors.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Geen kleuren gekoppeld
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
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
          <span>{sorted.length} bundels</span>
          <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
            {inStock} op voorraad
          </span>
        </div>
      )}
    </div>
  );
}
