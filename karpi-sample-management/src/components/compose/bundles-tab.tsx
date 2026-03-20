// src/components/compose/bundles-tab.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  X,
  AlertCircle,
} from "lucide-react";
import { DeactivateDialog } from "@/components/compose/deactivate-dialog";

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
}

interface Dimension {
  id: string;
  name: string;
}

interface Bundle {
  id: string;
  name: string;
  quality_id: string;
  quality_name: string;
  quality_code: string;
  dimension_id: string;
  dimension_name: string;
  colors: { id: string; color_code_id: string; code: string; name: string }[];
  active: boolean;
}

interface BundlesTabProps {
  bundles: Bundle[];
  qualities: Quality[];
  colorCodes: ColorCode[];
  dimensions: Dimension[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSave: (data: {
    id: string | null;
    name: string;
    quality_id: string;
    dimension_id: string;
    color_ids: string[];
  }) => Promise<{ error?: string }>;
  onDeactivate: (id: string) => void;
}

export function BundlesTab({
  bundles,
  qualities,
  colorCodes,
  dimensions,
  loading,
  error,
  onRetry,
  onSave,
  onDeactivate,
}: BundlesTabProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null); // null = not editing, "new" = adding
  const [editName, setEditName] = useState("");
  const [editQuality, setEditQuality] = useState("");
  const [editDimension, setEditDimension] = useState("");
  const [editColors, setEditColors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function toggleExpand(key: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function startEdit(bundle: Bundle) {
    setEditingId(bundle.id);
    setEditName(bundle.name);
    setEditQuality(bundle.quality_id);
    setEditDimension(bundle.dimension_id);
    setEditColors(bundle.colors.map((c) => c.color_code_id));
    setExpandedRows((prev) => new Set(prev).add(bundle.id));
    setSaveError("");
  }

  function startNew() {
    setEditingId("new");
    setEditName("");
    setEditQuality("");
    setEditDimension("");
    setEditColors([]);
    setSaveError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveError("");
  }

  async function handleSave() {
    if (!editName.trim() || !editQuality || !editDimension || editColors.length === 0) return;
    setSaving(true);
    setSaveError("");
    const result = await onSave({
      id: editingId === "new" ? null : editingId,
      name: editName.trim(),
      quality_id: editQuality,
      dimension_id: editDimension,
      color_ids: editColors,
    });
    setSaving(false);
    if (result.error) {
      setSaveError(result.error);
    } else {
      setEditingId(null);
    }
  }

  function removeColor(colorId: string) {
    setEditColors((prev) => prev.filter((id) => id !== colorId));
  }

  function addColor(colorId: string) {
    setEditColors((prev) => [...prev, colorId]);
  }

  function moveColor(index: number, direction: "up" | "down") {
    setEditColors((prev) => {
      const next = [...prev];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  }

  const editColorsForQuality = colorCodes.filter((cc) => cc.quality_id === editQuality);
  const availableColors = editColorsForQuality.filter((cc) => !editColors.includes(cc.id));

  if (error) {
    return (
      <div className="rounded-xl bg-card p-8 text-center ring-1 ring-border">
        <AlertCircle size={32} className="mx-auto mb-3 text-red-500/50" />
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>Opnieuw proberen</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-10" />
            <TableHead>Bundel</TableHead>
            <TableHead>Kwaliteit</TableHead>
            <TableHead>Maat</TableHead>
            <TableHead className="text-center">Kleuren</TableHead>
            <TableHead className="text-right">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell />
              {[1, 2, 3, 4, 5].map((j) => (
                <TableCell key={j}><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30">
          <TableHead className="w-10" />
          <TableHead>Bundel</TableHead>
          <TableHead>Kwaliteit</TableHead>
          <TableHead>Maat</TableHead>
          <TableHead className="text-center">Kleuren</TableHead>
          <TableHead className="text-right">Acties</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bundles.map((bundle) => {
          const isEditing = editingId === bundle.id;
          const expanded = expandedRows.has(bundle.id) || isEditing;

          if (isEditing) {
            return (
              <EditBundleRows
                key={bundle.id}
                editName={editName}
                setEditName={setEditName}
                editQuality={editQuality}
                setEditQuality={(v) => { setEditQuality(v); setEditColors([]); }}
                editDimension={editDimension}
                setEditDimension={setEditDimension}
                editColors={editColors}
                qualities={qualities}
                dimensions={dimensions}
                editColorsForQuality={editColorsForQuality}
                availableColors={availableColors}
                colorCodes={colorCodes}
                saving={saving}
                saveError={saveError}
                onSave={handleSave}
                onCancel={cancelEdit}
                onRemoveColor={removeColor}
                onAddColor={addColor}
                onMoveColor={moveColor}
              />
            );
          }

          return (
            <BundleRows
              key={bundle.id}
              bundle={bundle}
              expanded={expanded}
              onToggle={() => toggleExpand(bundle.id)}
              onEdit={() => startEdit(bundle)}
              onDeactivate={() => onDeactivate(bundle.id)}
            />
          );
        })}

        {editingId === "new" && (
          <EditBundleRows
            editName={editName}
            setEditName={setEditName}
            editQuality={editQuality}
            setEditQuality={(v) => { setEditQuality(v); setEditColors([]); }}
            editDimension={editDimension}
            setEditDimension={setEditDimension}
            editColors={editColors}
            qualities={qualities}
            dimensions={dimensions}
            editColorsForQuality={editColorsForQuality}
            availableColors={availableColors}
            colorCodes={colorCodes}
            saving={saving}
            saveError={saveError}
            onSave={handleSave}
            onCancel={cancelEdit}
            onRemoveColor={removeColor}
            onAddColor={addColor}
            onMoveColor={moveColor}
          />
        )}

        {editingId === null && (
          <TableRow
            className="cursor-pointer hover:bg-muted/30 border-t-2 border-dashed"
            onClick={startNew}
          >
            <TableCell><Plus size={16} className="text-foreground/60" /></TableCell>
            <TableCell colSpan={5} className="text-foreground/60 font-medium">
              Nieuwe bundel toevoegen
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/* ── Sub-components ── */

function BundleRows({
  bundle,
  expanded,
  onToggle,
  onEdit,
  onDeactivate,
}: {
  bundle: Bundle;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="w-10">
          {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-medium">{bundle.name}</TableCell>
        <TableCell className="text-muted-foreground">{bundle.quality_code}</TableCell>
        <TableCell className="text-muted-foreground">{bundle.dimension_name}</TableCell>
        <TableCell className="text-center">{bundle.colors.length}</TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <button onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Bewerken">
            <Pencil size={14} />
          </button>
          <DeactivateDialog itemType="Bundel" itemName={bundle.name} onConfirm={onDeactivate} />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell />
          <TableCell colSpan={5} className="pt-0">
            <div className="flex flex-wrap gap-1.5 py-1">
              {bundle.colors.map((c, i) => (
                <span key={c.id} className="inline-flex items-center rounded-md bg-muted/50 px-2.5 py-1 text-xs ring-1 ring-border/40">
                  {i + 1}. {c.code} — {c.name}
                </span>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function EditBundleRows({
  editName, setEditName,
  editQuality, setEditQuality,
  editDimension, setEditDimension,
  editColors,
  qualities, dimensions, editColorsForQuality, availableColors, colorCodes,
  saving, saveError,
  onSave, onCancel, onRemoveColor, onAddColor, onMoveColor,
}: {
  editName: string; setEditName: (v: string) => void;
  editQuality: string; setEditQuality: (v: string) => void;
  editDimension: string; setEditDimension: (v: string) => void;
  editColors: string[];
  qualities: Quality[]; dimensions: Dimension[];
  editColorsForQuality: ColorCode[]; availableColors: ColorCode[];
  colorCodes: ColorCode[];
  saving: boolean; saveError: string;
  onSave: () => void; onCancel: () => void;
  onRemoveColor: (id: string) => void; onAddColor: (id: string) => void;
  onMoveColor: (index: number, direction: "up" | "down") => void;
}) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    }
    if (showColorPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showColorPicker]);

  return (
    <>
      <TableRow className="bg-amber-50/50">
        <TableCell className="w-10" />
        <TableCell>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Bundelnaam"
            className="h-8 w-48"
          />
        </TableCell>
        <TableCell>
          <Select value={editQuality} onValueChange={(v) => setEditQuality(v ?? "")}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue placeholder="Product">{qualities.find((q) => q.id === editQuality)?.code}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {qualities.map((q) => (
                <SelectItem key={q.id} value={q.id}>{q.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          <Select value={editDimension} onValueChange={(v) => setEditDimension(v ?? "")}>
            <SelectTrigger className="h-8 w-24">
              <SelectValue placeholder="Maat">{dimensions.find((d) => d.id === editDimension)?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {dimensions.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="text-center">{editColors.length}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={saving || !editName.trim() || !editQuality || !editDimension || editColors.length === 0}
              onClick={onSave}
            >
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>
              Annuleer
            </Button>
          </div>
        </TableCell>
      </TableRow>
      <TableRow className="bg-amber-50/50 hover:bg-amber-50/50">
        <TableCell />
        <TableCell colSpan={5} className="pt-0">
          {saveError && <p className="text-sm text-red-600 mb-2">{saveError}</p>}
          <div className="flex flex-wrap gap-1.5 items-center py-1">
            {editColors.map((colorId, i) => {
              const color = editColorsForQuality.find((c) => c.id === colorId) ??
                colorCodes.find((c) => c.id === colorId);
              return (
                <span key={colorId} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs ring-1 ring-border/60">
                  <span className="text-muted-foreground/60">{i + 1}.</span>
                  {color?.code ?? "?"}
                  <button
                    onClick={() => onMoveColor(i, "up")}
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 ml-1"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => onMoveColor(i, "down")}
                    disabled={i === editColors.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                  >
                    <ChevronDown size={12} />
                  </button>
                  <button onClick={() => onRemoveColor(colorId)} className="text-muted-foreground hover:text-red-600">
                    <X size={12} />
                  </button>
                </span>
              );
            })}
            {editQuality && availableColors.length > 0 && (
              <div className="relative" ref={colorPickerRef}>
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
                >
                  <Plus size={12} /> Kleur toevoegen
                </button>
                {showColorPicker && (
                  <div className="absolute top-full left-0 z-10 mt-1 max-h-48 w-48 overflow-y-auto rounded-lg bg-card p-1 shadow-lg ring-1 ring-border">
                    {availableColors.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { onAddColor(c.id); setShowColorPicker(false); }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted text-left"
                      >
                        <span className="font-mono">{c.code}</span>
                        <span className="text-muted-foreground">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {editQuality && editColorsForQuality.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Dit product heeft nog geen kleuren.</p>
            )}
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}
