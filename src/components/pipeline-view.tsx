"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Scissors, Sparkles, Boxes, ArrowRight } from "lucide-react";

interface PipelineStats {
  raw_total: number;
  finished_total: number;
  bundle_total: number;
}

export function PipelineView() {
  const supabase = createClient();
  const [stats, setStats] = useState<PipelineStats>({ raw_total: 0, finished_total: 0, bundle_total: 0 });

  // TODO: Replace with server-side aggregation (RPC or view) when stock data grows
  async function loadStats() {
    const [rawResult, finishedResult, bundleResult] = await Promise.all([
      supabase.from("raw_stock").select("quantity"),
      supabase.from("finished_stock").select("quantity"),
      supabase.from("bundle_stock").select("quantity"),
    ]);
    setStats({
      raw_total: (rawResult.data ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0),
      finished_total: (finishedResult.data ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0),
      bundle_total: (bundleResult.data ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0),
    });
  }

  useEffect(() => {
    loadStats();
    const channel = supabase
      .channel("stock-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "raw_stock" }, () => loadStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "finished_stock" }, () => loadStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_stock" }, () => loadStats())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // supabase is a singleton — stable reference, intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stages = [
    {
      label: "Gesneden",
      value: stats.raw_total,
      icon: <Scissors size={20} />,
      gradient: "from-amber-50 to-orange-50",
      iconColor: "text-amber-600",
      valueColor: "text-amber-900",
      ringColor: "ring-amber-200",
    },
    {
      label: "Afgewerkt",
      value: stats.finished_total,
      icon: <Sparkles size={20} />,
      gradient: "from-yellow-50 to-amber-50",
      iconColor: "text-yellow-600",
      valueColor: "text-yellow-900",
      ringColor: "ring-yellow-200",
    },
    {
      label: "Bundels",
      value: stats.bundle_total,
      icon: <Boxes size={20} />,
      gradient: "from-emerald-50 to-green-50",
      iconColor: "text-emerald-600",
      valueColor: "text-emerald-900",
      ringColor: "ring-emerald-200",
    },
  ];

  return (
    <div className="flex items-stretch gap-3">
      {stages.map((stage, i) => (
        <div key={stage.label} className="contents">
          <div
            className={`group relative flex flex-1 flex-col justify-between rounded-2xl bg-gradient-to-br ${stage.gradient} p-5 ring-1 ${stage.ringColor} transition-all duration-300 hover:shadow-md hover:-translate-y-0.5`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/60">{stage.label}</span>
              <span className={`${stage.iconColor} opacity-60`}>{stage.icon}</span>
            </div>
            <div className={`mt-3 font-display text-4xl tracking-tight ${stage.valueColor}`}>
              {stage.value}
            </div>
            <div className="mt-2 text-xs text-foreground/40">staaltjes</div>
          </div>
          {i < stages.length - 1 && (
            <div className="flex items-center px-1">
              <ArrowRight size={16} className="text-foreground/20" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
