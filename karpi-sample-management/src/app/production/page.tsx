"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Scissors, Sparkles, Boxes, ArrowRight, Package, Filter, X, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PipelineRow {
  quality_id: string;
  quality_name: string;
  quality_code: string;
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

interface QualityOption { id: string; name: string; }

type AddMode = null | "quality" | "color" | "dimension";

export default function ProductionDashboard() {
  const supabase = createClient();
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [recentCuts, setRecentCuts] = useState<RecentBatch[]>([]);
  const [recentFinishing, setRecentFinishing] = useState<RecentBatch[]>([]);
  const [filterProduct, setFilterProduct] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [filterDimension, setFilterDimension] = useState("");

  // Add product state
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [addQualities, setAddQualities] = useState<QualityOption[]>([]);
  const [addStatus, setAddStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [addError, setAddError] = useState("");

  // Form fields
  const [newQualityName, setNewQualityName] = useState("");
  const [newQualityCode, setNewQualityCode] = useState("");
  const [newColorCode, setNewColorCode] = useState("");
  const [newColorName, setNewColorName] = useState("");
  const [newColorQuality, setNewColorQuality] = useState("");
  const [newDimWidth, setNewDimWidth] = useState("");
  const [newDimHeight, setNewDimHeight] = useState("");
  const [newDimName, setNewDimName] = useState("");

  const loadAddOptions = useCallback(async () => {
    const { data: quals } = await supabase
      .from("qualities")
      .select("id, name")
      .eq("active", true)
      .order("name");
    setAddQualities(quals ?? []);
  }, [supabase]);

  function resetAddForm() {
    setAddStatus("idle");
    setAddError("");
    setNewQualityName(""); setNewQualityCode("");
    setNewColorCode(""); setNewColorName(""); setNewColorQuality("");
    setNewDimWidth(""); setNewDimHeight(""); setNewDimName("");
  }

  async function handleAddQuality(e: React.FormEvent) {
    e.preventDefault();
    if (!newQualityName || !newQualityCode) return;
    setAddStatus("saving");

    const { error } = await supabase.from("qualities").insert({
      name: newQualityName,
      code: newQualityCode,
    });
    if (error) { setAddStatus("error"); setAddError(error.message); }
    else { setAddStatus("success"); resetAddForm(); setAddStatus("success"); loadAddOptions(); loadPipeline(); }
  }

  async function handleAddColor(e: React.FormEvent) {
    e.preventDefault();
    if (!newColorCode || !newColorQuality) return;
    setAddStatus("saving");
    const { error } = await supabase.from("color_codes").insert({
      quality_id: newColorQuality,
      code: newColorCode,
      name: newColorName || newColorCode,
    });
    if (error) { setAddStatus("error"); setAddError(error.message); }
    else { setAddStatus("success"); resetAddForm(); setAddStatus("success"); loadPipeline(); }
  }

  async function handleAddDimension(e: React.FormEvent) {
    e.preventDefault();
    const w = Number(newDimWidth);
    const h = Number(newDimHeight);
    if (!w || !h) return;
    setAddStatus("saving");
    const { error } = await supabase.from("sample_dimensions").insert({
      width_cm: w,
      height_cm: h,
      name: newDimName || `${w}x${h}`,
    });
    if (error) { setAddStatus("error"); setAddError(error.message); }
    else { setAddStatus("success"); resetAddForm(); setAddStatus("success"); loadPipeline(); }
  }

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
    if (addMode) loadAddOptions();
  }, [addMode, loadAddOptions]);

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

  // Unique filter options — each dropdown only shows values that exist given the other active filters
  const productsBase = pipeline.filter((r) => {
    if (filterColor && r.color_code !== filterColor) return false;
    if (filterDimension && r.dimension_name !== filterDimension) return false;
    return true;
  });
  const colorsBase = pipeline.filter((r) => {
    if (filterProduct && r.quality_code !== filterProduct) return false;
    if (filterDimension && r.dimension_name !== filterDimension) return false;
    return true;
  });
  const dimensionsBase = pipeline.filter((r) => {
    if (filterProduct && r.quality_code !== filterProduct) return false;
    if (filterColor && r.color_code !== filterColor) return false;
    return true;
  });
  const products = Array.from(new Set(productsBase.map((r) => r.quality_code))).sort();
  const colors = Array.from(new Set(colorsBase.map((r) => r.color_code))).sort((a, b) => Number(a) - Number(b));
  const dimensions = Array.from(new Set(dimensionsBase.map((r) => r.dimension_name))).sort();

  const hasFilters = filterProduct || filterColor || filterDimension;

  // Filter pipeline
  const filtered = pipeline.filter((row) => {
    if (filterProduct && row.quality_code !== filterProduct) return false;
    if (filterColor && row.color_code !== filterColor) return false;
    if (filterDimension && row.dimension_name !== filterDimension) return false;
    return true;
  });

  // Aggregate totals from filtered data
  const totals = filtered.reduce(
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

      {/* Add product panel */}
      <div className="rounded-2xl ring-1 ring-border overflow-hidden">
        <button
          onClick={() => { setAddMode(addMode ? null : "quality"); resetAddForm(); }}
          className="flex w-full items-center justify-between bg-card px-5 py-3.5 text-sm font-medium text-card-foreground transition-colors hover:bg-muted/50"
        >
          <span className="flex items-center gap-2">
            <Plus size={16} className="text-muted-foreground" />
            Product, kleur of afmeting toevoegen
          </span>
          {addMode ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </button>
        {addMode && (
          <div className="border-t border-border bg-card/50 p-5 space-y-4">
            {/* Mode tabs */}
            <div className="flex gap-2">
              {([
                ["quality", "Nieuw product"],
                ["color", "Nieuwe kleur"],
                ["dimension", "Nieuwe afmeting"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => { setAddMode(mode); resetAddForm(); }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    addMode === mode
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {addMode === "quality" && (
              <form onSubmit={handleAddQuality} className="space-y-3">
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5 w-32">
                    <Label className="text-xs">Afkorting</Label>
                    <Input value={newQualityCode} onChange={(e) => setNewQualityCode(e.target.value)} placeholder="bijv. AEST" required />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-xs">Productnaam</Label>
                    <Input value={newQualityName} onChange={(e) => setNewQualityName(e.target.value)} placeholder="bijv. Aesthesia" required />
                  </div>
                  <Button type="submit" disabled={addStatus === "saving" || !newQualityName || !newQualityCode}>
                    {addStatus === "saving" ? "Opslaan..." : "Toevoegen"}
                  </Button>
                </div>
              </form>
            )}

            {addMode === "color" && (
              <form onSubmit={handleAddColor} className="flex items-end gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs">Product</Label>
                  <Select value={newColorQuality} onValueChange={(v) => setNewColorQuality(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecteer product">
                        {addQualities.find((q) => q.id === newColorQuality)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {addQualities.map((q) => (
                        <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 w-28">
                  <Label className="text-xs">Code</Label>
                  <Input value={newColorCode} onChange={(e) => setNewColorCode(e.target.value)} placeholder="bijv. 13" required />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs">Naam (optioneel)</Label>
                  <Input value={newColorName} onChange={(e) => setNewColorName(e.target.value)} placeholder="bijv. Zandbeige" />
                </div>
                <Button type="submit" disabled={addStatus === "saving" || !newColorQuality || !newColorCode}>
                  {addStatus === "saving" ? "Opslaan..." : "Toevoegen"}
                </Button>
              </form>
            )}

            {addMode === "dimension" && (
              <form onSubmit={handleAddDimension} className="flex items-end gap-3">
                <div className="space-y-1.5 w-28">
                  <Label className="text-xs">Breedte (cm)</Label>
                  <Input type="number" min="1" value={newDimWidth} onChange={(e) => setNewDimWidth(e.target.value)} placeholder="30" required />
                </div>
                <div className="space-y-1.5 w-28">
                  <Label className="text-xs">Hoogte (cm)</Label>
                  <Input type="number" min="1" value={newDimHeight} onChange={(e) => setNewDimHeight(e.target.value)} placeholder="50" required />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs">Naam (optioneel)</Label>
                  <Input value={newDimName} onChange={(e) => setNewDimName(e.target.value)} placeholder="bijv. 30x50" />
                </div>
                <Button type="submit" disabled={addStatus === "saving" || !newDimWidth || !newDimHeight}>
                  {addStatus === "saving" ? "Opslaan..." : "Toevoegen"}
                </Button>
              </form>
            )}

            {addStatus === "error" && <p className="text-sm text-red-600">{addError}</p>}
            {addStatus === "success" && <p className="text-sm text-green-600">Succesvol toegevoegd!</p>}
          </div>
        )}
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

      {/* Filters */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
            <Filter size={14} />
            Per product
          </div>
          {hasFilters && (
            <span className="text-xs text-muted-foreground">
              {filtered.length} van {pipeline.length} rijen
            </span>
          )}
          {hasFilters && (
            <button
              onClick={() => { setFilterProduct(""); setFilterColor(""); setFilterDimension(""); }}
              className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/80"
            >
              <X size={12} /> Wis filters
            </button>
          )}
        </div>
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Alle producten</option>
            {products.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filterColor}
            onChange={(e) => setFilterColor(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Alle kleuren</option>
            {colors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterDimension}
            onChange={(e) => setFilterDimension(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Alle maten</option>
            {dimensions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
            <Package size={32} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {hasFilters ? "Geen resultaten voor deze filters." : "Geen voorraad in de pipeline."}
            </p>
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
                {filtered.map((row) => {
                  const key = `${row.quality_id}-${row.color_code_id}-${row.dimension_id}`;
                  return (
                    <tr key={key} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-card-foreground">{row.quality_code}</div>
                        <div className="text-xs text-muted-foreground">{row.quality_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-card-foreground">{row.color_code}</span>
                          {row.color_name !== row.color_code && (
                            <span className="text-xs text-muted-foreground">{row.color_name}</span>
                          )}
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
