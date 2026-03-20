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
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Collectienaam" className="h-8 w-48" />
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Omschrijving (optioneel)" className="h-8 w-56" />
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
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Collectienaam" className="h-8 w-48" />
            <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Omschrijving (optioneel)" className="h-8 w-56" />
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
            onChange={(e) => { setBundleSearch(e.target.value); setShowBundleDropdown(true); }}
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
