"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Boxes, ArrowRight } from "lucide-react";

interface PipelineStats {
  finished_total: number;
  bundle_total: number;
}

export function PipelineView() {
  const supabase = createClient();
  const [stats, setStats] = useState<PipelineStats>({ finished_total: 0, bundle_total: 0 });

  async function loadStats() {
    const [finishedResult, bundleResult] = await Promise.all([
      supabase.from("finished_stock").select("quantity"),
      supabase.from("bundle_stock").select("quantity"),
    ]);
    setStats({
      finished_total: (finishedResult.data ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0),
      bundle_total: (bundleResult.data ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0),
    });
  }

  useEffect(() => {
    loadStats();
    const channel = supabase
      .channel("stock-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "finished_stock" }, () => loadStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_stock" }, () => loadStats())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stages = [
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
