"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Minus, Plus, Scissors, CheckCircle2, X, ArrowRight } from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface SampleOption {
  id: string;
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  quality_name: string;
  color_name: string;
  color_code: string;
  hex_color: string | null;
  dimension_name: string;
}

interface LocationOption {
  id: string;
  aisle: string;
  rack: string;
  level: string;
  label: string;
}

interface QuickEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked: () => void;
}

type StockType = "raw" | "finished";

/* ─── Component ──────────────────────────────────────── */

export function QuickEntryModal({ open, onOpenChange, onBooked }: QuickEntryModalProps) {
  const supabase = createClient();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [search, setSearch] = useState("");
  const [samples, setSamples] = useState<SampleOption[]>([]);
  const [selectedSample, setSelectedSample] = useState<SampleOption | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [stockType, setStockType] = useState<StockType>("raw");

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedAisle, setSelectedAisle] = useState("");
  const [selectedRack, setSelectedRack] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");

  const [booking, setBooking] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [error, setError] = useState("");

  const loadSamples = useCallback(async () => {
    const { data } = await supabase
      .from("samples")
      .select("id, quality_id, color_code_id, dimension_id, qualities(name), color_codes(name, code, hex_color), sample_dimensions(name)")
      .eq("active", true);
    const mapped: SampleOption[] = (data ?? []).map((s: any) => ({
      id: s.id,
      quality_id: s.quality_id,
      color_code_id: s.color_code_id,
      dimension_id: s.dimension_id,
      quality_name: s.qualities?.name ?? "",
      color_name: s.color_codes?.name ?? "",
      color_code: s.color_codes?.code ?? "",
      hex_color: s.color_codes?.hex_color ?? null,
      dimension_name: s.sample_dimensions?.name ?? "",
    }));
    setSamples(mapped);
  }, [supabase]);

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
      loadSamples();
      loadLocations();
    }
  }, [open, loadSamples, loadLocations]);

  function resetAll() {
    setStep(1);
    setSearch("");
    setSelectedSample(null);
    setQuantity(1);
    setStockType("raw");
    setSelectedAisle("");
    setSelectedRack("");
    setSelectedLevel("");
    setError("");
    setSuccessMsg("");
  }

  const filteredSamples = samples.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.quality_name.toLowerCase().includes(q) ||
      s.color_name.toLowerCase().includes(q) ||
      s.color_code.toLowerCase().includes(q)
    );
  });

  // Location helpers
  const aisles = Array.from(new Set(locations.map((l) => l.aisle))).sort();
  const racks = Array.from(new Set(locations.filter((l) => l.aisle === selectedAisle).map((l) => l.rack))).sort();
  const levels = Array.from(new Set(locations.filter((l) => l.aisle === selectedAisle && l.rack === selectedRack).map((l) => l.level))).sort();
  const selectedLocation = locations.find(
    (l) => l.aisle === selectedAisle && l.rack === selectedRack && l.level === selectedLevel
  );
  const previewLabel = selectedAisle
    ? `${selectedAisle}${selectedRack ? `-${selectedRack}` : ""}${selectedLevel ? `-${selectedLevel}` : ""}`
    : "—";

  async function handleBook() {
    if (!selectedSample || !selectedLocation || !user) return;
    setBooking(true);
    setError("");

    try {
      if (stockType === "raw") {
        const { error: err } = await supabase.from("cut_batches").insert({
          quality_id: selectedSample.quality_id,
          color_code_id: selectedSample.color_code_id,
          dimension_id: selectedSample.dimension_id,
          location_id: selectedLocation.id,
          quantity,
          cut_by: user.id,
        });
        if (err) throw err;
      } else {
        // Get finishing type
        const { data: rules } = await supabase
          .from("quality_finishing_rules")
          .select("finishing_type_id")
          .eq("quality_id", selectedSample.quality_id)
          .eq("is_allowed", true)
          .limit(1);

        let finishingTypeId: string | null = rules?.[0]?.finishing_type_id ?? null;
        if (!finishingTypeId) {
          const { data: types } = await supabase
            .from("finishing_types")
            .select("id")
            .eq("active", true)
            .limit(1);
          finishingTypeId = types?.[0]?.id ?? null;
        }

        if (!finishingTypeId) {
          setError("Geen afwerktype gevonden.");
          setBooking(false);
          return;
        }

        const { error: err } = await supabase.from("finishing_batches").insert({
          quality_id: selectedSample.quality_id,
          color_code_id: selectedSample.color_code_id,
          dimension_id: selectedSample.dimension_id,
          finishing_type_id: finishingTypeId,
          source_location_id: selectedLocation.id,
          target_location_id: selectedLocation.id,
          quantity,
          finished_by: user.id,
        });
        if (err) throw err;
      }

      const typeLabel = stockType === "raw" ? "Gesneden" : "Afgewerkt";
      setSuccessMsg(
        `${quantity}x ${selectedSample.quality_name} ${selectedSample.color_name} geboekt als "${typeLabel}" op ${selectedLocation.label}`
      );
      setStep(4);
      onBooked();
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
        onClick={() => { resetAll(); onOpenChange(false); }}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-background p-6 ring-1 ring-border shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Snelle invoer</h2>
          <button
            onClick={() => { resetAll(); onOpenChange(false); }}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="mb-5 flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  step >= s
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div className={`h-px w-8 ${step > s ? "bg-foreground" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Zoek staal */}
        {step === 1 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Zoek staal</Label>
            <div className="relative">
              <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op kwaliteit of kleur..."
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg ring-1 ring-border">
              {filteredSamples.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {samples.length === 0 ? "Geen stalen gevonden." : "Geen resultaten."}
                </div>
              ) : (
                filteredSamples.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedSample(s); setStep(2); }}
                    className="flex w-full items-center gap-3 border-b border-border/50 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 last:border-0"
                  >
                    <div
                      className="h-8 w-8 shrink-0 rounded"
                      style={{ backgroundColor: s.hex_color || "#e5e7eb" }}
                    />
                    <div>
                      <div className="font-medium text-card-foreground">
                        {s.quality_name} — {s.color_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.dimension_name}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Step 2: Aantal + Status */}
        {step === 2 && selectedSample && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <div
                className="h-10 w-10 shrink-0 rounded"
                style={{ backgroundColor: selectedSample.hex_color || "#e5e7eb" }}
              />
              <div>
                <div className="font-medium text-card-foreground">
                  {selectedSample.quality_name} — {selectedSample.color_name}
                </div>
                <div className="text-xs text-muted-foreground">{selectedSample.dimension_name}</div>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Aantal</Label>
              <div className="mt-2 flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus size={16} />
                </Button>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-20 text-center"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus size={16} />
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Status</Label>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setStockType("raw")}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    stockType === "raw"
                      ? "bg-amber-100 text-amber-800 ring-2 ring-amber-300"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <Scissors size={16} /> Gesneden
                </button>
                <button
                  onClick={() => setStockType("finished")}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    stockType === "finished"
                      ? "bg-green-100 text-green-800 ring-2 ring-green-300"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <CheckCircle2 size={16} /> Afgewerkt
                </button>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Terug</Button>
              <Button onClick={() => setStep(3)}>
                Volgende <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Locatie */}
        {step === 3 && selectedSample && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <div
                className="h-8 w-8 shrink-0 rounded"
                style={{ backgroundColor: selectedSample.hex_color || "#e5e7eb" }}
              />
              <div className="text-sm">
                <span className="font-medium">{selectedSample.quality_name} — {selectedSample.color_name}</span>
                <span className="ml-2 text-muted-foreground">
                  {quantity}x {stockType === "raw" ? "Gesneden" : "Afgewerkt"}
                </span>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Locatie</Label>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Gang</label>
                  <select
                    value={selectedAisle}
                    onChange={(e) => { setSelectedAisle(e.target.value); setSelectedRack(""); setSelectedLevel(""); }}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">—</option>
                    {aisles.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Rek</label>
                  <select
                    value={selectedRack}
                    onChange={(e) => { setSelectedRack(e.target.value); setSelectedLevel(""); }}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={!selectedAisle}
                  >
                    <option value="">—</option>
                    {racks.map((r) => <option key={r} value={r}>{r}</option>)}
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
                    {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Locatie: <span className="font-mono font-semibold text-foreground">{previewLabel}</span>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Terug</Button>
              <Button
                onClick={handleBook}
                disabled={!selectedLocation || booking}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                {booking ? "Boeken..." : "Boeken"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800 ring-1 ring-green-200">
              {successMsg}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { resetAll(); onOpenChange(false); }}>
                Sluiten
              </Button>
              <Button onClick={resetAll}>
                Volgende boeken <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
