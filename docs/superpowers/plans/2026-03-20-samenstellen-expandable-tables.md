# Samenstellen Expandable Tables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card/badge layout on the Samenstellen page with expandable tables across all three tabs (Products, Bundles, Collections), with inline CRUD for Bundles and Collections.

**Architecture:** The current monolithic `compose/page.tsx` (750 lines) is split into focused components: tab-specific components for each tab's unique rendering and edit logic, and a `DeactivateDialog` using shadcn AlertDialog. Data loading and handlers stay in the page component; UI rendering is delegated to child components. Each tab manages its own expand/collapse state internally since their nesting structures differ (1-level for Products, 1-level+edit for Bundles, 3-level+edit for Collections).

**Tech Stack:** Next.js 16 (App Router), Supabase client, Tailwind CSS v4, shadcn/ui v4 (base-nova), Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-20-samenstellen-expandable-tables-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/app/management/compose/page.tsx` | Modify: data loading, state, handlers, tab shell — delegates rendering to child components |
| `src/components/compose/products-tab.tsx` | Create: read-only expandable table of qualities → colors |
| `src/components/compose/bundles-tab.tsx` | Create: expandable table with inline edit/create for bundles |
| `src/components/compose/collections-tab.tsx` | Create: three-level expandable table with inline bundle search and CRUD |
| `src/components/compose/deactivate-dialog.tsx` | Create: shadcn AlertDialog wrapper for deactivation confirmation |
| `src/components/ui/alert-dialog.tsx` | Create: install shadcn AlertDialog component |

---

### Task 1: Install shadcn AlertDialog

**Files:**
- Create: `src/components/ui/alert-dialog.tsx`

- [ ] **Step 1: Install AlertDialog via shadcn CLI**

Run: `cd karpi-sample-management && npx shadcn@latest add alert-dialog`

Expected: `alert-dialog.tsx` created in `src/components/ui/`

- [ ] **Step 2: Verify the file exists and imports work**

Run: `cd karpi-sample-management && cat src/components/ui/alert-dialog.tsx | head -5`

Expected: File exists with imports from `@base-ui/react` or similar

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/alert-dialog.tsx
git commit -m "feat: install shadcn AlertDialog component"
```

---

### Task 2: Create DeactivateDialog component

**Files:**
- Create: `src/components/compose/deactivate-dialog.tsx`

- [ ] **Step 1: Create the DeactivateDialog component**

```tsx
// src/components/compose/deactivate-dialog.tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";

interface DeactivateDialogProps {
  itemType: "Bundel" | "Collectie";
  itemName: string;
  onConfirm: () => void;
}

export function DeactivateDialog({ itemType, itemName, onConfirm }: DeactivateDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
          title="Deactiveren"
        >
          <Trash2 size={14} />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
          <AlertDialogDescription>
            {itemType} &lsquo;{itemName}&rsquo; wordt gedeactiveerd.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuleren</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Deactiveren
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd karpi-sample-management && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors related to `deactivate-dialog.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/compose/deactivate-dialog.tsx
git commit -m "feat: add DeactivateDialog component with AlertDialog"
```

---

### Task 3: Create ProductsTab component

**Files:**
- Create: `src/components/compose/products-tab.tsx`

- [ ] **Step 1: Create the ProductsTab component**

Read-only expandable table: qualities with expandable color pills. Self-contained component with its own expand/collapse state, loading skeleton, and error handling.

```tsx
// src/components/compose/products-tab.tsx
"use client";

import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, AlertCircle } from "lucide-react";

interface Quality { id: string; name: string; code: string; }
interface ColorCode { id: string; code: string; name: string; quality_id: string; }

