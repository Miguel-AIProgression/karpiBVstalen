"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

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

  useEffect(() => {
    if (open) {
      loadOptions();
      if (sample) {
        setQualityId(sample.quality_id);
        setColorCodeId(sample.color_code_id);
        setDimensionId(sample.dimension_id);
        setDescription(sample.description ?? "");
        setMinStock(sample.min_stock);
      } else {
        setQualityId("");
        setColorCodeId("");
        setDimensionId("");
        setDescription("");
        setMinStock(0);
      }
      setPhotoFile(null);
      setError("");
    }
  }, [open, sample, loadOptions]);

  const filteredColors = allColors.filter((c) => c.quality_id === qualityId);

  // Reset color when quality changes (if color doesn't belong to new quality)
  useEffect(() => {
    if (qualityId && colorCodeId) {
      const valid = allColors.some((c) => c.id === colorCodeId && c.quality_id === qualityId);
      if (!valid) setColorCodeId("");
    }
  }, [qualityId, colorCodeId, allColors]);

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

      // Upload photo if provided
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-background p-6 ring-1 ring-border shadow-xl">
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
            <select
              value={qualityId}
              onChange={(e) => setQualityId(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            >
              <option value="">Selecteer kwaliteit</option>
              {qualities.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.code} — {q.name}
                </option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label className="text-sm">Kleur *</Label>
            <select
              value={colorCodeId}
              onChange={(e) => setColorCodeId(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
              disabled={!qualityId}
            >
              <option value="">
                {qualityId ? "Selecteer kleur" : "Kies eerst een kwaliteit"}
              </option>
              {filteredColors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dimension */}
          <div className="space-y-1.5">
            <Label className="text-sm">Afmeting *</Label>
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
