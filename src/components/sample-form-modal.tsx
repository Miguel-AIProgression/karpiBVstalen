"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Minus, Plus, PlusCircle, ChevronLeft } from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface Quality {
  id: string;
  name: string;
  code: string;
}

interface ColorCode {
  id: string;
  code: string;
  name: string;
  quality_id: string;
  hex_color: string | null;
}

interface Dimension {
  id: string;
  name: string;
}

export interface SampleRow {
  id: string;
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  photo_url: string | null;
  description: string | null;
  min_stock: number;
  active: boolean;
}

interface LocationOption {
  id: string;
  label: string;
}

interface StockLocationEntry {
  location_id: string;
  location_label: string;
  quantity: number;
  finishing_type_id: string | null;
}

interface SampleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sample?: SampleRow | null;
  onSaved: () => void;
}

/* ─── Component ──────────────────────────────────────── */

export function SampleFormModal({ open, onOpenChange, sample, onSaved }: SampleFormModalProps) {
  const supabase = createClient();

  const [qualities, setQualities] = useState<Quality[]>([]);
  const [allColors, setAllColors] = useState<ColorCode[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);

  const [qualityId, setQualityId] = useState("");
  const [colorCodeId, setColorCodeId] = useState("");
  const [dimensionId, setDimensionId] = useState("");
  const [description, setDescription] = useState("");
  const [minStock, setMinStock] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Stock state
  const [stockTotal, setStockTotal] = useState(0);
  const [originalStockTotal, setOriginalStockTotal] = useState(0);
  const [stockLocations, setStockLocations] = useState<StockLocationEntry[]>([]);
  const [allLocations, setAllLocations] = useState<LocationOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [primaryLocationId, setPrimaryLocationId] = useState<string | null>(null);

  // Inline creation states
  const [creatingQuality, setCreatingQuality] = useState(false);
  const [newQualityName, setNewQualityName] = useState("");
  const [newQualityCode, setNewQualityCode] = useState("");

  const [creatingColor, setCreatingColor] = useState(false);
  const [newColorName, setNewColorName] = useState("");
  const [newColorCode, setNewColorCode] = useState("");
  const [newColorHex, setNewColorHex] = useState("");

  const [creatingDimension, setCreatingDimension] = useState(false);
  const [newDimName, setNewDimName] = useState("");
  const [newDimWidth, setNewDimWidth] = useState("");
  const [newDimHeight, setNewDimHeight] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!sample;

  const loadOptions = useCallback(async () => {
    const [{ data: quals }, { data: colors }, { data: dims }] = await Promise.all([
      supabase.from("qualities").select("id, name, code").eq("active", true).order("name"),
      supabase.from("color_codes").select("id, code, name, quality_id, hex_color").eq("active", true).order("name"),
      supabase.from("sample_dimensions").select("id, name").order("name"),
    ]);
    setQualities(quals ?? []);
    setAllColors(colors ?? []);
    setDimensions(dims ?? []);
  }, [supabase]);

  const loadStock = useCallback(async (s: SampleRow) => {
    const [{ data: stockData }, { data: locData }] = await Promise.all([
      supabase
        .from("finished_stock")
        .select("finishing_type_id, location_id, quantity, locations(label)")
        .eq("quality_id", s.quality_id)
        .eq("color_code_id", s.color_code_id)
        .eq("dimension_id", s.dimension_id),
      supabase
        .from("locations")
        .select("id, label")
        .order("label"),
    ]);

    const locs: LocationOption[] = locData ?? [];
    setAllLocations(locs);

    const entries: StockLocationEntry[] = [];
    let total = 0;
    let primaryLoc: string | null = null;
    let maxQty = 0;

    for (const r of (stockData ?? []) as any[]) {
      const qty = r.quantity ?? 0;
      if (qty > 0) {
        entries.push({
          location_id: r.location_id,
          location_label: r.locations?.label ?? "?",
          quantity: qty,
          finishing_type_id: r.finishing_type_id,
        });
        total += qty;
        if (qty > maxQty) {
          maxQty = qty;
          primaryLoc = r.location_id;
        }
      }
    }

    setStockLocations(entries);
    setStockTotal(total);
    setOriginalStockTotal(total);
    setPrimaryLocationId(primaryLoc);
    if (locs.length > 0) {
      setSelectedLocationId(primaryLoc ?? locs[0].id);
    }
  }, [supabase]);

  useEffect(() => {
    if (open) {
      loadOptions();
      if (sample) {
        setQualityId(sample.quality_id);
        setColorCodeId(sample.color_code_id);
        setDimensionId(sample.dimension_id);
        setDescription(sample.description ?? "");
        setMinStock(sample.min_stock);
        loadStock(sample);
      } else {
        setQualityId("");
        setColorCodeId("");
        setDimensionId("");
        setDescription("");
        setMinStock(0);
        setStockTotal(0);
        setOriginalStockTotal(0);
        setStockLocations([]);
        setPrimaryLocationId(null);
        setSelectedLocationId("");
      }
      setPhotoFile(null);
      setError("");
    }
  }, [open, sample, loadOptions, loadStock]);

  const filteredColors = allColors.filter((c) => c.quality_id === qualityId);

  useEffect(() => {
    if (qualityId && colorCodeId) {
      const valid = allColors.some((c) => c.id === colorCodeId && c.quality_id === qualityId);
      if (!valid) setColorCodeId("");
    }
  }, [qualityId, colorCodeId, allColors]);

  async function handleCreateQuality() {
    if (!newQualityName.trim() || !newQualityCode.trim()) return;
    setError("");
    const { data, error: err } = await supabase
      .from("qualities")
      .insert({ name: newQualityName.trim(), code: newQualityCode.trim(), active: true })
      .select("id, name, code")
      .single();
    if (err) { setError(err.message); return; }
    setQualities((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setQualityId(data.id);
    setCreatingQuality(false);
    setNewQualityName("");
    setNewQualityCode("");
  }

  async function handleCreateColor() {
    if (!newColorName.trim() || !newColorCode.trim() || !qualityId) return;
    setError("");
    const { data, error: err } = await supabase
      .from("color_codes")
      .insert({
        name: newColorName.trim(),
        code: newColorCode.trim(),
        quality_id: qualityId,
        hex_color: newColorHex.trim() || null,
        active: true,
      })
      .select("id, code, name, quality_id, hex_color")
      .single();
    if (err) { setError(err.message); return; }
    setAllColors((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setColorCodeId(data.id);
    setCreatingColor(false);
    setNewColorName("");
    setNewColorCode("");
    setNewColorHex("");
  }

  async function handleCreateDimension() {
    if (!newDimName.trim() || !newDimWidth || !newDimHeight) return;
    setError("");
    const { data, error: err } = await supabase
      .from("sample_dimensions")
      .insert({
        name: newDimName.trim(),
        width_cm: Number(newDimWidth),
        height_cm: Number(newDimHeight),
      })
      .select("id, name")
      .single();
    if (err) { setError(err.message); return; }
    setDimensions((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setDimensionId(data.id);
    setCreatingDimension(false);
    setNewDimName("");
    setNewDimWidth("");
    setNewDimHeight("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!qualityId || !colorCodeId || !dimensionId) {
      setError("Vul alle verplichte velden in.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      let photoUrl = sample?.photo_url ?? null;

      if (photoFile) {
        const ext = photoFile.name.split(".").pop();
        const path = `samples/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("sample-photos")
          .upload(path, photoFile, { upsert: true });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from("sample-photos")
          .getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      }

      const record = {
        quality_id: qualityId,
        color_code_id: colorCodeId,
        dimension_id: dimensionId,
        description: description || null,
        min_stock: minStock,
        photo_url: photoUrl,
        active: true,
      };

      if (isEdit && sample) {
        const { error: err } = await supabase
          .from("samples")
          .update(record)
          .eq("id", sample.id);
        if (err) throw err;

        // Handle stock change — simple approach: directly query and update DB rows
        const diff = stockTotal - originalStockTotal;
        if (diff !== 0) {
          // Fresh query to get current stock rows (avoid stale state issues)
          const { data: currentRows } = await supabase
            .from("finished_stock")
            .select("quality_id, color_code_id, dimension_id, finishing_type_id, location_id, quantity")
            .eq("quality_id", qualityId)
            .eq("color_code_id", colorCodeId)
            .eq("dimension_id", dimensionId)
            .gt("quantity", 0);

          if (currentRows && currentRows.length > 0) {
            // Update the first row with positive stock
            const row = currentRows[0];
            const newQty = Math.max(0, row.quantity + diff);
            const { error: stockErr } = await supabase
              .from("finished_stock")
              .update({ quantity: newQty })
              .eq("quality_id", row.quality_id)
              .eq("color_code_id", row.color_code_id)
              .eq("dimension_id", row.dimension_id)
              .eq("finishing_type_id", row.finishing_type_id)
              .eq("location_id", row.location_id);
            if (stockErr) throw stockErr;
          } else if (diff > 0) {
            // No existing stock — need to create a row
            // Resolve finishing type
            let ftId: string | null = null;
            const { data: rules } = await supabase
              .from("quality_finishing_rules")
              .select("finishing_type_id")
              .eq("quality_id", qualityId)
              .eq("is_allowed", true)
              .limit(1);
            ftId = rules?.[0]?.finishing_type_id ?? null;
            if (!ftId) {
              const { data: types } = await supabase
                .from("finishing_types")
                .select("id")
                .eq("active", true)
                .limit(1);
              ftId = types?.[0]?.id ?? null;
            }
            if (!ftId) throw new Error("Geen afwerktype gevonden.");

            // Resolve location
            let locationId = selectedLocationId || primaryLocationId;
            if (!locationId) {
              const { data: defaultLoc } = await supabase
                .from("locations")
                .select("id")
                .eq("aisle", "-")
                .limit(1);
              if (defaultLoc && defaultLoc.length > 0) {
                locationId = defaultLoc[0].id;
              } else {
                const { data: created, error: locErr } = await supabase
                  .from("locations")
                  .insert({ aisle: "-", rack: "-", level: "-" })
                  .select("id")
                  .single();
                if (locErr) throw locErr;
                locationId = created.id;
              }
            }

            const { error: stockErr } = await supabase
              .from("finished_stock")
              .insert({
                quality_id: qualityId,
                color_code_id: colorCodeId,
                dimension_id: dimensionId,
                finishing_type_id: ftId,
                location_id: locationId,
                quantity: diff,
              });
            if (stockErr) throw stockErr;
          }
        }
      } else {
        const { error: err } = await supabase.from("samples").insert(record);
        if (err) throw err;
      }

      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message ?? "Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const stockChanged = stockTotal !== originalStockTotal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-background p-6 ring-1 ring-border shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? "Staal bewerken" : "Nieuw staal"}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Quality */}
          <div className="space-y-1.5">
            <Label className="text-sm">Kwaliteit *</Label>
            {creatingQuality ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCreatingQuality(false)} className="text-muted-foreground hover:text-foreground">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-medium">Nieuwe kwaliteit</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Code (bv. VEL)" value={newQualityCode} onChange={(e) => setNewQualityCode(e.target.value)} className="text-sm" />
                  <Input placeholder="Naam" value={newQualityName} onChange={(e) => setNewQualityName(e.target.value)} className="text-sm" />
                </div>
                <Button type="button" size="sm" onClick={handleCreateQuality} disabled={!newQualityName.trim() || !newQualityCode.trim()}>
                  Toevoegen
                </Button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <select
                  value={qualityId}
                  onChange={(e) => setQualityId(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  <option value="">Selecteer kwaliteit</option>
                  {qualities.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.code === q.name ? q.name : `${q.code} — ${q.name}`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingQuality(true)}
                  className="flex items-center justify-center rounded-lg border border-border px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Nieuwe kwaliteit"
                >
                  <PlusCircle size={18} />
                </button>
              </div>
            )}
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label className="text-sm">Kleur *</Label>
            {creatingColor ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCreatingColor(false)} className="text-muted-foreground hover:text-foreground">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-medium">Nieuwe kleur</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Code (bv. 001)" value={newColorCode} onChange={(e) => setNewColorCode(e.target.value)} className="text-sm" />
                  <Input placeholder="Naam" value={newColorName} onChange={(e) => setNewColorName(e.target.value)} className="text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <Input type="color" value={newColorHex || "#888888"} onChange={(e) => setNewColorHex(e.target.value)} className="h-8 w-10 p-0.5 cursor-pointer" />
                  <span className="text-xs text-muted-foreground">Hex kleur (optioneel)</span>
                </div>
                <Button type="button" size="sm" onClick={handleCreateColor} disabled={!newColorName.trim() || !newColorCode.trim()}>
                  Toevoegen
                </Button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <select
                  value={colorCodeId}
                  onChange={(e) => setColorCodeId(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                  disabled={!qualityId}
                >
                  <option value="">
                    {qualityId ? "Selecteer kleur" : "Kies eerst een kwaliteit"}
                  </option>
                  {filteredColors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code === c.name ? c.name : `${c.code} — ${c.name}`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingColor(true)}
                  disabled={!qualityId}
                  className="flex items-center justify-center rounded-lg border border-border px-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Nieuwe kleur"
                >
                  <PlusCircle size={18} />
                </button>
              </div>
            )}
          </div>

          {/* Dimension */}
          <div className="space-y-1.5">
            <Label className="text-sm">Afmeting *</Label>
            {isEdit ? (
              <div className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {dimensions.find((d) => d.id === dimensionId)?.name ?? "—"}
              </div>
            ) : (
              <select
                value={dimensionId}
                onChange={(e) => setDimensionId(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              >
                <option value="">Selecteer afmeting</option>
                {dimensions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-sm">Beschrijving</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Optionele beschrijving..."
            />
          </div>

          {/* Min stock */}
          <div className="space-y-1.5">
            <Label className="text-sm">Min. voorraad</Label>
            <Input
              type="number"
              min={0}
              value={minStock}
              onChange={(e) => setMinStock(Number(e.target.value))}
              className="w-32"
            />
          </div>

          {/* Actuele voorraad (edit mode only) */}
          {isEdit && (
            <div className="space-y-2">
              <Label className="text-sm">Actuele voorraad</Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStockTotal(Math.max(0, stockTotal - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                >
                  <Minus size={16} />
                </button>
                <Input
                  type="number"
                  min={0}
                  value={stockTotal}
                  onChange={(e) => setStockTotal(Math.max(0, Number(e.target.value)))}
                  className="w-20 text-center"
                />
                <button
                  type="button"
                  onClick={() => setStockTotal(stockTotal + 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                >
                  <Plus size={16} />
                </button>
                {stockChanged && (
                  <span className="text-xs text-amber-600">was {originalStockTotal}</span>
                )}
              </div>

              {/* Location details */}
              {stockLocations.length > 0 && (
                <div className="mt-1 space-y-1">
                  {stockLocations.map((loc) => (
                    <div key={loc.location_id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{loc.location_label}</span>
                      <span>{loc.quantity}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Location selector — only show when multiple locations exist and stock changed */}
              {stockChanged && allLocations.length > 1 && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Locatie voor wijziging</label>
                  <select
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {allLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Photo */}
          <div className="space-y-1.5">
            <Label className="text-sm">Foto</Label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Opslaan..." : isEdit ? "Bijwerken" : "Aanmaken"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