interface ProductsTabProps {
  qualities: Quality[];
  colorCodes: ColorCode[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function ProductsTab({ qualities, colorCodes, loading, error, onRetry }: ProductsTabProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

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
            <TableHead>Kwaliteit</TableHead>
            <TableHead>Code</TableHead>
            <TableHead className="text-center">Kleuren</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell />
              {[1, 2, 3].map((j) => (
                <TableCell key={j}><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Producten worden beheerd via Productie &rarr; Overzicht. Hier zie je een overzicht.
      </p>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-10" />
            <TableHead>Kwaliteit</TableHead>
            <TableHead>Code</TableHead>
            <TableHead className="text-center">Kleuren</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {qualities.map((q) => {
            const colors = colorCodes.filter((cc) => cc.quality_id === q.id);
            const expanded = expandedRows.has(q.id);
            return (
              <>
                <TableRow key={q.id} className="cursor-pointer" onClick={() => toggleExpand(q.id)}>
                  <TableCell className="w-10">
                    {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-medium">{q.name}</TableCell>
                  <TableCell className="text-muted-foreground">{q.code}</TableCell>
                  <TableCell className="text-center">{colors.length}</TableCell>
                </TableRow>
                {expanded && (
                  <TableRow key={`${q.id}-colors`} className="hover:bg-transparent">
                    <TableCell />
                    <TableCell colSpan={3} className="pt-0">
                      <div className="flex flex-wrap gap-1.5 py-1">
                        {colors.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Geen kleuren</p>
                        ) : colors.map((c) => (
                          <span key={c.id} className="inline-flex items-center rounded-md bg-muted/50 px-2.5 py-1 text-xs ring-1 ring-border/40">
                            {c.code} — {c.name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd karpi-sample-management && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/compose/products-tab.tsx
git commit -m "feat: add ProductsTab with expandable quality/color table"
```

---

### Task 4: Create BundlesTab component

**Files:**
- Create: `src/components/compose/bundles-tab.tsx`

This is the most complex tab — expandable rows with inline edit mode. The component receives all data and handlers as props from the page.

- [ ] **Step 1: Create the BundlesTab component**

```tsx
// src/components/compose/bundles-tab.tsx
"use client";

import { useState } from "react";
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
          <Select value={editQuality} onValueChange={setEditQuality}>
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
          <Select value={editDimension} onValueChange={setEditDimension}>
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
              <div className="relative">
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

```

- [ ] **Step 2: Verify it compiles**

Run: `cd karpi-sample-management && npx tsc --noEmit --pretty 2>&1 | head -30`

Follow the existing Select API pattern from `page.tsx` line 560 — `SelectValue` with both `placeholder` prop and children showing selected value.

- [ ] **Step 3: Commit**

```bash
git add src/components/compose/bundles-tab.tsx
git commit -m "feat: add BundlesTab with expandable rows and inline edit"
```

---

### Task 5: Create CollectionsTab component

**Files:**
- Create: `src/components/compose/collections-tab.tsx`

Three-level nesting: Collection → Bundles → Colors. Inline edit with bundle search dropdown.

- [ ] **Step 1: Create the CollectionsTab component**

```tsx
// src/components/compose/collections-tab.tsx
"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  X,
  Search,
  AlertCircle,
} from "lucide-react";
import { DeactivateDialog } from "@/components/compose/deactivate-dialog";

interface Bundle {
  id: string;
  name: string;
  quality_code: string;
  dimension_name: string;
  colors: { id: string; color_code_id: string; code: string; name: string }[];
}

interface CollectionBundle {
  id: string;
  bundle_id: string;
  bundle_name: string;
  quality_code: string;
  dimension_name: string;
  color_count: number;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  bundles: CollectionBundle[];
}

interface CollectionsTabProps {
  collections: Collection[];
  allBundles: Bundle[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSave: (data: {
    id: string | null;
    name: string;
    description: string | null;
    bundle_ids: string[];
  }) => Promise<{ error?: string }>;
  onDeactivate: (id: string) => void;
  onGoToBundlesTab: () => void;
}

export function CollectionsTab({
  collections,
  allBundles,
  loading,
  error,
  onRetry,
  onSave,
  onDeactivate,
  onGoToBundlesTab,
}: CollectionsTabProps) {
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBundleIds, setEditBundleIds] = useState<string[]>([]);
  const [bundleSearch, setBundleSearch] = useState("");
  const [showBundleDropdown, setShowBundleDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function toggleCollection(id: string) {
    setExpandedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleBundle(key: string) {
    setExpandedBundles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function startEdit(coll: Collection) {
    setEditingId(coll.id);
    setEditName(coll.name);
    setEditDescription(coll.description ?? "");
    setEditBundleIds(coll.bundles.map((b) => b.bundle_id));
    setExpandedCollections((prev) => new Set(prev).add(coll.id));
    setSaveError("");
    setBundleSearch("");
  }

  function startNew() {
    setEditingId("new");
    setEditName("");
    setEditDescription("");
    setEditBundleIds([]);
    setSaveError("");
    setBundleSearch("");
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveError("");
  }

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true);
    setSaveError("");
    const result = await onSave({
      id: editingId === "new" ? null : editingId,
      name: editName.trim(),
      description: editDescription.trim() || null,
      bundle_ids: editBundleIds,
    });
    setSaving(false);
    if (result.error) {
      setSaveError(result.error);
    } else {
      setEditingId(null);
    }
  }

  function addBundle(bundleId: string) {
    setEditBundleIds((prev) => [...prev, bundleId]);
    setBundleSearch("");
    setShowBundleDropdown(false);
  }

  function removeBundle(bundleId: string) {
    setEditBundleIds((prev) => prev.filter((id) => id !== bundleId));
  }

  const filteredBundles = allBundles.filter((b) => {
    const q = bundleSearch.toLowerCase();
    return b.name.toLowerCase().includes(q) || b.quality_code.toLowerCase().includes(q);
  });

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
            <TableHead>Collectie / Bundel</TableHead>
            <TableHead className="text-center">Bundels</TableHead>
            <TableHead className="text-center">Kleuren</TableHead>
            <TableHead className="text-right">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell />
              {[1, 2, 3, 4].map((j) => (
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
          <TableHead>Collectie / Bundel</TableHead>
          <TableHead className="text-center">Bundels</TableHead>
          <TableHead className="text-center">Kleuren</TableHead>
          <TableHead className="text-right">Acties</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {collections.map((coll) => {
          const isEditing = editingId === coll.id;
          const expanded = expandedCollections.has(coll.id) || isEditing;
          const totalColors = coll.bundles.reduce((sum, b) => sum + b.color_count, 0);

          return (
            <CollectionRows
              key={coll.id}
              collection={coll}
              expanded={expanded}
              isEditing={isEditing}
              totalColors={totalColors}
              expandedBundles={expandedBundles}
              allBundles={allBundles}
              editName={editName}
              editDescription={editDescription}
              editBundleIds={editBundleIds}
              bundleSearch={bundleSearch}
              showBundleDropdown={showBundleDropdown}
              filteredBundles={filteredBundles}
              saving={saving}
              saveError={saveError}
              onToggleCollection={() => toggleCollection(coll.id)}
              onToggleBundle={toggleBundle}
              onEdit={() => startEdit(coll)}
              onDeactivate={() => onDeactivate(coll.id)}
              setEditName={setEditName}
              setEditDescription={setEditDescription}
              setBundleSearch={setBundleSearch}
              setShowBundleDropdown={setShowBundleDropdown}
              onAddBundle={addBundle}
              onRemoveBundle={removeBundle}
              onSave={handleSave}
              onCancel={cancelEdit}
              onGoToBundlesTab={onGoToBundlesTab}
            />
          );
        })}

        {editingId === "new" && (
          <NewCollectionRows
            editName={editName}
            editDescription={editDescription}
            editBundleIds={editBundleIds}
            allBundles={allBundles}
            bundleSearch={bundleSearch}
            showBundleDropdown={showBundleDropdown}
            filteredBundles={filteredBundles}
            saving={saving}
            saveError={saveError}
            setEditName={setEditName}
            setEditDescription={setEditDescription}
            setBundleSearch={setBundleSearch}
            setShowBundleDropdown={setShowBundleDropdown}
            onAddBundle={addBundle}
            onRemoveBundle={removeBundle}
            onSave={handleSave}
            onCancel={cancelEdit}
            onGoToBundlesTab={onGoToBundlesTab}
          />
        )}

        {editingId === null && (
          <TableRow
            className="cursor-pointer hover:bg-muted/30 border-t-2 border-dashed"
            onClick={startNew}
          >
            <TableCell><Plus size={16} className="text-foreground/60" /></TableCell>
            <TableCell colSpan={4} className="text-foreground/60 font-medium">
              Nieuwe collectie toevoegen
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/* ── CollectionRows: display + edit mode ── */

interface CollectionRowsProps {
  collection: Collection;
  expanded: boolean;
  isEditing: boolean;
  totalColors: number;
  expandedBundles: Set<string>;
  allBundles: Bundle[];
  editName: string;
  editDescription: string;
  editBundleIds: string[];
  bundleSearch: string;
  showBundleDropdown: boolean;
  filteredBundles: Bundle[];
  saving: boolean;
  saveError: string;
  onToggleCollection: () => void;
  onToggleBundle: (key: string) => void;
  onEdit: () => void;
  onDeactivate: () => void;
  setEditName: (v: string) => void;
  setEditDescription: (v: string) => void;
  setBundleSearch: (v: string) => void;
  setShowBundleDropdown: (v: boolean) => void;
  onAddBundle: (id: string) => void;
  onRemoveBundle: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onGoToBundlesTab: () => void;
}

function CollectionRows(props: CollectionRowsProps) {
  const {
    collection, expanded, isEditing, totalColors,
    expandedBundles, allBundles,
    editName, editDescription, editBundleIds,
    bundleSearch, showBundleDropdown, filteredBundles,
    saving, saveError,
    onToggleCollection, onToggleBundle, onEdit, onDeactivate,
    setEditName, setEditDescription, setBundleSearch, setShowBundleDropdown,
    onAddBundle, onRemoveBundle, onSave, onCancel, onGoToBundlesTab,
  } = props;
  if (isEditing) {
    return (
      <>
        {/* Edit header row */}
        <TableRow className="bg-amber-50/50">
          <TableCell className="w-10">
            <ChevronDown size={16} className="text-muted-foreground" />
          </TableCell>
          <TableCell>
            <div className="flex gap-2">
              <Input value={editName} onChange={(e: any) => setEditName(e.target.value)} placeholder="Collectienaam" className="h-8 w-48" />
              <Input value={editDescription} onChange={(e: any) => setEditDescription(e.target.value)} placeholder="Omschrijving (optioneel)" className="h-8 w-56" />
            </div>
          </TableCell>
          <TableCell className="text-center">{editBundleIds.length}</TableCell>
          <TableCell className="text-center">—</TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-1">
              <Button size="sm" className="h-7 text-xs" disabled={saving || !editName.trim()} onClick={onSave}>
                {saving ? "Opslaan..." : "Opslaan"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>Annuleer</Button>
            </div>
          </TableCell>
        </TableRow>
        {/* Edit body: bundles list + search */}
        <TableRow className="bg-amber-50/50 hover:bg-amber-50/50">
          <TableCell />
          <TableCell colSpan={4} className="pt-0">
            {saveError && <p className="text-sm text-red-600 mb-2">{saveError}</p>}
            <BundleEditList
              editBundleIds={editBundleIds}
              allBundles={allBundles}
              bundleSearch={bundleSearch}
              showBundleDropdown={showBundleDropdown}
              filteredBundles={filteredBundles}
              setBundleSearch={setBundleSearch}
              setShowBundleDropdown={setShowBundleDropdown}
              onAddBundle={onAddBundle}
              onRemoveBundle={onRemoveBundle}
              onGoToBundlesTab={onGoToBundlesTab}
            />
          </TableCell>
        </TableRow>
      </>
    );
  }

  return (
    <>
      {/* Collection header row */}
      <TableRow className="cursor-pointer" onClick={onToggleCollection}>
        <TableCell className="w-10">
          {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-medium">{collection.name}</TableCell>
        <TableCell className="text-center">{collection.bundles.length}</TableCell>
        <TableCell className="text-center">{totalColors}</TableCell>
        <TableCell className="text-right" onClick={(e: any) => e.stopPropagation()}>
          <button onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Bewerken">
            <Pencil size={14} />
          </button>
          <DeactivateDialog itemType="Collectie" itemName={collection.name} onConfirm={onDeactivate} />
        </TableCell>
      </TableRow>
      {/* Expanded: bundle sub-rows */}
      {expanded && collection.bundles.map((cb: CollectionBundle) => {
        const bundleKey = `${collection.id}-${cb.bundle_id}`;
        const bundleExpanded = expandedBundles.has(bundleKey);
        const fullBundle = allBundles.find((b: Bundle) => b.id === cb.bundle_id);
        return (
          <BundleSubRows
            key={bundleKey}
            cb={cb}
            fullBundle={fullBundle}
            expanded={bundleExpanded}
            onToggle={() => onToggleBundle(bundleKey)}
          />
        );
      })}
      {expanded && collection.bundles.length === 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell />
          <TableCell colSpan={4} className="text-xs text-muted-foreground italic pl-8">
            Geen bundels toegevoegd
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/* ── NewCollectionRows: same as edit but for new ── */

interface EditCollectionFieldsProps {
  editName: string;
  editDescription: string;
  editBundleIds: string[];
  allBundles: Bundle[];
  bundleSearch: string;
  showBundleDropdown: boolean;
  filteredBundles: Bundle[];
  saving: boolean;
  saveError: string;
  setEditName: (v: string) => void;
  setEditDescription: (v: string) => void;
  setBundleSearch: (v: string) => void;
  setShowBundleDropdown: (v: boolean) => void;
  onAddBundle: (id: string) => void;
  onRemoveBundle: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onGoToBundlesTab: () => void;
}

function NewCollectionRows(props: EditCollectionFieldsProps) {
  const {
    editName, editDescription, editBundleIds, allBundles,
    bundleSearch, showBundleDropdown, filteredBundles,
    saving, saveError,
    setEditName, setEditDescription, setBundleSearch, setShowBundleDropdown,
    onAddBundle, onRemoveBundle, onSave, onCancel, onGoToBundlesTab,
  } = props;
  return (
    <>
      <TableRow className="bg-amber-50/50">
        <TableCell className="w-10" />
        <TableCell>
          <div className="flex gap-2">
            <Input value={editName} onChange={(e: any) => setEditName(e.target.value)} placeholder="Collectienaam" className="h-8 w-48" />
            <Input value={editDescription} onChange={(e: any) => setEditDescription(e.target.value)} placeholder="Omschrijving (optioneel)" className="h-8 w-56" />
          </div>
        </TableCell>
        <TableCell className="text-center">{editBundleIds.length}</TableCell>
        <TableCell className="text-center">—</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button size="sm" className="h-7 text-xs" disabled={saving || !editName.trim()} onClick={onSave}>
              {saving ? "Opslaan..." : "Aanmaken"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>Annuleer</Button>
          </div>
        </TableCell>
      </TableRow>
      <TableRow className="bg-amber-50/50 hover:bg-amber-50/50">
        <TableCell />
        <TableCell colSpan={4} className="pt-0">
          {saveError && <p className="text-sm text-red-600 mb-2">{saveError}</p>}
          <BundleEditList
            editBundleIds={editBundleIds}
            allBundles={allBundles}
            bundleSearch={bundleSearch}
            showBundleDropdown={showBundleDropdown}
            filteredBundles={filteredBundles}
            setBundleSearch={setBundleSearch}
            setShowBundleDropdown={setShowBundleDropdown}
            onAddBundle={onAddBundle}
            onRemoveBundle={onRemoveBundle}
            onGoToBundlesTab={onGoToBundlesTab}
          />
        </TableCell>
      </TableRow>
    </>
  );
}

/* ── BundleSubRows: level 2+3 in collections ── */

function BundleSubRows({
  cb,
  fullBundle,
  expanded,
  onToggle,
}: {
  cb: CollectionBundle;
  fullBundle: Bundle | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/30" onClick={onToggle}>
        <TableCell />
        <TableCell className="pl-8">
          <span className="inline-flex items-center gap-2">
            {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
            <span className="font-medium text-sm">{cb.bundle_name}</span>
            <span className="text-xs text-muted-foreground">{cb.quality_code} · {cb.dimension_name}</span>
          </span>
        </TableCell>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
        <TableCell className="text-center">{cb.color_count}</TableCell>
        <TableCell />
      </TableRow>
      {expanded && fullBundle && (
        <TableRow className="hover:bg-transparent">
          <TableCell />
          <TableCell colSpan={4} className="pt-0 pl-16">
            <div className="flex flex-wrap gap-1.5 py-1">
              {fullBundle.colors.map((c) => (
                <span key={c.id} className="inline-flex items-center rounded-md bg-muted/50 px-2.5 py-1 text-xs ring-1 ring-border/40">
                  {c.code} — {c.name}
                </span>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/* ── BundleEditList: search+add bundles in edit mode ── */

interface BundleEditListProps {
  editBundleIds: string[];
  allBundles: Bundle[];
  bundleSearch: string;
  showBundleDropdown: boolean;
  filteredBundles: Bundle[];
  setBundleSearch: (v: string) => void;
  setShowBundleDropdown: (v: boolean) => void;
  onAddBundle: (id: string) => void;
  onRemoveBundle: (id: string) => void;
  onGoToBundlesTab: () => void;
}

function BundleEditList({
  editBundleIds, allBundles,
  bundleSearch, showBundleDropdown, filteredBundles,
  setBundleSearch, setShowBundleDropdown,
  onAddBundle, onRemoveBundle, onGoToBundlesTab,
}: BundleEditListProps) {
  return (
    <div className="space-y-2 py-1">
      {/* Selected bundles */}
      {editBundleIds.map((bid: string) => {
        const b = allBundles.find((ab: Bundle) => ab.id === bid);
        return (
          <div key={bid} className="flex items-center gap-2 text-sm">
            <span className="font-medium">{b?.name ?? "?"}</span>
            <span className="text-xs text-muted-foreground">{b?.quality_code} · {b?.dimension_name}</span>
            <button onClick={() => onRemoveBundle(bid)} className="ml-auto text-muted-foreground hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        );
      })}

      {/* Search to add */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-muted-foreground" />
          <Input
            value={bundleSearch}
            onChange={(e: any) => { setBundleSearch(e.target.value); setShowBundleDropdown(true); }}
            onFocus={() => setShowBundleDropdown(true)}
            placeholder="Zoek bundel om toe te voegen..."
            className="h-7 w-64 text-xs"
          />
          <span className="text-xs text-muted-foreground">of</span>
          <button onClick={onGoToBundlesTab} className="text-xs text-foreground underline underline-offset-2 hover:text-foreground/80">
            Nieuwe bundel aanmaken →
          </button>
        </div>
        {showBundleDropdown && (
          <div className="absolute top-full left-6 z-10 mt-1 max-h-48 w-72 overflow-y-auto rounded-lg bg-card p-1 shadow-lg ring-1 ring-border">
            {filteredBundles.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Geen bundels gevonden</p>
            ) : (
              filteredBundles.map((b: Bundle) => {
                const alreadyAdded = editBundleIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    disabled={alreadyAdded}
                    onClick={() => onAddBundle(b.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left ${
                      alreadyAdded ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"
                    }`}
                  >
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted-foreground">{b.quality_code} · {b.dimension_name} · {b.colors.length} kl.</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd karpi-sample-management && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/components/compose/collections-tab.tsx
git commit -m "feat: add CollectionsTab with three-level nesting and inline edit"
```

---

### Task 6: Rewrite compose/page.tsx to use new components

**Files:**
- Modify: `src/app/management/compose/page.tsx` (full rewrite)

The page keeps all data loading and Supabase handlers, but delegates rendering to the tab components. Key changes:
- Add `loading` and `error` state per data type
- Wrap fetch calls with error handling
- Replace all tab JSX with `<ProductsTab>`, `<BundlesTab>`, `<CollectionsTab>`
- Add `onSave` handler wrappers that return `{ error?: string }`

- [ ] **Step 1: Rewrite the page component**

The page should keep:
- All existing `useCallback` data loading functions (add try/catch + loading/error state)
- All existing Supabase mutation logic (refactored into handler functions that return `{ error?: string }`)
- Tab selector UI
- Import and render the three tab components

State to add:
```tsx
const [loadingData, setLoadingData] = useState(true);
const [fetchError, setFetchError] = useState<string | null>(null);
```

Wrap initial load:
```tsx
useEffect(() => {
  async function loadAll() {
    setLoadingData(true);
    setFetchError(null);
    try {
      await Promise.all([loadQualities(), loadColorCodes(), loadDimensions(), loadBundles(), loadCollections()]);
    } catch (e: any) {
      setFetchError(e.message ?? "Fout bij laden van data");
    } finally {
      setLoadingData(false);
    }
  }
  loadAll();
}, []);
```

Bundle save handler — refactor from current `handleSaveBundle(e: React.FormEvent)` to accept a data object and return `{ error?: string }`:
```tsx
async function handleSaveBundle(data: {
  id: string | null;
  name: string;
  quality_id: string;
  dimension_id: string;
  color_ids: string[];
}): Promise<{ error?: string }> {
  if (data.id) {
    // UPDATE existing bundle
    const { error: updateError } = await supabase
      .from("bundles")
      .update({ name: data.name, quality_id: data.quality_id, dimension_id: data.dimension_id })
      .eq("id", data.id);
    if (updateError) return { error: updateError.message };

    // Replace colors: delete + re-insert with position
    await supabase.from("bundle_colors").delete().eq("bundle_id", data.id);
    const inserts = data.color_ids.map((colorId, i) => ({
      bundle_id: data.id!, color_code_id: colorId, position: i,
    }));
    const { error: colorError } = await supabase.from("bundle_colors").insert(inserts);
    if (colorError) return { error: colorError.message };
  } else {
    // CREATE new bundle
    const { data: newBundle, error: createError } = await supabase
      .from("bundles")
      .insert({ name: data.name, quality_id: data.quality_id, dimension_id: data.dimension_id })
      .select("id").single();
    if (createError || !newBundle) return { error: createError?.message ?? "Kon bundel niet aanmaken." };

    const inserts = data.color_ids.map((colorId, i) => ({
      bundle_id: newBundle.id, color_code_id: colorId, position: i,
    }));
    const { error: colorError } = await supabase.from("bundle_colors").insert(inserts);
    if (colorError) return { error: colorError.message };
  }

  loadBundles();
  return {};
}
```

Collection save handler — same pattern, refactored from `handleSaveCollection(e: React.FormEvent)`:
```tsx
async function handleSaveCollection(data: {
  id: string | null;
  name: string;
  description: string | null;
  bundle_ids: string[];
}): Promise<{ error?: string }> {
  if (data.id) {
    const { error: updateError } = await supabase
      .from("collections")
      .update({ name: data.name, description: data.description })
      .eq("id", data.id);
    if (updateError) return { error: updateError.message };

    await supabase.from("collection_bundles").delete().eq("collection_id", data.id);
    if (data.bundle_ids.length > 0) {
      const inserts = data.bundle_ids.map((bundleId) => ({
        collection_id: data.id!, bundle_id: bundleId,
      }));
      const { error: linkError } = await supabase.from("collection_bundles").insert(inserts);
      if (linkError) return { error: linkError.message };
    }
  } else {
    const { data: newColl, error: createError } = await supabase
      .from("collections")
      .insert({ name: data.name, description: data.description })
      .select("id").single();
    if (createError || !newColl) return { error: createError?.message ?? "Kon collectie niet aanmaken." };

    if (data.bundle_ids.length > 0) {
      const inserts = data.bundle_ids.map((bundleId) => ({
        collection_id: newColl.id, bundle_id: bundleId,
      }));
      const { error: linkError } = await supabase.from("collection_bundles").insert(inserts);
      if (linkError) return { error: linkError.message };
    }
  }

  loadCollections();
  return {};
}
```

Deactivate handlers stay the same but also reload:
```tsx
async function handleDeactivateBundle(bundleId: string) {
  await supabase.from("bundles").update({ active: false }).eq("id", bundleId);
  loadBundles();
  loadCollections();
}

async function handleDeactivateCollection(collectionId: string) {
  await supabase.from("collections").update({ active: false }).eq("id", collectionId);
  loadCollections();
}
```

Tab rendering:
```tsx
{activeTab === "products" && (
  <ProductsTab
    qualities={qualities}
    colorCodes={colorCodes}
    loading={loadingData}
    error={fetchError}
    onRetry={() => { loadQualities(); loadColorCodes(); }}
  />
)}
{activeTab === "bundles" && (
  <BundlesTab
    bundles={bundles}
    qualities={qualities}
    colorCodes={colorCodes}
    dimensions={dimensions}
    loading={loadingData}
    error={fetchError}
    onRetry={() => { loadBundles(); loadQualities(); loadColorCodes(); loadDimensions(); }}
    onSave={handleSaveBundle}
    onDeactivate={handleDeactivateBundle}
  />
)}
{activeTab === "collections" && (
  <CollectionsTab
    collections={collections}
    allBundles={bundles}
    loading={loadingData}
    error={fetchError}
    onRetry={() => { loadCollections(); loadBundles(); }}
    onSave={handleSaveCollection}
    onDeactivate={handleDeactivateCollection}
    onGoToBundlesTab={() => setActiveTab("bundles")}
  />
)}
```

Remove: all existing inline tab JSX (lines 483-748), all form state variables (lines 83-100, moved to child components), all form reset/toggle functions (lines 242-295, 357-384), the raw form JSX handlers.

Keep: data state (`qualities`, `colorCodes`, `dimensions`, `bundles`, `collections`), data loading callbacks (`loadQualities` etc.), tab selector UI, import statements for data types.

Add imports:
```tsx
import { ProductsTab } from "@/components/compose/products-tab";
import { BundlesTab } from "@/components/compose/bundles-tab";
import { CollectionsTab } from "@/components/compose/collections-tab";
```

- [ ] **Step 2: Verify it compiles**

Run: `cd karpi-sample-management && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Test in browser**

Run: `cd karpi-sample-management && npm run dev`

Verify:
- All three tabs render with table layout
- Products tab: expand quality to see colors
- Bundles tab: expand bundle to see colors, click edit, add new bundle
- Collections tab: expand collection to see bundles, expand bundle to see colors
- Inline edit, save, cancel all work
- Deactivate shows confirmation dialog

- [ ] **Step 4: Commit**

```bash
git add src/app/management/compose/page.tsx
git commit -m "feat: rewrite compose page to use expandable table components"
```

---

### Task 7: Visual polish and edge cases

**Files:**
- Modify: `src/components/compose/bundles-tab.tsx`, `src/components/compose/collections-tab.tsx`

- [ ] **Step 1: Test empty states**

Verify each tab handles zero items gracefully (empty table body with just the "add new" row).

- [ ] **Step 2: Add click-outside handler for dropdowns**

Both the color picker dropdown (BundlesTab `EditBundleRows`) and the bundle search dropdown (CollectionsTab `BundleEditList`) need to close when clicking outside. Add a `useEffect` with document click listener in each:

```tsx
// In any component with a dropdown:
import { useEffect, useRef } from "react";

const dropdownRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setShowDropdown(false);
    }
  }
  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, []);

// Wrap the dropdown container with ref={dropdownRef}
```

- [ ] **Step 3: Verify tab counts update after mutations**

After creating/deactivating a bundle or collection, the tab badge counts should update.

- [ ] **Step 4: Run production build**

Run: `cd karpi-sample-management && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish expandable tables - edge cases and visual refinements"
```
