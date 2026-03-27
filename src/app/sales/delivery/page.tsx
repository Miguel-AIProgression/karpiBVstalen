"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface StockLocation {
  label: string;
  quantity: number;
}

interface PipelineRow {
  bundle_id: string;
  bundle_name: string;
  quality_name: string;
  quality_code: string;
  color_code: string;
  color_name: string;
  dimension_name: string;
  raw_stock_total: number;
  finished_stock_total: number;
  bundle_stock_total: number;
  raw_stock_locations: StockLocation[] | null;
  finished_stock_locations: StockLocation[] | null;
  collection_names: string | null;
}

interface CollectionSummary {
  name: string;
  bundleCount: number;
  colorCount: number;
  totalBundleStock: number;
}

export default function DeliveryPage() {
  const supabase = createClient();
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [filterBundle, setFilterBundle] = useState<string>("");
  const [filterQuality, setFilterQuality] = useState<string>("");

  useEffect(() => {
    supabase.from("v_pipeline_status").select("*").order("bundle_name")
      .then(({ data }) => setPipeline((data as PipelineRow[]) ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Collecties met samenvattingen
  const collectionSummaries = useMemo(() => {
    const map = new Map<string, { bundles: Set<string>; colors: Set<string>; bundleStock: number }>();
    for (const row of pipeline) {
      const names = row.collection_names ? row.collection_names.split(", ") : ["Zonder collectie"];
      for (const name of names) {
        if (!map.has(name)) map.set(name, { bundles: new Set(), colors: new Set(), bundleStock: 0 });
        const entry = map.get(name)!;
        if (!entry.bundles.has(row.bundle_id)) {
          entry.bundles.add(row.bundle_id);
          entry.bundleStock += row.bundle_stock_total;
        }
        entry.colors.add(row.color_code);
      }
    }
    return [...map.entries()]
      .map(([name, data]): CollectionSummary => ({
        name,
        bundleCount: data.bundles.size,
        colorCount: data.colors.size,
        totalBundleStock: data.bundleStock,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pipeline]);

  // Gefilterde bundels voor geselecteerde collectie
  const filteredBundles = useMemo(() => {
    if (!selectedCollection) return [];
    const isUncollected = selectedCollection === "Zonder collectie";
    const rows = pipeline.filter(row => {
      const inCollection = isUncollected
        ? !row.collection_names
        : row.collection_names?.includes(selectedCollection);
      if (!inCollection) return false;
      if (filterBundle && row.bundle_name !== filterBundle) return false;
      if (filterQuality && row.quality_code !== filterQuality) return false;
      return true;
    });

    const map = new Map<string, PipelineRow[]>();
    for (const row of rows) {
      if (!map.has(row.bundle_id)) map.set(row.bundle_id, []);
      map.get(row.bundle_id)!.push(row);
    }
    return [...map.entries()];
  }, [pipeline, selectedCollection, filterBundle, filterQuality]);

  // Filteropties binnen geselecteerde collectie
  const bundleOptions = useMemo(() => {
    if (!selectedCollection) return [];
    const isUncollected = selectedCollection === "Zonder collectie";
    const rows = pipeline.filter(r =>
      isUncollected ? !r.collection_names : r.collection_names?.includes(selectedCollection)
    );
    return [...new Set(rows.map(r => r.bundle_name))].sort();
  }, [pipeline, selectedCollection]);

  const qualityOptions = useMemo(() => {
    if (!selectedCollection) return [];
    const isUncollected = selectedCollection === "Zonder collectie";
    let rows = pipeline.filter(r =>
      isUncollected ? !r.collection_names : r.collection_names?.includes(selectedCollection)
    );
    // Als een bundel geselecteerd is, toon alleen de kwaliteit van die bundel
    if (filterBundle) {
      rows = rows.filter(r => r.bundle_name === filterBundle);
    }
    return [...new Set(rows.map(r => r.quality_code))].sort();
  }, [pipeline, selectedCollection, filterBundle]);

  const colorDisplay = (code: string, name: string) => {
    if (code === name || !name) return code;
    return `${code} — ${name}`;
  };

  const stockCell = (total: number, locations: StockLocation[] | null, variant: "orange" | "yellow") => {
    const colors = {
      orange: "bg-orange-100 text-orange-800",
      yellow: "bg-yellow-100 text-yellow-800",
    };
    return (
      <div className="flex items-center gap-2">
        <span className={`inline-block rounded px-2 py-1 text-sm font-medium ${colors[variant]} ${total === 0 ? "opacity-50" : ""}`}>
          {total}
        </span>
        {locations && locations.length > 0 && (
          <span className="text-xs text-gray-500">
            {locations.map(l => `${l.label} (${l.quantity})`).join(", ")}
          </span>
        )}
      </div>
    );
  };

  // Collectie-overzicht (geen collectie geselecteerd)
  if (!selectedCollection) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Levertijden & Pipeline</h2>
        <p className="text-sm text-gray-600">Selecteer een collectie om de bundels en voorraad te bekijken.</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collectionSummaries.map(col => (
            <Card
              key={col.name}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => { setSelectedCollection(col.name); setFilterBundle(""); setFilterQuality(""); }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{col.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>{col.bundleCount} bundel{col.bundleCount !== 1 ? "s" : ""}</span>
                  <span>{col.colorCount} kleuren</span>
                </div>
                <div className="mt-2">
                  <span className={`inline-block rounded px-2 py-1 text-sm font-medium bg-green-100 text-green-800 ${col.totalBundleStock === 0 ? "opacity-50" : ""}`}>
                    {col.totalBundleStock}
                  </span>
                  <span className="ml-2 text-xs text-gray-500">bundels op voorraad</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {collectionSummaries.length === 0 && (
          <p className="text-sm text-gray-500">Geen collecties gevonden.</p>
        )}
      </div>
    );
  }

  // Detail-weergave voor geselecteerde collectie
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          onClick={() => setSelectedCollection(null)}
        >
          ← Alle collecties
        </button>
        <h2 className="text-2xl font-bold">{selectedCollection}</h2>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          value={filterBundle}
          onChange={e => setFilterBundle(e.target.value)}
        >
          <option value="">Alle bundels</option>
          {bundleOptions.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <select
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          value={filterQuality}
          onChange={e => setFilterQuality(e.target.value)}
        >
          <option value="">Alle kwaliteiten</option>
          {qualityOptions.map(q => <option key={q} value={q}>{q}</option>)}
        </select>

        {(filterBundle || filterQuality) && (
          <button
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            onClick={() => { setFilterBundle(""); setFilterQuality(""); }}
          >
            Wis filters
          </button>
        )}
      </div>

      {/* Bundels */}
      {filteredBundles.length === 0 ? (
        <p className="text-sm text-gray-500">Geen bundels gevonden.</p>
      ) : (
        filteredBundles.map(([bundleId, rows]) => {
          const first = rows[0];
          return (
            <Card key={bundleId}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{first.bundle_name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {first.quality_code} · {first.dimension_name}
                    </Badge>
                    <span className={`inline-block rounded px-2 py-1 text-sm font-medium bg-green-100 text-green-800 ${first.bundle_stock_total === 0 ? "opacity-50" : ""}`}>
                      {first.bundle_stock_total}
                    </span>
                    <span className="text-xs text-gray-500">bundels op voorraad</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kleur</TableHead>
                      <TableHead>Gesneden (locatie)</TableHead>
                      <TableHead>Afgewerkt (locatie)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {colorDisplay(row.color_code, row.color_name)}
                        </TableCell>
                        <TableCell>
                          {stockCell(row.raw_stock_total, row.raw_stock_locations, "orange")}
                        </TableCell>
                        <TableCell>
                          {stockCell(row.finished_stock_total, row.finished_stock_locations, "yellow")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
