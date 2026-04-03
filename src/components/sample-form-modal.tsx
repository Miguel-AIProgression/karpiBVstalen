"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Minus, Plus, PlusCircle, ChevronLeft, Trash2, Copy } from "lucide-react";

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

interface FinishingType {
  id: string;
  name: string;
}

export interface SampleRow {
  id: string;
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  finishing_type_id: string | null;
  photo_url: string | null;
  description: string | null;
  location: string | null;
  min_stock: number;
  active: boolean;
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
  const [finishingTypes, setFinishingTypes] = useState<FinishingType[]>([]);

  const [qualityId, setQualityId] = useState("");
  const [colorCodeId, setColorCodeId] = useState("");
  const [dimensionId, setDimensionId] = useState("");
  const [finishingTypeId, setFinishingTypeId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [locLetter, setLocLetter] = useState("");
  const [locRow, setLocRow] = useState("");
  const [locShelf, setLocShelf] = useState("");
  const [minStock, setMinStock] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Stock state
  const [stockTotal, setStockTotal] = useState(0);
  const [originalStockTotal, setOriginalStockTotal] = useState(0);

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

  // Duplicate dimension inline creation
  const [creatingDupDimension, setCreatingDupDimension] = useState(false);
  const [newDupDimName, setNewDupDimName] = useState("");
  const [newDupDimWidth, setNewDupDimWidth] = useState("");
  const [newDupDimHeight, setNewDupDimHeight] = useState("");

  const [existingDimIds, setExistingDimIds] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [dupDimensionId, setDupDimensionId] = useState("");
  const [error, setError] = useState("");

  const isEdit = !!sample;

  const loadOptions = useCallback(async () => {
    const [{ data: quals }, { data: colors }, { data: dims }, { data: finishings }] = await Promise.all([
      supabase.from("qualities").select("id, name, code").eq("active", true).order("name"),
      supabase.from("color_codes").select("id, code, name, quality_id, hex_color").eq("active", true).order("name"),
      supabase.from("sample_dimensions").select("id, name").order("name"),
      supabase.from("finishing_types").select("id, name").eq("active", true).order("name"),
    ]);
    setQualities(quals ?? []);
    setAllColors(colors ?? []);
    setDimensions(dims ?? []);
    setFinishingTypes(finishings ?? []);
  }, [supabase]);

  const loadExistingDims = useCallback(async (s: SampleRow) => {
    const { data } = await supabase
      .from("samples")
      .select("dimension_id")
      .eq("quality_id", s.quality_id)
      .eq("color_code_id", s.color_code_id)
      .eq("active", true);
    setExistingDimIds(new Set((data ?? []).map((r: any) => r.dimension_id)));
  }, [supabase]);

  const loadStock = useCallback(async (s: SampleRow) => {
    const { data: stockData } = await supabase
      .from("finished_stock")
      .select("quantity")
      .eq("quality_id", s.quality_id)
      .eq("color_code_id", s.color_code_id)
      .eq("dimension_id", s.dimension_id);

    let total = 0;
    for (const r of (stockData ?? []) as any[]) {
      total += r.quantity ?? 0;
    }

    setStockTotal(total);
    setOriginalStockTotal(total);
  }, [supabase]);

  useEffect(() => {
    if (open) {
      loadOptions();
      if (sample) {
        setQualityId(sample.quality_id);
        setColorCodeId(sample.color_code_id);
        setDimensionId(sample.dimension_id);
        setFinishingTypeId(sample.finishing_type_id ?? "");
        setDescription(sample.description ?? "");
        if (sample.location) {
          const parts = sample.location.split("-");
          setLocLetter(parts[0] ?? "");
          setLocRow(parts[1] ?? "");
          setLocShelf(parts[2] ?? "");
        } else {
          setLocLetter("");
          setLocRow("");
          setLocShelf("");
        }
        setMinStock(sample.min_stock);
        loadStock(sample);
        loadExistingDims(sample);
      } else {
        setExistingDimIds(new Set());
        setQualityId("");
        setColorCodeId("");
        setDimensionId("");
        setFinishingTypeId("");
        setDescription("");
        setLocLetter("");
        setLocRow("");
        setLocShelf("");
        setMinStock(0);
        setStockTotal(0);
        setOriginalStockTotal(0);
      }
      setPhotoFile(null);
      setError("");
      setConfirmDelete(false);
      setDuplicating(false);
      setDupDimensionId("");
      setCreatingDupDimension(false);
    }
  }, [open, sample, loadOptions, loadStock, loadExistingDims]);

  const filteredColors = allColors.filter((c) => c.quality_id === qualityId);

  useEffect(() => {
    if (qualityId && colorCodeId && allColors.length > 0) {
      const valid = allColors.some((c) => c.id === colorCodeId && c.quality_id === qualityId);
      if (!valid) setColorCodeId("");
    }
  }, [qualityId, colorCodeId, allColors]);

  async function handleCreateQuality() {
    if (!newQualityName.trim() || !newQualityCode.trim()) return;
    setError("");
    const { data, error: err } = await supabase
      .from("qualities")
      .insert({ name: newQualityName.trim().toUpperCase(), code: newQualityCode.trim().toUpperCase(), active: true })
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

  async function handleCreateDupDimension() {
    if (!newDupDimName.trim() || !newDupDimWidth || !newDupDimHeight) return;
    setError("");
    const { data, error: err } = await supabase
      .from("sample_dimensions")
      .insert({
        name: newDupDimName.trim(),
        width_cm: Number(newDupDimWidth),
        height_cm: Number(newDupDimHeight),
      })
      .select("id, name")
      .single();
    if (err) { setError(err.message); return; }
    setDimensions((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setDupDimensionId(data.id);
    setCreatingDupDimension(false);
    setNewDupDimName("");
    setNewDupDimWidth("");
    setNewDupDimHeight("");
  }

  async function handleDelete() {
    if (!sample) return;
    setDeleting(true);
    setError("");
    try {
      const { error: err } = await supabase
        .from("samples")
        .update({ active: false })
        .eq("id", sample.id);
      if (err) throw err;
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message ?? "Fout bij verwijderen");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDuplicate() {
    if (!sample || !dupDimensionId) return;
    setDuplicating(true);
    setError("");
    try {
      const dupLocation = locLetter && locRow && locShelf
        ? `${locLetter}-${locRow.padStart(2, "0")}-${locShelf.padStart(2, "0")}`
        : null;
      const { error: err } = await supabase.from("samples").insert({
        quality_id: sample.quality_id,
        color_code_id: sample.color_code_id,
        dimension_id: dupDimensionId,
        finishing_type_id: sample.finishing_type_id ?? null,
        description: description || null,
        location: dupLocation,
        min_stock: minStock,
        photo_url: sample.photo_url,
        active: true,
      });
      if (err) throw err;
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message ?? "Fout bij dupliceren");
    } finally {
      setDuplicating(false);
    }
  }

  // Dimensions available for duplication (exclude all existing for this quality+color)
  const dupDimensions = dimensions.filter((d) => !existingDimIds.has(d.id));

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

      // Validate: if location is partially filled, show error
      const locParts = [locLetter, locRow, locShelf];
      const locFilled = locParts.filter(Boolean).length;
      if (locFilled > 0 && locFilled < 3) {
        throw new Error("Locatie onvolledig — vul alle 3 velden in (letter, rij, plank) of laat ze allemaal leeg.");
      }

      const locationValue = locLetter && locRow && locShelf
        ? `${locLetter}-${locRow.padStart(2, "0")}-${locShelf.padStart(2, "0")}`
        : null;

      const record = {
        quality_id: qualityId,
        color_code_id: colorCodeId,
        dimension_id: dimensionId,
        finishing_type_id: finishingTypeId || null,
        description: description || null,
        location: locationValue,
        min_stock: minStock,
        photo_url: photoUrl,
        active: true,
      };

      if (isEdit && sample) {
        const { data: updated, error: err } = await supabase
          .from("samples")
          .update(record)
          .eq("id", sample.id)
          .select();
        if (err) throw err;
        if (!updated || updated.length === 0) {
          throw new Error("Bijwerken mislukt — geen rijen aangepast. Probeer opnieuw in te loggen.");
        }

        // Handle stock change — simple approach: directly query and update DB rows
        const diff = stockTotal - originalStockTotal;
        if (diff !== 0) {
          // Fresh query to get current stock rows (include quantity=0 to avoid duplicate key on insert)
          const { data: currentRows } = await supabase
            .from("finished_stock")
            .select("quality_id, color_code_id, dimension_id, finishing_type_id, location_id, quantity")
            .eq("quality_id", qualityId)
            .eq("color_code_id", colorCodeId)
            .eq("dimension_id", dimensionId);

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

            // Resolve default location
            let locationId: string | null = null;
            const { data: defaultLoc } = await supabase
              .from("locations")
              .select("id")
              .eq("aisle", "-")
              .eq("rack", "-")
              .eq("level", "-")
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
                  onClick={() => { if (qualityId) setCreatingColor(true); }}
                  disabled={!qualityId}
                  className="flex items-center justify-center rounded-lg border border-border px-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  title={qualityId ? "Nieuwe kleur toevoegen" : "Kies eerst een kwaliteit"}
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
            ) : creatingDimension ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCreatingDimension(false)} className="text-muted-foreground hover:text-foreground">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-medium">Nieuwe afmeting</span>
                </div>
                <Input placeholder="Naam (bv. A4, 30x30)" value={newDimName} onChange={(e) => setNewDimName(e.target.value)} className="text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="Breedte (cm)" value={newDimWidth} onChange={(e) => setNewDimWidth(e.target.value)} className="text-sm" />
                  <Input type="number" placeholder="Hoogte (cm)" value={newDimHeight} onChange={(e) => setNewDimHeight(e.target.value)} className="text-sm" />
                </div>
                <Button type="button" size="sm" onClick={handleCreateDimension} disabled={!newDimName.trim() || !newDimWidth || !newDimHeight}>
                  Toevoegen
                </Button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <select
                  value={dimensionId}
                  onChange={(e) => setDimensionId(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  <option value="">Selecteer afmeting</option>
                  {dimensions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingDimension(true)}
                  className="flex items-center justify-center rounded-lg border border-border px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Nieuwe afmeting"
                >
                  <PlusCircle size={18} />
                </button>
              </div>
            )}
          </div>

          {/* Finishing type */}
          <div className="space-y-1.5">
            <Label className="text-sm">Afwerking</Label>
            <select
              value={finishingTypeId}
              onChange={(e) => setFinishingTypeId(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Geen / standaard</option>
              {finishingTypes.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
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

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-sm">Locatie <span className="text-muted-foreground font-normal">(gang - rij - plank)</span></Label>
            <div className="flex items-center gap-1.5">
              <Input
                value={locLetter}
                onChange={(e) => setLocLetter(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 1))}
                placeholder="A"
                maxLength={1}
                className="w-12 text-center font-mono"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                value={locRow}
                onChange={(e) => setLocRow(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="01"
                maxLength={2}
                className="w-14 text-center font-mono"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                value={locShelf}
                onChange={(e) => setLocShelf(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="01"
                maxLength={2}
                className="w-14 text-center font-mono"
              />
            </div>
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

          {/* Duplicate with different dimension */}
          {isEdit && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <Label className="text-sm">Dupliceer met andere maat</Label>
              {creatingDupDimension ? (
                <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setCreatingDupDimension(false)} className="text-muted-foreground hover:text-foreground">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-medium">Nieuwe afmeting</span>
                  </div>
                  <Input placeholder="Naam (bv. A4, 30x30)" value={newDupDimName} onChange={(e) => setNewDupDimName(e.target.value)} className="text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" placeholder="Breedte (cm)" value={newDupDimWidth} onChange={(e) => setNewDupDimWidth(e.target.value)} className="text-sm" />
                    <Input type="number" placeholder="Hoogte (cm)" value={newDupDimHeight} onChange={(e) => setNewDupDimHeight(e.target.value)} className="text-sm" />
                  </div>
                  <Button type="button" size="sm" onClick={handleCreateDupDimension} disabled={!newDupDimName.trim() || !newDupDimWidth || !newDupDimHeight}>
                    Toevoegen
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={dupDimensionId}
                    onChange={(e) => setDupDimensionId(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Selecteer maat...</option>
                    {dupDimensions.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setCreatingDupDimension(true)}
                    className="flex items-center justify-center rounded-lg border border-border px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Nieuwe afmeting"
                  >
                    <PlusCircle size={18} />
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDuplicate}
                    disabled={!dupDimensionId || duplicating}
                    className="shrink-0"
                  >
                    <Copy size={14} />
                    {duplicating ? "Bezig..." : "Dupliceer"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            {/* Delete */}
            {isEdit ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Zeker weten?</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs"
                  >
                    Nee
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-red-600 text-white hover:bg-red-700 text-xs"
                  >
                    {deleting ? "Bezig..." : "Ja, verwijder"}
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Verwijderen
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuleren
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Opslaan..." : isEdit ? "Bijwerken" : "Aanmaken"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
