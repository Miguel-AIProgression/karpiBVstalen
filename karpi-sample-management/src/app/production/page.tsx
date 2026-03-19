"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Scissors, Sparkles, Boxes, ArrowRight, Package } from "lucide-react";

interface PipelineRow {
  quality_id: string;
  quality_name: string;
  quality_code: string;
  collection_name: string;
  color_code_id: string;
  color_code: string;
  color_name: string;
  dimension_id: string;
  dimension_name: string;
  raw_stock_total: number;
  finished_stock_total: number;
  bundle_stock_total: number;
}

interface RecentBatch {
  id: string;
  quantity: number;
  label: string;
  finishing?: string;
  date: string;
}

export default function ProductionDashboard() {
  const supabase = createClient();
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [recentCuts, setRecentCuts] = useState<RecentBatch[]>([]);
  const [recentFinishing, setRecentFinishing] = useState<RecentBatch[]>([]);

  async function loadPipeline() {
    const { data } = await supabase
      .from("v_pipeline_status")
      .select("*")
      .order("quality_name")
      .order("color_code")
      .order("dimension_name");
    setPipeline((data as PipelineRow[]) ?? []);
  }

  useEffect(() => {
    loadPipeline();

    supabase.from("cut_batches")
      .select("id, quantity, cut_date, qualities(name), color_codes(code, name)")
      .order("cut_date", { ascending: false }).limit(5)
      .then(({ data }) => setRecentCuts((data ?? []).map((c: any) => ({
        id: c.id,
        quantity: c.quantity,
        label: `${c.qualities?.name ?? ""} ${c.color_codes?.code ?? ""}`,
        date: c.cut_date,
      }))));

    supabase.from("finishing_batches")
      .select("id, quantity, started_at, qualities(name), color_codes(code, name), finishing_types(name)")
      .order("started_at", { ascending: false }).limit(5)
      .then(({ data }) => setRecentFinishing((data ?? []).map((f: any) => ({
        id: f.id,
        quantity: f.quantity,
        label: `${f.qualities?.name ?? ""} ${f.color_codes?.code ?? ""}`,
        finishing: f.finishing_types?.name ?? "",
        date: f.started_at,
      }))));

    const channel = supabase
      .channel("production-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "raw_stock" }, () => loadPipeline())
      .on("postgres_changes", { event: "*", schema: "public", table: "finished_stock" }, () => loadPipeline())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_stock" }, () => loadPipeline())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aggregate totals
  const totals = pipeline.reduce(
    (acc, row) => ({
      raw: acc.raw + (row.raw_stock_total ?? 0),
      finished: acc.finished + (row.finished_stock_total ?? 0),
      bundle: acc.bundle + (row.bundle_stock_total ?? 0),
    }),
    { raw: 0, finished: 0, bundle: 0 }
  );

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h2 className="font-display text-3xl tracking-tight text-foreground">
          Productie Overzicht
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Gedetailleerde pipeline per product
        </p>
      </div>

      {/* Pipeline totals */}
      <div className="flex items-stretch gap-3">
        {[
          { label: "Gesneden", value: totals.raw, icon: <Scissors size={20} />, gradient: "from-amber-50 to-orange-50", iconColor: "text-amber-600", valueColor: "text-amber-900", ringColor: "ring-amber-200" },
          { label: "Afgewerkt", value: totals.finished, icon: <Sparkles size={20} />, gradient: "from-yellow-50 to-amber-50", iconColor: "text-yellow-600", valueColor: "text-yellow-900", ringColor: "ring-yellow-200" },
          { label: "Bundels", value: totals.bundle, icon: <Boxes size={20} />, gradient: "from-emerald-50 to-green-50", iconColor: "text-emerald-600", valueColor: "text-emerald-900", ringColor: "ring-emerald-200" },
        ].map((stage, i, arr) => (
          <div key={stage.label} className="contents">
            <div className={`flex flex-1 flex-col rounded-2xl bg-gradient-to-br ${stage.gradient} p-5 ring-1 ${stage.ringColor}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground/60">{stage.label}</span>
                <span className={`${stage.iconColor} opacity-60`}>{stage.icon}</span>
              </div>
              <div className={`mt-3 font-display text-4xl tracking-tight ${stage.valueColor}`}>{stage.value}</div>
              <div className="mt-2 text-xs text-foreground/40">staaltjes</div>
            </div>
            {i < arr.length - 1 && (
              <div className="flex items-center px-1"><ArrowRight size={16} className="text-foreground/20" /></div>
            )}
          </div>
        ))}
      </div>

      {/* Pipeline detail table */}
      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
          Per product
        </h3>
        {pipeline.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
            <Package size={32} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Geen voorraad in de pipeline.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kleur</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Maat</th>
                  <th className="px-4 py-3 text-right font-medium text-amber-700">
                    <span className="flex items-center justify-end gap-1.5"><Scissors size={14} /> Gesneden</span>
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-yellow-700">
                    <span className="flex items-center justify-end gap-1.5"><Sparkles size={14} /> Afgewerkt</span>
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-emerald-700">
                    <span className="flex items-center justify-end gap-1.5"><Boxes size={14} /> Bundels</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pipeline.map((row) => {
                  const key = `${row.quality_id}-${row.color_code_id}-${row.dimension_id}`;
                  const total = (row.raw_stock_total ?? 0) + (row.finished_stock_total ?? 0) + (row.bundle_stock_total ?? 0);
                  return (
                    <tr key={key} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-card-foreground">{row.quality_name}</div>
                        <div className="text-xs text-muted-foreground">{row.collection_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-card-foreground">{row.color_code}</span>
                          <span className="text-xs text-muted-foreground">{row.color_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-card-foreground">{row.dimension_name}</td>
                      <td className="px-4 py-3 text-right">
                        {row.raw_stock_total > 0 ? (
                          <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            {row.raw_stock_total}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.finished_stock_total > 0 ? (
                          <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                            {row.finished_stock_total}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.bundle_stock_total > 0 ? (
                          <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            {row.bundle_stock_total}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
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

      {/* Recent activity */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
            Recente snij-batches
          </h3>
          <div className="space-y-1.5">
            {recentCuts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen recente batches.</p>
            ) : recentCuts.map((batch) => (
              <div key={batch.id} className="flex items-center justify-between rounded-lg bg-card px-4 py-2.5 ring-1 ring-border/50">
                <span className="text-sm text-card-foreground">{batch.label}</span>
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  +{batch.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
            Recente afwerk-batches
          </h3>
          <div className="space-y-1.5">
            {recentFinishing.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen recente batches.</p>
            ) : recentFinishing.map((batch) => (
              <div key={batch.id} className="flex items-center justify-between rounded-lg bg-card px-4 py-2.5 ring-1 ring-border/50">
                <div>
                  <span className="text-sm text-card-foreground">{batch.label}</span>
                  {batch.finishing && <span className="ml-2 text-xs text-muted-foreground">{batch.finishing}</span>}
                </div>
                <span className="rounded-md bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                  +{batch.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
