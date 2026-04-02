"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ChevronRight,
  ChevronDown,
  Package,
  CheckCircle2,
  XCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface BundleStockInfo {
  bundle_id: string;
  bundle_name: string;
  quality_name: string;
  quality_code: string;
  dimension_name: string;
  color_count: number;
  total_stock: number;
}

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  bundle_count: number;
  bundles: BundleStockInfo[];
  /** Minimum stock across all bundles — if all > 0, collection is "complete" */
  complete_sets: number;
  all_in_stock: boolean;
}

type SortField = "name" | "bundles" | "stock";
type SortDir = "asc" | "desc";

/* ─── Component ──────────────────────────────────────── */

export function CollectieStockTab() {
  const supabase = createClient();

  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const loadData = useCallback(async () => {
    const [{ data: collData }, { data: stockData }] = await Promise.all([
      supabase
        .from("collections")
        .select(
          "id, name, description, collection_bundles(bundle_id, position, bundles(id, name, qualities(name, code), sample_dimensions(name), bundle_colors(id)))"
        )
        .eq("active", true)
        .order("name"),
      supabase
        .from("bundle_stock")
        .select("bundle_id, quantity") as any,
    ]);

    // Build stock map per bundle
    const stockMap = new Map<string, number>();
    for (const s of (stockData ?? []) as any[]) {
      stockMap.set(s.bundle_id, (stockMap.get(s.bundle_id) ?? 0) + s.quantity);
    }

    const rows: CollectionRow[] = (collData ?? []).map((c: any) => {
      const collBundles = (c.collection_bundles ?? [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((cb: any) => {
          const b = cb.bundles;
          if (!b) return null;
          return {
            bundle_id: b.id,
            bundle_name: b.name,
            quality_name: b.qualities?.name ?? "",
            quality_code: b.qualities?.code ?? "",
            dimension_name: b.sample_dimensions?.name ?? "",
            color_count: (b.bundle_colors ?? []).length,
            total_stock: stockMap.get(b.id) ?? 0,
          } as BundleStockInfo;
        })
        .filter(Boolean) as BundleStockInfo[];

      const minStock =
        collBundles.length > 0
          ? Math.min(...collBundles.map((b) => b.total_stock))
          : 0;

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        bundle_count: collBundles.length,
        bundles: collBundles,
        complete_sets: minStock,
        all_in_stock: collBundles.length > 0 && minStock > 0,
      };
    });

    setCollections(rows);
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

  const filtered = collections.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "name":
        return a.name.localeCompare(b.name) * dir;
      case "bundles":
        return (a.bundle_count - b.bundle_count) * dir;
      case "stock":
        return (a.complete_sets - b.complete_sets) * dir;
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

  const completeCount = sorted.filter((c) => c.all_in_stock).length;

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
          placeholder="Zoek op collectie..."
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
            {collections.length === 0
              ? "Nog geen collecties aangemaakt. Ga naar Collecties & Bundels om collecties aan te maken."
              : "Geen collecties gevonden voor deze zoekopdracht."}
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
                    Collectie
                    <SortIcon field="name" />
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-muted-foreground">
                    Omschrijving
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("bundles")}
                  >
                    Bundels
                    <SortIcon field="bundles" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-green-700 cursor-pointer select-none hover:text-green-900"
                    onClick={() => toggleSort("stock")}
                  >
                    Complete sets
                    <SortIcon field="stock" />
                  </th>
                  <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const isExpanded = expandedRows.has(c.id);
                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        className="border-b border-border/50 transition-colors hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleRow(c.id)}
                      >
                        <td className="px-2 py-2.5 text-center text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-card-foreground">
                          {c.name}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {c.description || (
                            <span className="text-muted-foreground/30">
                              &mdash;
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-card-foreground">
                          {c.bundle_count}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {c.complete_sets > 0 ? (
                            <span className="inline-flex min-w-[1.5rem] justify-center rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-800">
                              {c.complete_sets}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/30">
                              0
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.all_in_stock ? (
                            <CheckCircle2
                              size={16}
                              className="mx-auto text-green-600"
                            />
                          ) : (
                            <XCircle
                              size={16}
                              className="mx-auto text-muted-foreground/30"
                            />
                          )}
                        </td>
                      </tr>

                      {/* Expanded: bundles with their stock */}
                      {isExpanded && (
                        <tr className="border-b border-border/50">
                          <td />
                          <td colSpan={5} className="px-3 py-3">
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Bundels in collectie
                            </h4>
                            {c.bundles.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Geen bundels gekoppeld
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {c.bundles.map((b) => (
                                  <div
                                    key={b.bundle_id}
                                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ring-1 ${
                                      b.total_stock > 0
                                        ? "bg-green-50 ring-green-200/50"
                                        : "bg-muted/30 ring-border/50"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium text-card-foreground">
                                        {b.bundle_name}
                                      </span>
                                      <span className="text-muted-foreground">
                                        <span className="font-mono">
                                          {b.quality_code}
                                        </span>{" "}
                                        {b.quality_name} &middot;{" "}
                                        {b.dimension_name} &middot;{" "}
                                        {b.color_count} kleuren
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {b.total_stock > 0 ? (
                                        <span className="inline-flex min-w-[1.5rem] justify-center rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-800">
                                          {b.total_stock}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground/50">
                                          0
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
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
          <span>{sorted.length} collecties</span>
          {completeCount > 0 && (
            <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
              {completeCount} volledig op voorraad
            </span>
          )}
        </div>
      )}
    </div>
  );
}
