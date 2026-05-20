"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Minus, Plus, PlusCircle, ChevronLeft, Trash2, Copy } from "lucide-react";
import { formatArticleNumber } from "@/lib/articles";

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
  karpi_naam: string | null;
  location: string | null;
  min_stock: number;
  active: boolean;
  finishing_type_id: string | null;
}

interface SampleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sample?: SampleRow | null;
  onSaved: () => void;
}

/* ─── ComboboxInput ───────────────────────────────────── */

function ComboboxInput({
  options, value, onChange, placeholder, disabled = false, autoFocus = false, onCreateNew, onTyped, resetKey,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onCreateNew?: (typed: string) => Promise<{ id: string; label: string } | null>;
  onTyped?: (text: string) => void;
  resetKey?: number;
}) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurReset = useRef(false);

  const selectedLabel = useMemo(() => options.find((o) => o.id === value)?.label ?? "", [options, value]);

  // Alleen resetten bij expliciete form-reset (nieuwe modal-opening)
  useEffect(() => { setInputValue(""); }, [resetKey]);

  // Als externe value verandert naar een bekende optie, toon het label
  useEffect(() => { if (value && selectedLabel) setInputValue(selectedLabel); }, [value, selectedLabel]);

  const filtered = useMemo(() => {
    if (!inputValue) return options;
    const q = inputValue.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, inputValue]);

  function select(opt: { id: string; label: string }) {
    onChange(opt.id);
    setInputValue(opt.label);
    setOpen(false);
    setHighlighted(0);
  }

  async function tryCreate(typed: string) {
    if (!onCreateNew || !typed.trim() || creating) return;
    setCreating(true);
    skipBlurReset.current = true;
    setOpen(false);
    const result = await onCreateNew(typed.trim());
    if (result) { onChange(result.id); setInputValue(result.label); }
    setCreating(false);
    skipBlurReset.current = false;
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault(); setOpen(true); setHighlighted(0); return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0 && highlighted < filtered.length) { select(filtered[highlighted]); }
      else if (filtered.length > 0) { select(filtered[0]); }
      else if (onCreateNew && inputValue.trim()) { await tryCreate(inputValue); }
    } else if (e.key === "Escape") {
      e.preventDefault(); setOpen(false);
    }
    // Tab: doe niets — browser handelt focus af, typed text blijft staan
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        disabled={disabled || creating}
        value={creating ? "Aanmaken…" : inputValue}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => { setInputValue(e.target.value); setOpen(true); setHighlighted(0); onTyped?.(e.target.value); if (!e.target.value) onChange(""); }}
        onFocus={() => { if (!value) setInputValue(""); setOpen(true); setHighlighted(0); }}
        onBlur={() => setTimeout(() => { if (!skipBlurReset.current) setOpen(false); }, 150)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {open && !creating && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {filtered.map((o, i) => (
            <li key={o.id}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === highlighted ? "bg-muted" : "hover:bg-muted/50"}`}
              onMouseDown={(e) => { e.preventDefault(); select(o); }}
              onMouseEnter={() => setHighlighted(i)}
            >{o.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
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
  const [finishingTypeId, setFinishingTypeId] = useState<string>("");
  const [finishingTypes, setFinishingTypes] = useState<{ id: string; name: string }[]>([]);
  const [bundles, setBundles] = useState<{ id: string; name: string; quality_id: string }[]>([]);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [selectedBundleIds, setSelectedBundleIds] = useState<Set<string>>(new Set());
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set());
  const [bundleToCollections, setBundleToCollections] = useState<Map<string, string[]>>(new Map());
  const [description, setDescription] = useState("");
  const [karpiNaam, setKarpiNaam] = useState("");
  const [locString, setLocString] = useState("");
  const [minStock, setMinStock] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Stock state
  const [stockTotal, setStockTotal] = useState(0);
  const [originalStockTotal, setOriginalStockTotal] = useState(0);

  // Reset-sleutel: stijgt bij elke nieuwe modal-opening zodat comboboxen leeggemaakt worden
  const [resetKey, setResetKey] = useState(0);

  // Pending typed text per combobox (voor auto-resolve bij submit)
  const [pendingQuality, setPendingQuality] = useState("");
  const [pendingColor, setPendingColor] = useState("");
  const [pendingDimension, setPendingDimension] = useState("");
  const [pendingFinishing, setPendingFinishing] = useState("");

  // Inline creation states
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
    const [{ data: quals }, { data: colors }, { data: dims }, { data: finishings }, { data: bundlesData }, { data: collectionsData }] = await Promise.all([
      supabase.from("qualities").select("id, name, code").eq("active", true).order("name"),
      supabase.from("color_codes").select("id, code, name, quality_id, hex_color").eq("active", true).order("name"),
      supabase.from("sample_dimensions").select("id, name").order("name"),
      supabase.from("finishing_types").select("id, name").eq("active", true).order("name"),
      (supabase as any).from("bundles").select("id, name, quality_id").eq("active", true).order("name"),
      (supabase as any).from("collections").select("id, name").eq("active", true).order("name"),
    ]);
    setQualities(quals ?? []);
    setAllColors(colors ?? []);
    setDimensions(dims ?? []);
    setFinishingTypes(finishings ?? []);
    setBundles(bundlesData ?? []);
    setCollections(collectionsData ?? []);

    // Bouw bundel → collecties mapping
    const { data: cbRows } = await (supabase as any)
      .from("collection_bundles").select("bundle_id, collections(id, name)").limit(2000);
    const btc = new Map<string, string[]>();
    for (const row of (cbRows ?? []) as any[]) {
      const name = row.collections?.name;
      if (!name) continue;
      const existing = btc.get(row.bundle_id) ?? [];
      if (!existing.includes(name)) existing.push(name);
      btc.set(row.bundle_id, existing);
    }
    setBundleToCollections(btc);
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
    if (!open) return;
    loadOptions();
    if (sample) {
      setQualityId(sample.quality_id);
      setColorCodeId(sample.color_code_id);
      setDimensionId(sample.dimension_id);
      setDescription(sample.description ?? "");
      setKarpiNaam(sample.karpi_naam ?? "");
      setLocString(sample.location ?? "");
      setMinStock(sample.min_stock);
      setFinishingTypeId(sample.finishing_type_id ?? "");
      (async () => {
        const { data: biRows } = await (supabase as any).from("bundle_items").select("bundle_id").eq("sample_id", sample.id);
        const bundleIds = new Set<string>((biRows ?? []).map((r: any) => r.bundle_id));
        setSelectedBundleIds(bundleIds);
        if (bundleIds.size > 0) {
          const { data: cbRows } = await (supabase as any).from("collection_bundles").select("collection_id").in("bundle_id", [...bundleIds]);
          setSelectedCollectionIds(new Set((cbRows ?? []).map((r: any) => r.collection_id)));
        }
      })();
      loadStock(sample);
      loadExistingDims(sample);
    } else {
      setExistingDimIds(new Set());
      setQualityId("");
      setColorCodeId("");
      setDimensionId("");
      setDescription("");
      setKarpiNaam("");
      setLocString("");
      setMinStock(0);
      setFinishingTypeId("");
      setSelectedBundleIds(new Set());
      setSelectedCollectionIds(new Set());
      setStockTotal(0);
      setOriginalStockTotal(0);
      setPendingQuality("");
      setPendingColor("");
      setPendingDimension("");
      setPendingFinishing("");
      setResetKey((k) => k + 1);
    }
    setPhotoFile(null);
    setError("");
    setConfirmDelete(false);
    setDuplicating(false);
    setDupDimensionId("");
    setCreatingDupDimension(false);
  }, [open, sample, loadOptions, loadStock, loadExistingDims, supabase]);

  const filteredColors = allColors.filter((c) => c.quality_id === qualityId);

  useEffect(() => {
    if (qualityId && colorCodeId && allColors.length > 0) {
      const valid = allColors.some((c) => c.id === colorCodeId && c.quality_id === qualityId);
      if (!valid) setColorCodeId("");
    }
  }, [qualityId, colorCodeId, allColors]);


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
      // Blokkeer als staal in een actieve (niet-voltooide) order zit
      const { data: activeLines } = await supabase
        .from("order_lines")
        .select("order_id, orders!inner(status)")
        .eq("sample_id", sample.id)
        .neq("orders.status", "completed")
        .limit(1);
      if (activeLines && activeLines.length > 0) {
        setError("Dit staal zit in een actieve order en kan niet worden verwijderd.");
        return;
      }

      // Hard delete: bundel-items, voorraad, staal zelf
      await supabase.from("bundle_items").delete().eq("sample_id", sample.id);
      await supabase.from("finished_stock")
        .delete()
        .eq("quality_id", sample.quality_id)
        .eq("color_code_id", sample.color_code_id)
        .eq("dimension_id", sample.dimension_id);
      const { error: err } = await supabase.from("samples").delete().eq("id", sample.id);
      if (err) throw err;

      // Verwijder kwaliteit/kleur als ze nergens meer aan vastzitten
      const { count: qCount } = await supabase
        .from("samples").select("id", { count: "exact", head: true })
        .eq("quality_id", sample.quality_id);
      if (qCount === 0) await supabase.from("qualities").delete().eq("id", sample.quality_id);

      const { count: cCount } = await supabase
        .from("samples").select("id", { count: "exact", head: true })
        .eq("color_code_id", sample.color_code_id);
      if (cCount === 0) await supabase.from("color_codes").delete().eq("id", sample.color_code_id);

      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message ?? "Fout bij verwijderen");
    } finally {
      setDeleting(false);
    }
  }

  async function autoCreateQuality(name: string) {
    const normalized = name.trim().toUpperCase();
    const dup = qualities.find((q) => q.name.toUpperCase() === normalized || q.code.toUpperCase() === normalized);
    if (dup) { setQualityId(dup.id); return { id: dup.id, label: dup.code === dup.name ? dup.name : `${dup.code} — ${dup.name}` }; }

    // Genereer een unieke code (probeer 4 tekens, dan met suffix als die al bestaat)
    const baseCode = normalized.slice(0, 4);
    let code = baseCode;
    let suffix = 2;
    while (qualities.some((q) => q.code.toUpperCase() === code)) {
      code = baseCode.slice(0, 3) + suffix;
      suffix++;
    }

    const { data, error: err } = await supabase.from("qualities")
      .insert({ name: normalized, code, active: true })
      .select("id, name, code").single();
    if (err) { setError(`Kwaliteit aanmaken mislukt: ${err.message}`); return null; }
    setQualities((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setQualityId(data.id);
    return { id: data.id, label: data.code === data.name ? data.name : `${data.code} — ${data.name}` };
  }

  async function autoCreateColor(name: string, forQualityId?: string) {
    const qid = forQualityId ?? qualityId;
    if (!qid && !pendingColor) return null;
    if (!qid) return null; // quality must be resolved first (happens in handleSave)
    const normalized = name.trim();
    const dup = allColors.find((c) => c.quality_id === qid && c.name.toLowerCase() === normalized.toLowerCase());
    if (dup) { setColorCodeId(dup.id); return { id: dup.id, label: dup.code === dup.name ? dup.name : `${dup.code} — ${dup.name}` }; }
    const code = normalized.slice(0, 3).toUpperCase();
    const { data, error: err } = await supabase.from("color_codes")
      .insert({ name: normalized, code, quality_id: qid, active: true, hex_color: null })
      .select("id, code, name, quality_id, hex_color").single();
    if (err) { setError(err.message); return null; }
    setAllColors((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setColorCodeId(data.id);
    return { id: data.id, label: data.code === data.name ? data.name : `${data.code} — ${data.name}` };
  }

  async function autoCreateDimension(name: string) {
    const normalized = name.trim();
    const dup = dimensions.find((d) => d.name.toLowerCase() === normalized.toLowerCase());
    if (dup) { setDimensionId(dup.id); return { id: dup.id, label: dup.name }; }
    const { data, error: err } = await supabase.from("sample_dimensions")
      .insert({ name: normalized, width_cm: 0, height_cm: 0 })
      .select("id, name").single();
    if (err) { setError(err.message); return null; }
    setDimensions((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setDimensionId(data.id);
    return { id: data.id, label: data.name };
  }

  async function autoCreateFinishing(name: string) {
    const normalized = name.trim();
    const dup = finishingTypes.find((f) => f.name.toLowerCase() === normalized.toLowerCase());
    if (dup) { setFinishingTypeId(dup.id); return { id: dup.id, label: dup.name }; }
    const { data, error: err } = await supabase.from("finishing_types")
      .insert({ name: normalized, active: true })
      .select("id, name").single();
    if (err) { setError(err.message); return null; }
    setFinishingTypes((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setFinishingTypeId(data.id);
    return { id: data.id, label: data.name };
  }

  async function handleDuplicate() {
    if (!sample || !dupDimensionId) return;
    setDuplicating(true);
    setError("");
    try {
      const dupLocation = locString.trim() || null;
      const dupQuality = qualities.find((q) => q.id === sample.quality_id);
      const dupColor = allColors.find((c) => c.id === sample.color_code_id);
      const dupDim = dimensions.find((d) => d.id === dupDimensionId);
      if (!dupQuality || !dupColor || !dupDim) {
        throw new Error("Kan artikelnummer niet bepalen — kwaliteit/kleur/afmeting niet gevonden.");
      }
      const { error: err } = await supabase.from("samples").insert({
        quality_id: sample.quality_id,
        color_code_id: sample.color_code_id,
        dimension_id: dupDimensionId,
        description: description || null,
        location: dupLocation,
        min_stock: minStock,
        photo_url: sample.photo_url,
        active: true,
        finishing_type_id: finishingTypeId || null,
        article_number: formatArticleNumber(dupQuality.code, dupColor.code, dupDim.name),
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
    setSaving(true);
    setError("");

    // Resolve pending combobox waarden (getypt maar nog niet bevestigd)
    let resolvedQualityId = qualityId;
    let resolvedColorId = colorCodeId;
    let resolvedDimensionId = dimensionId;

    if (!resolvedQualityId && pendingQuality.trim()) {
      const r = await autoCreateQuality(pendingQuality);
      if (r) resolvedQualityId = r.id;
    }
    if (!resolvedColorId && pendingColor.trim()) {
      const r = await autoCreateColor(pendingColor, resolvedQualityId || undefined);
      if (r) resolvedColorId = r.id;
    }
    if (!resolvedDimensionId && pendingDimension.trim()) {
      const r = await autoCreateDimension(pendingDimension);
      if (r) resolvedDimensionId = r.id;
    }
    if (!finishingTypeId && pendingFinishing.trim()) {
      await autoCreateFinishing(pendingFinishing);
    }

    if (!resolvedQualityId || !resolvedColorId || !resolvedDimensionId) {
      if (!error) {
        const missing = [
          !resolvedQualityId && "kwaliteit",
          !resolvedColorId && "kleur",
          !resolvedDimensionId && "afmeting",
        ].filter(Boolean).join(", ");
        setError(`Vul alle verplichte velden in: ${missing}.`);
      }
      setSaving(false);
      return;
    }

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

      const locationValue = locString.trim() || null;

      const record = {
        quality_id: resolvedQualityId,
        color_code_id: resolvedColorId,
        dimension_id: resolvedDimensionId,
        description: description || null,
        karpi_naam: karpiNaam.trim() || null,
        location: locationValue,
        min_stock: minStock,
        finishing_type_id: finishingTypeId || null,
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
          // Query stock rows filtered exact op quality + color + dim + finishing type
          const ftFilter = finishingTypeId || null;
          let stockQuery = supabase
            .from("finished_stock")
            .select("quality_id, color_code_id, dimension_id, finishing_type_id, location_id, quantity")
            .eq("quality_id", resolvedQualityId)
            .eq("color_code_id", resolvedColorId)
            .eq("dimension_id", resolvedDimensionId);
          if (ftFilter) {
            stockQuery = stockQuery.eq("finishing_type_id", ftFilter);
          } else {
            stockQuery = stockQuery.is("finishing_type_id", null);
          }
          const { data: currentRows } = await stockQuery;

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
                quality_id: resolvedQualityId,
                color_code_id: resolvedColorId,
                dimension_id: resolvedDimensionId,
                finishing_type_id: ftId,
                location_id: locationId,
                quantity: diff,
              });
            if (stockErr) throw stockErr;
          }
        }
      } else {
        // Haal de benodigde velden op uit de DB (state is mogelijk nog niet gesynchroniseerd)
        const [{ data: qRow }, { data: cRow }, { data: dRow }] = await Promise.all([
          supabase.from("qualities").select("id, name, code").eq("id", resolvedQualityId).single(),
          supabase.from("color_codes").select("id, code, name").eq("id", resolvedColorId).single(),
          supabase.from("sample_dimensions").select("id, name").eq("id", resolvedDimensionId).single(),
        ]);
        if (!qRow || !cRow || !dRow) {
          throw new Error("Kan artikelnummer niet bepalen — kwaliteit/kleur/afmeting niet gevonden.");
        }
        const { data: inserted, error: err } = await supabase.from("samples").insert({
          ...record,
          article_number: formatArticleNumber(qRow.code, cRow.code, dRow.name),
        }).select("id").single();
        if (err) throw err;
      }


      // Bundels + collecties opslaan
      const savedSampleId = isEdit ? sample!.id : (await supabase.from("samples").select("id").eq("quality_id", resolvedQualityId).eq("color_code_id", resolvedColorId).eq("dimension_id", resolvedDimensionId).eq("active", true).limit(1).single()).data?.id;
      if (savedSampleId) {
        await (supabase as any).from("bundle_items").delete().eq("sample_id", savedSampleId);
        for (const bId of selectedBundleIds) {
          const { data: maxP } = await (supabase as any).from("bundle_items").select("position").eq("bundle_id", bId).order("position", { ascending: false }).limit(1).maybeSingle();
          await (supabase as any).from("bundle_items").insert({ bundle_id: bId, sample_id: savedSampleId, position: ((maxP as any)?.position ?? 0) + 1 });
          for (const cId of selectedCollectionIds) {
            const { data: exCb } = await (supabase as any).from("collection_bundles").select("id").eq("collection_id", cId).eq("bundle_id", bId).maybeSingle();
            if (!exCb) {
              const { data: maxCP } = await (supabase as any).from("collection_bundles").select("position").eq("collection_id", cId).order("position", { ascending: false }).limit(1).maybeSingle();
              await (supabase as any).from("collection_bundles").insert({ collection_id: cId, bundle_id: bId, position: ((maxCP as any)?.position ?? 0) + 1 });
            }
          }
        }
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
            <ComboboxInput
              autoFocus={!isEdit}
              options={qualities.map((q) => ({ id: q.id, label: q.code === q.name ? q.name : `${q.code} — ${q.name}` }))}
              value={qualityId}
              onChange={(id) => { setQualityId(id); setPendingQuality(""); }}
              placeholder="Typ om te zoeken…"
              onCreateNew={autoCreateQuality}
              onTyped={setPendingQuality}
              resetKey={resetKey}
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label className="text-sm">Kleur *</Label>
            <ComboboxInput
              options={filteredColors.map((c) => ({ id: c.id, label: c.code === c.name ? c.name : `${c.code} — ${c.name}` }))}
              value={colorCodeId}
              onChange={(id) => { setColorCodeId(id); setPendingColor(""); }}
              placeholder={(qualityId || pendingQuality) ? "Typ om te zoeken…" : "Kies eerst een kwaliteit"}
              disabled={!qualityId && !pendingQuality}
              onCreateNew={autoCreateColor}
              onTyped={setPendingColor}
              resetKey={resetKey}
            />
          </div>

          {/* Dimension */}
          <div className="space-y-1.5">
            <Label className="text-sm">Afmeting *</Label>
            {isEdit ? (
              <div className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {dimensions.find((d) => d.id === dimensionId)?.name ?? "—"}
              </div>
            ) : (
              <ComboboxInput
                options={dimensions.map((d) => ({ id: d.id, label: d.name }))}
                value={dimensionId}
                onChange={(id) => { setDimensionId(id); setPendingDimension(""); }}
                placeholder="Typ om te zoeken…"
                onCreateNew={autoCreateDimension}
                onTyped={setPendingDimension}
                resetKey={resetKey}
              />
            )}
          </div>

          {/* Afwerking */}
          <div className="space-y-1.5">
            <Label className="text-sm">Afwerking</Label>
            <ComboboxInput
              options={[{ id: "", label: "— Geen afwerking —" }, ...finishingTypes.map((ft) => ({ id: ft.id, label: ft.name }))]}
              value={finishingTypeId}
              onChange={(id) => { setFinishingTypeId(id); setPendingFinishing(""); }}
              placeholder="Typ om te zoeken…"
              onCreateNew={autoCreateFinishing}
              onTyped={setPendingFinishing}
              resetKey={resetKey}
            />
          </div>

          {/* Karpi naam */}
          <div className="space-y-1.5">
            <Label className="text-sm">Karpi naam</Label>
            <Input
              value={karpiNaam}
              onChange={(e) => setKarpiNaam(e.target.value)}
              placeholder="Optionele karpi naam…"
              className="text-sm"
            />
          </div>


          {/* Bundels */}
          {bundles.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">Bundels</Label>
              <div className="flex flex-wrap gap-2">
                {bundles.map((bundle) => (
                  <label key={bundle.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBundleIds.has(bundle.id)}
                      onChange={(e) => {
                        const next = new Set(selectedBundleIds);
                        if (e.target.checked) next.add(bundle.id); else next.delete(bundle.id);
                        setSelectedBundleIds(next);
                      }}
                      className="rounded"
                    />
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm">{bundle.name}</span>
                      {(bundleToCollections.get(bundle.id) ?? []).map(c => (
                        <span key={c} className="text-[11px] text-muted-foreground">{c}</span>
                      ))}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Collecties — afgeleid van geselecteerde bundels (read-only) */}
          {(() => {
            const derived = [...new Set(
              [...selectedBundleIds].flatMap(bid => bundleToCollections.get(bid) ?? [])
            )].sort();
            if (derived.length === 0) return null;
            return (
              <div className="space-y-1.5">
                <Label className="text-sm">Collecties <span className="font-normal text-muted-foreground">(via bundels)</span></Label>
                <div className="flex flex-wrap gap-1.5">
                  {derived.map(c => (
                    <span key={c} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{c}</span>
                  ))}
                </div>
              </div>
            );
          })()}


          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-sm">Locatie <span className="text-muted-foreground font-normal">(bv. A-01-02)</span></Label>
            <Input
              value={locString}
              onChange={(e) => setLocString(e.target.value.toUpperCase())}
              placeholder="A-01-02"
              className="w-36 font-mono text-sm"
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
