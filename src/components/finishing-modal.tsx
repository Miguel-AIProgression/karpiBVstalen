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

  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    const { data: rules } = await supabase
      .from("quality_finishing_rules")
      .select("finishing_type_id")
      .eq("quality_id", sample.quality_id)
      .eq("is_allowed", true)
      .limit(1);

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
      setError("");
      loadData();
    }
  }, [open, shortage, loadData]);

  async function handleBook() {
    if (!finishingTypeId || !user) return;
    setBooking(true);
    setError("");

    try {
      // Resolve default location
      const { data: defaultLoc } = await supabase
        .from("locations")
        .select("id")
        .eq("aisle", "-")
        .eq("rack", "-")
        .eq("level", "-")
        .limit(1);

      let locationId = defaultLoc?.[0]?.id ?? null;
      if (!locationId) {
        const { data: created, error: err } = await supabase
          .from("locations")
          .insert({ aisle: "-", rack: "-", level: "-" })
          .select("id")
          .single();
        if (err) throw new Error(`Default locatie aanmaken mislukt: ${err.message}`);
        locationId = created.id;
      }

      // Check if finished_stock row exists
      const { data: existing } = await supabase
        .from("finished_stock")
        .select("quantity")
        .eq("quality_id", sample.quality_id)
        .eq("color_code_id", sample.color_code_id)
        .eq("dimension_id", sample.dimension_id)
        .eq("finishing_type_id", finishingTypeId)
        .eq("location_id", locationId)
        .maybeSingle();

      if (existing) {
        const { error: err } = await supabase
          .from("finished_stock")
          .update({ quantity: existing.quantity + quantity })
          .eq("quality_id", sample.quality_id)
          .eq("color_code_id", sample.color_code_id)
          .eq("dimension_id", sample.dimension_id)
          .eq("finishing_type_id", finishingTypeId)
          .eq("location_id", locationId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from("finished_stock")
          .insert({
            quality_id: sample.quality_id,
            color_code_id: sample.color_code_id,
            dimension_id: sample.dimension_id,
            finishing_type_id: finishingTypeId,
            location_id: locationId,
            quantity,
          });
        if (err) throw err;
      }

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

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleBook}
            disabled={!finishingTypeId || booking}
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
