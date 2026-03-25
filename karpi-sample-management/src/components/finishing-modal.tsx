"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, CheckCircle2 } from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface SampleInfo {
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  qualityName: string;
  colorName: string;
  dimensionName: string;
}

interface LocationOption {
  id: string;
  aisle: string;
  rack: string;
  level: string;
  label: string;
}

interface FinishingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sample: SampleInfo;
  shortage?: number;
  onResolved: () => void;
}

/* ─── Component ──────────────────────────────────────── */

export function FinishingModal({
  open,
  onOpenChange,
  sample,
  shortage,
  onResolved,
}: FinishingModalProps) {
  const supabase = createClient();
  const { user } = useAuth();

  const [quantity, setQuantity] = useState(shortage ?? 1);
  const [finishingTypeId, setFinishingTypeId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  const [tgtAisle, setTgtAisle] = useState("");
  const [tgtRack, setTgtRack] = useState("");
  const [tgtLevel, setTgtLevel] = useState("");

  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    const [{ data: locData }, { data: rules }] = await Promise.all([
      supabase.from("locations").select("id, aisle, rack, level, label").order("aisle").order("rack").order("level"),
      supabase.from("quality_finishing_rules").select("finishing_type_id").eq("quality_id", sample.quality_id).eq("is_allowed", true).limit(1),
    ]);
    setLocations(locData ?? []);

    // Auto-select finishing type: use quality rule, or fall back to first active type
    let ftId = rules?.[0]?.finishing_type_id ?? null;
    if (!ftId) {
      const { data: types } = await supabase
        .from("finishing_types")
        .select("id")
        .eq("active", true)
        .limit(1);
      ftId = types?.[0]?.id ?? null;
    }
    setFinishingTypeId(ftId);
  }, [supabase, sample.quality_id]);

  useEffect(() => {
    if (open) {
      setQuantity(shortage ?? 1);
      setTgtAisle(""); setTgtRack(""); setTgtLevel("");
      setError("");
      loadData();
    }
  }, [open, shortage, loadData]);

  // Location helpers
  function getAisles() {
    return Array.from(new Set(locations.map((l) => l.aisle))).sort();
  }
  function getRacks(aisle: string) {
    return Array.from(new Set(locations.filter((l) => l.aisle === aisle).map((l) => l.rack))).sort();
  }
  function getLevels(aisle: string, rack: string) {
    return Array.from(new Set(locations.filter((l) => l.aisle === aisle && l.rack === rack).map((l) => l.level))).sort();
  }
  function findLocation(aisle: string, rack: string, level: string) {
    return locations.find((l) => l.aisle === aisle && l.rack === rack && l.level === level);
  }

  const tgtLocation = findLocation(tgtAisle, tgtRack, tgtLevel);

  async function handleBook() {
    if (!tgtLocation || !finishingTypeId || !user) return;
    setBooking(true);
    setError("");

    try {
      const { error: err } = await supabase.from("finishing_batches").insert({
        quality_id: sample.quality_id,
        color_code_id: sample.color_code_id,
        dimension_id: sample.dimension_id,
        finishing_type_id: finishingTypeId,
        source_location_id: tgtLocation.id,
        target_location_id: tgtLocation.id,
        quantity,
        finished_by: user.id,
      });
      if (err) throw err;

      onResolved();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message ?? "Fout bij boeken");
    } finally {
      setBooking(false);
    }
  }

  if (!open) return null;

  const aisles = getAisles();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-background p-6 ring-1 ring-border shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Afwerken boeken</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sample info */}
        <div className="mb-5 rounded-lg bg-muted/50 p-3">
          <div className="font-medium text-card-foreground">
            {sample.qualityName} — {sample.colorName}
          </div>
          <div className="text-xs text-muted-foreground">{sample.dimensionName}</div>
          {shortage != null && (
            <div className="mt-1 text-sm text-red-600 font-semibold">
              Tekort: {shortage}
            </div>
          )}
        </div>

        {/* Quantity */}
        <div className="mb-5">
          <Label className="text-sm font-medium">Aantal</Label>
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="mt-2 w-28"
          />
        </div>

        {/* Location */}
        <div className="mb-5">
          <Label className="text-sm font-medium">Locatie</Label>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Gang</label>
              <select
                value={tgtAisle}
                onChange={(e) => { setTgtAisle(e.target.value); setTgtRack(""); setTgtLevel(""); }}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">—</option>
                {aisles.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Rek</label>
              <select
                value={tgtRack}
                onChange={(e) => { setTgtRack(e.target.value); setTgtLevel(""); }}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={!tgtAisle}
              >
                <option value="">—</option>
                {getRacks(tgtAisle).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Niveau</label>
              <select
                value={tgtLevel}
                onChange={(e) => setTgtLevel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={!tgtRack}
              >
                <option value="">—</option>
                {getLevels(tgtAisle, tgtRack).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleBook}
            disabled={!tgtLocation || !finishingTypeId || booking}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            <CheckCircle2 size={14} />
            {booking ? "Boeken..." : "Afwerken boeken"}
          </Button>
        </div>
      </div>
    </div>
  );
}
