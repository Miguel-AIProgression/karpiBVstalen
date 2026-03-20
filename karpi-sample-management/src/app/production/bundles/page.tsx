"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { LocationPicker } from "@/components/location-picker";
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
import { useAuth } from "@/components/auth/auth-provider";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface BundleOption {
  id: string;
  name: string;
  quality_code: string;
  quality_name: string;
  dimension_name: string;
  colors: { color_code_id: string; code: string; name: string }[];
}

interface StockMap {
  [key: string]: number;
}

export default function BundleAssemblyPage() {
  const supabase = createClient();
  const { user } = useAuth();

  const [bundles, setBundles] = useState<BundleOption[]>([]);
  const [selectedBundleId, setSelectedBundleId] = useState("");
  const [finishedStock, setFinishedStock] = useState<StockMap>({});
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const selectedBundle = bundles.find((b) => b.id === selectedBundleId);

  const loadBundles = useCallback(async () => {
    const { data } = await supabase
      .from("bundles")
      .select("id, name, quality_id, dimension_id, qualities(name, code), sample_dimensions(name)")
      .eq("active", true)
      .order("name");
    const bundleData = data as any[] | null;

    if (!bundleData) { setBundles([]); return; }

    const bundleIds = bundleData.map((b: any) => b.id);
    const { data: rawColors } = bundleIds.length > 0
      ? await supabase
          .from("bundle_colors")
          .select("bundle_id, color_code_id, color_codes(code, name)")
          .in("bundle_id", bundleIds)
      : { data: [] };
    const colorsData = rawColors as any[] | null;

    const colorsByBundle = new Map<string, BundleOption["colors"]>();
    for (const c of colorsData ?? []) {
      if (!colorsByBundle.has(c.bundle_id)) colorsByBundle.set(c.bundle_id, []);
      const cc = c.color_codes as { code: string; name: string } | null;
      colorsByBundle.get(c.bundle_id)!.push({
        color_code_id: c.color_code_id,
        code: cc?.code ?? "?",
        name: cc?.name ?? "?",
      });
    }

    setBundles(bundleData.map((b) => ({
      id: b.id,
      name: b.name,
      quality_code: (b.qualities as { name: string; code: string } | null)?.code ?? "?",
      quality_name: (b.qualities as { name: string; code: string } | null)?.name ?? "?",
      dimension_name: (b.sample_dimensions as { name: string } | null)?.name ?? "?",
      colors: (colorsByBundle.get(b.id) ?? []).sort((a, b) => Number(a.code) - Number(b.code)),
    })));
  }, [supabase]);

  const loadFinishedStock = useCallback(async () => {
    if (!selectedBundle) { setFinishedStock({}); return; }

    const { data } = await supabase
      .from("finished_stock")
      .select("color_code_id, quantity")
      .eq("quality_id", selectedBundle.colors[0] ? (bundles.find(b => b.id === selectedBundleId) as any)?.quality_id ?? "" : "")
      .gt("quantity", 0);

    // We need quality_id from the bundle - let's re-query
    const { data: bundleRow } = await supabase
      .from("bundles")
      .select("quality_id, dimension_id")
      .eq("id", selectedBundleId)
      .single();

    if (!bundleRow) { setFinishedStock({}); return; }

    const { data: stockData } = await supabase
      .from("finished_stock")
      .select("color_code_id, quantity")
      .eq("quality_id", bundleRow.quality_id)
      .eq("dimension_id", bundleRow.dimension_id);

    const map: StockMap = {};
    for (const row of stockData ?? []) {
      map[row.color_code_id] = (map[row.color_code_id] ?? 0) + row.quantity;
    }
    setFinishedStock(map);
  }, [supabase, selectedBundleId, selectedBundle, bundles]);

  useEffect(() => {
    loadBundles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedBundleId) loadFinishedStock();
    else setFinishedStock({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBundleId]);

  const totalRequired = selectedBundle?.colors.length ?? 0;
  const totalAvailable = selectedBundle?.colors.filter((c) => (finishedStock[c.color_code_id] ?? 0) >= 1).length ?? 0;
  const pct = totalRequired > 0 ? Math.round((totalAvailable / totalRequired) * 100) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedBundleId || !locationId) return;
    const qty = Math.round(Number(quantity));
    if (!qty || qty < 1) {
      setStatus("error");
      setErrorMsg("Voer een geldig aantal in (minimaal 1).");
      return;
    }

    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("bundle_batches").insert({
      bundle_id: selectedBundleId,
      location_id: locationId,
      quantity: qty,
      assembled_by: user.id,
    });

    if (error) {
      setStatus("error");
      setErrorMsg(
        error.message.includes("Insufficient")
          ? "Onvoldoende afgewerkte voorraad voor deze bundel!"
          : error.message
      );
    } else {
      setStatus("success");
      setQuantity("");
      loadFinishedStock();
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-3xl tracking-tight text-foreground">
          Bundels samenstellen
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Stel bundels samen uit afgewerkte voorraad
        </p>
      </div>

      <div className="rounded-2xl bg-card p-6 ring-1 ring-border space-y-5">
        {/* Stap 1: Bundel kiezen */}
        <div className="space-y-2">
          <Label>Bundel</Label>
          <Select
            value={selectedBundleId}
            onValueChange={(v) => {
              setSelectedBundleId(v ?? "");
              setStatus("idle");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecteer bundel">
                {selectedBundle?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {bundles.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {b.quality_code} &middot; {b.dimension_name} &middot; {b.colors.length} kleuren
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bundles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Geen bundels beschikbaar. Maak bundels aan via Management &rarr; Samenstellen.
            </p>
          )}
        </div>

        {/* Stap 2: Beschikbaarheid */}
        {selectedBundle && (
          <div className="rounded-lg bg-muted/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {selectedBundle.quality_code} &mdash; {selectedBundle.colors.length} kleuren
              </p>
              <span className={`text-xs font-semibold ${
                pct === 100 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-500"
              }`}>
                {totalAvailable} / {totalRequired} beschikbaar
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {selectedBundle.colors.map((color) => {
                const available = finishedStock[color.color_code_id] ?? 0;
                const sufficient = available >= 1;
                return (
                  <div
                    key={color.color_code_id}
                    className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-sm ring-1 ${
                      sufficient ? "bg-background/60 ring-border/40" : "bg-red-50/60 ring-red-200/60"
                    }`}
                  >
                    {sufficient ? (
                      <CheckCircle2 size={14} className="shrink-0 text-green-600" />
                    ) : (
                      <XCircle size={14} className="shrink-0 text-red-400" />
                    )}
                    <span className="font-medium font-mono">{color.code}</span>
                    {color.name !== color.code && (
                      <span className="text-muted-foreground">{color.name}</span>
                    )}
                    <span className={`ml-auto tabular-nums text-xs ${sufficient ? "text-green-600" : "text-red-500 font-medium"}`}>
                      {available} beschikbaar
                    </span>
                  </div>
                );
              })}
            </div>

            {pct < 100 && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Bundel niet compleet</p>
                  <p className="text-xs text-amber-700">
                    {totalRequired - totalAvailable} van {totalRequired} kleuren missen nog.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stap 3: Locatie + aantal */}
        {selectedBundle && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <LocationPicker onSelect={setLocationId} />
            <div className="space-y-2">
              <Label>Aantal bundels</Label>
              <Input
                type="number" min="1" value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Aantal bundels" required
              />
            </div>

            {status === "error" && <p className="text-sm text-red-600">{errorMsg}</p>}
            {status === "success" && <p className="text-sm text-green-600">Bundels succesvol samengesteld!</p>}

            <Button
              type="submit"
              disabled={status === "saving" || !selectedBundleId || !locationId || !quantity}
            >
              {status === "saving" ? "Opslaan..." : "Samenstellen"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
