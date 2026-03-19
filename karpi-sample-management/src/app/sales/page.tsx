"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Package, Clock, ArrowUpRight, Boxes, CheckCircle, Wrench } from "lucide-react";

interface BundleAvailability {
  bundle_config_id: string;
  bundle_name: string;
  bundles_ready: number;
  bundles_makeable: number;
}

export default function SalesDashboard() {
  const supabase = createClient();
  const [bundles, setBundles] = useState<BundleAvailability[]>([]);
  const [bundleTotal, setBundleTotal] = useState(0);

  async function loadData() {
    const { data } = await supabase
      .from("v_bundle_availability")
      .select("*")
      .order("bundle_name");
    const rows = (data as BundleAvailability[]) ?? [];
    setBundles(rows);
    setBundleTotal(rows.reduce((sum, r) => sum + (r.bundles_ready ?? 0), 0));
  }

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("sales-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_stock" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "finished_stock" }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h2 className="font-display text-3xl tracking-tight text-foreground">
          Verkoop Overzicht
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bundels beschikbaar en levertijden
        </p>
      </div>

      {/* Summary stat */}
      <div className="flex gap-4">
        <div className="flex-1 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 p-6 ring-1 ring-emerald-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/60">Bundels klaar</span>
            <Boxes size={20} className="text-emerald-600 opacity-60" />
          </div>
          <div className="mt-2 font-display text-5xl tracking-tight text-emerald-900">{bundleTotal}</div>
          <div className="mt-1 text-xs text-foreground/40">totaal over alle configuraties</div>
        </div>
        <div className="flex-1 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 p-6 ring-1 ring-amber-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/60">Maakbaar</span>
            <Wrench size={20} className="text-amber-600 opacity-60" />
          </div>
          <div className="mt-2 font-display text-5xl tracking-tight text-amber-900">
            {bundles.reduce((sum, r) => sum + (r.bundles_makeable ?? 0), 0)}
          </div>
          <div className="mt-1 text-xs text-foreground/40">uit huidige voorraad</div>
        </div>
      </div>

      {/* Bundle availability table */}
      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
          Per bundel
        </h3>
        {bundles.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
            <Boxes size={32} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Geen bundel-configuraties gevonden.</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Configureer bundels via Management.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bundles.map((bundle) => (
              <div
                key={bundle.bundle_config_id}
                className="flex items-center justify-between rounded-xl bg-card px-5 py-4 ring-1 ring-border transition-all duration-200 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Package size={18} className="text-primary" />
                  </div>
                  <span className="font-medium text-card-foreground">{bundle.bundle_name}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle size={14} className="text-emerald-500" />
                      <span className="text-sm font-semibold text-emerald-800">{bundle.bundles_ready}</span>
                      <span className="text-xs text-muted-foreground">klaar</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1.5">
                      <Wrench size={14} className="text-amber-500" />
                      <span className="text-sm font-semibold text-amber-800">{bundle.bundles_makeable}</span>
                      <span className="text-xs text-muted-foreground">maakbaar</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
          Meer details
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Link href="/sales/availability" className="group">
            <div className="rounded-2xl bg-card p-5 ring-1 ring-border transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 hover:ring-primary/30">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-primary/10 p-2.5">
                  <Package size={20} className="text-primary" />
                </div>
                <ArrowUpRight
                  size={16}
                  className="text-muted-foreground/30 transition-all duration-300 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-card-foreground">Beschikbaarheid</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">Maakbaarheid per bundel</p>
            </div>
          </Link>
          <Link href="/sales/delivery" className="group">
            <div className="rounded-2xl bg-card p-5 ring-1 ring-border transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 hover:ring-primary/30">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-primary/10 p-2.5">
                  <Clock size={20} className="text-primary" />
                </div>
                <ArrowUpRight
                  size={16}
                  className="text-muted-foreground/30 transition-all duration-300 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-card-foreground">Levertijden</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">Pipeline & inschatting</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
