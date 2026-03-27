"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Scissors } from "lucide-react";

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

interface ProductionResolveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sample: SampleInfo;
  shortage: number;
  onResolved: () => void;
}

/* ─── Component ──────────────────────────────────────── */

export function ProductionResolveModal({
  open,
  onOpenChange,
  sample,
  shortage,
  onResolved,
}: ProductionResolveModalProps) {
  const supabase = createClient();
  const { user } = useAuth();

  const [quantity, setQuantity] = useState(shortage);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedAisle, setSelectedAisle] = useState("");
  const [selectedRack, setSelectedRack] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");

  const loadLocations = useCallback(async () => {
    const { data } = await supabase
      .from("locations")
      .select("id, aisle, rack, level, label")
      .order("aisle")
      .order("rack")
      .order("level");
    setLocations(data ?? []);
  }, [supabase]);

  useEffect(() => {
    if (open) {
      setQuantity(shortage);
      setSelectedAisle("");
      setSelectedRack("");
      setSelectedLevel("");
      setError("");
      loadLocations();
    }
  }, [open, shortage, loadLocations]);

  // Location helpers
  const aisles = Array.from(new Set(locations.map((l) => l.aisle))).sort();
  const racks = Array.from(
    new Set(locations.filter((l) => l.aisle === selectedAisle).map((l) => l.rack))
  ).sort();
  const levels = Array.from(
    new Set(
      locations
        .filter((l) => l.aisle === selectedAisle && l.rack === selectedRack)
        .map((l) => l.level)
    )
  ).sort();
  const selectedLocation = locations.find(
    (l) => l.aisle === selectedAisle && l.rack === selectedRack && l.level === selectedLevel
  );

  async function handleBook() {
    if (!selectedLocation || !user) return;
    setBooking(true);
    setError("");

    try {
      const { error: err } = await supabase.from("cut_batches").insert({
        quality_id: sample.quality_id,
        color_code_id: sample.color_code_id,
        dimension_id: sample.dimension_id,
        location_id: selectedLocation.id,
        quantity,
        cut_by: user.id,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-background p-6 ring-1 ring-border shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Snijden boeken</h2>
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
          <div className="mt-1 text-sm text-red-600 font-semibold">
            Tekort: {shortage}
          </div>
        </div>

        {/* Quantity */}
        <div className="mb-5">
          <Label className="text-sm font-medium">Aantal gesneden</Label>
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="mt-2 w-28"
          />
        </div>

        {/* Location picker */}
        <div className="mb-5">
          <Label className="text-sm font-medium">Locatie</Label>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Gang</label>
              <select
                value={selectedAisle}
                onChange={(e) => {
                  setSelectedAisle(e.target.value);
                  setSelectedRack("");
                  setSelectedLevel("");
                }}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">—</option>
                {aisles.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Rek</label>
              <select
                value={selectedRack}
                onChange={(e) => {
                  setSelectedRack(e.target.value);
                  setSelectedLevel("");
                }}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={!selectedAisle}
              >
                <option value="">—</option>
                {racks.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Niveau</label>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={!selectedRack}
              >
                <option value="">—</option>
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
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
            disabled={!selectedLocation || booking}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            <Scissors size={14} />
            {booking ? "Boeken..." : "Snijden boeken"}
          </Button>
        </div>
      </div>
    </div>
  );
}
