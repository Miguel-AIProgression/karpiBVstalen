"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  X,
  GripVertical,
  Package,
  AlertCircle,
} from "lucide-react";
import { DeactivateDialog } from "@/components/compose/deactivate-dialog";

/* ─── Types ──────────────────────────────────────────── */

interface ColorCode {
  id: string;
  code: string;
  name: string;
  hex_color: string | null;
  quality_id: string;
}

interface BundleColor {
  id: string;
  color_code_id: string;
  position: number;
  color_codes: ColorCode | null;
}

interface Quality {
  id: string;
  name: string;
  code: string;
}

interface Dimension {
  id: string;
  name: string;
}

interface BundleData {
  id: string;
  name: string;
  quality_id: string;
  dimension_id: string;
  active: boolean;
  qualities: Quality | null;
  sample_dimensions: Dimension | null;
  bundle_colors: BundleColor[];
  collection_bundles?: CollectionBundleRef[];
}

interface CollectionBundleRef {
  collection_id: string;
  collections: { name: string } | null;
}

interface CollectionBundleData {
  id: string;
  collection_id: string;
  bundle_id: string;
  position: number;
  bundles: BundleData | null;
}

interface CollectionData {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  collection_bundles: CollectionBundleData[];
}

/* ─── Component ──────────────────────────────────────── */

export default function CollectiesBundelsPage() {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"collecties" | "bundels">("collecties");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [bundles, setBundles] = useState<BundleData[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [colorCodes, setColorCodes] = useState<ColorCode[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Expand
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  /* ─── Data loading ─── */

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        { data: collData, error: collErr },
        { data: bundleData, error: bundleErr },
        { data: qualsData },
        { data: dimsData },
        { data: colorsData },
      ] = await Promise.all([
        supabase
          .from("collections")
          .select("*, collection_bundles(*, bundles(*, qualities(*), sample_dimensions(*), bundle_colors(*, color_codes(*))))")
          .eq("active", true)
          .order("name"),
        supabase
          .from("bundles")
          .select("*, qualities(*), sample_dimensions(*), bundle_colors(*, color_codes(*)), collection_bundles(collection_id, collections(name))")
          .eq("active", true)
          .order("name"),
        supabase.from("qualities").select("id, name, code").eq("active", true).order("name"),
        supabase.from("sample_dimensions").select("id, name").order("name"),
        supabase.from("color_codes").select("id, code, name, hex_color, quality_id").eq("active", true).order("code"),
      ]);

      if (collErr) throw collErr;
      if (bundleErr) throw bundleErr;

      // Sort collection_bundles by position
      const sortedCollections = ((collData as CollectionData[]) ?? []).map((c) => ({
        ...c,
        collection_bundles: [...(c.collection_bundles ?? [])].sort((a, b) => a.position - b.position),
      }));

      setCollections(sortedCollections);
      setBundles((bundleData as BundleData[]) ?? []);
      setQualities((qualsData as Quality[]) ?? []);
      setDimensions((dimsData as Dimension[]) ?? []);
      setColorCodes((colorsData as ColorCode[]) ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Er ging iets mis bij het laden van de data.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleExpand(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-3xl tracking-tight text-foreground">
          Collecties &amp; Bundels
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Beheer collecties en bundels voor het samenstellen van orders
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1 w-fit">
        <button
          onClick={() => { setActiveTab("collecties"); setSearchQuery(""); setExpandedItems(new Set()); }}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "collecties"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Collecties
        </button>
        <button
          onClick={() => { setActiveTab("bundels"); setSearchQuery(""); setExpandedItems(new Set()); }}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "bundels"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Bundels
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <AlertCircle size={32} className="mx-auto mb-3 text-red-500/50" />
          <p className="text-sm text-red-600 mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={loadData}>
            Opnieuw proberen
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && activeTab === "collecties" && (
        <CollectiesTab
          collections={collections}
          bundles={bundles}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          expandedItems={expandedItems}
          toggleExpand={toggleExpand}
          supabase={supabase}
          onReload={loadData}
        />
      )}

      {!loading && !error && activeTab === "bundels" && (
        <BundelsTab
          bundles={bundles}
          qualities={qualities}
          dimensions={dimensions}
          colorCodes={colorCodes}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          expandedItems={expandedItems}
          toggleExpand={toggleExpand}
          supabase={supabase}
          onReload={loadData}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   COLLECTIES TAB
   ═══════════════════════════════════════════════════════ */

function CollectiesTab({
  collections,
  bundles,
  searchQuery,
  setSearchQuery,
  expandedItems,
  toggleExpand,
  supabase,
  onReload,
}: {
  collections: CollectionData[];
  bundles: BundleData[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  expandedItems: Set<string>;
  toggleExpand: (id: string) => void;
  supabase: ReturnType<typeof createClient>;
  onReload: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Add bundle to collection
  const [addingBundleToCollection, setAddingBundleToCollection] = useState<string | null>(null);
  const [bundleSearchQuery, setBundleSearchQuery] = useState("");
  const [showBundleDropdown, setShowBundleDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowBundleDropdown(false);
      }
    }
    if (showBundleDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showBundleDropdown]);

  const filtered = collections.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q);
  });

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("collections").insert({ name: newName.trim() });
    setSaving(false);
    if (error) {
      alert("Fout bij aanmaken: " + error.message);
      return;
    }
    setNewName("");
    setShowNewForm(false);
    onReload();
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("collections").update({ name: editName.trim() }).eq("id", id);
    setSaving(false);
    if (error) {
      alert("Fout bij opslaan: " + error.message);
      return;
    }
    setEditingId(null);
    onReload();
  }

  async function handleDeactivate(id: string) {
    await supabase.from("collections").update({ active: false }).eq("id", id);
    onReload();
  }

  async function handleMoveBundleInCollection(
    collection: CollectionData,
    cbIndex: number,
    direction: "up" | "down"
  ) {
    const cbs = collection.collection_bundles;
    const swapIndex = direction === "up" ? cbIndex - 1 : cbIndex + 1;
    if (swapIndex < 0 || swapIndex >= cbs.length) return;

    const cb1 = cbs[cbIndex];
    const cb2 = cbs[swapIndex];

    await Promise.all([
      supabase.from("collection_bundles").update({ position: cb2.position }).eq("id", cb1.id),
      supabase.from("collection_bundles").update({ position: cb1.position }).eq("id", cb2.id),
    ]);
    onReload();
  }

  async function handleRemoveBundleFromCollection(cbId: string) {
    await supabase.from("collection_bundles").delete().eq("id", cbId);
    onReload();
  }

  async function handleAddBundleToCollection(collectionId: string, bundleId: string) {
    // Find max position
    const coll = collections.find((c) => c.id === collectionId);
    const maxPos = coll?.collection_bundles.reduce((max, cb) => Math.max(max, cb.position), 0) ?? 0;

    await supabase.from("collection_bundles").insert({
      collection_id: collectionId,
      bundle_id: bundleId,
      position: maxPos + 1,
    });
    setAddingBundleToCollection(null);
    setBundleSearchQuery("");
    setShowBundleDropdown(false);
    onReload();
  }

  return (
    <>
      {/* Search + New button */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek collectie..."
            className="pl-8"
          />
        </div>
        <Button onClick={() => setShowNewForm(true)} disabled={showNewForm}>
          <Plus size={14} /> Nieuwe collectie
        </Button>
      </div>

      {/* New collection inline form */}
      {showNewForm && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50/50 p-3 ring-1 ring-amber-200/50">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Collectienaam"
            className="h-8 w-64"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowNewForm(false); }}
          />
          <Button size="sm" className="h-8" disabled={saving || !newName.trim()} onClick={handleCreate}>
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => { setShowNewForm(false); setNewName(""); }}>
            Annuleer
          </Button>
        </div>
      )}

      {/* Collections list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <Package size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {collections.length === 0
              ? "Nog geen collecties aangemaakt."
              : "Geen collecties gevonden voor deze zoekopdracht."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((coll) => {
            const expanded = expandedItems.has(coll.id);
            const isEditing = editingId === coll.id;
            const bundleCount = coll.collection_bundles.length;

            return (
              <div key={coll.id} className="rounded-xl bg-card ring-1 ring-border overflow-hidden">
                {/* Collection header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => { if (!isEditing) toggleExpand(coll.id); }}
                >
                  <span className="text-muted-foreground">
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>

                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 w-64"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(coll.id); if (e.key === "Escape") setEditingId(null); }}
                      />
                      <Button size="sm" className="h-7 text-xs" disabled={saving || !editName.trim()} onClick={() => handleSaveEdit(coll.id)}>
                        Opslaan
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                        Annuleer
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="font-semibold text-foreground flex-1">{coll.name}</span>
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                        {bundleCount} bundel{bundleCount !== 1 ? "s" : ""}
                      </span>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditingId(coll.id); setEditName(coll.name); }}
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                          Bewerken
                        </button>
                        <DeactivateDialog itemType="Collectie" itemName={coll.name} onConfirm={() => handleDeactivate(coll.id)} />
                      </div>
                    </>
                  )}
                </div>

                {/* Expanded: bundles list */}
                {expanded && (
                  <div className="border-t border-border">
                    {coll.collection_bundles.length === 0 ? (
                      <div className="px-8 py-4 text-sm text-muted-foreground italic">
                        Geen bundels in deze collectie
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {coll.collection_bundles.map((cb, idx) => {
                          const bundle = cb.bundles;
                          if (!bundle) return null;

                          const qualityCode = bundle.qualities?.code ?? "?";
                          const dimensionName = bundle.sample_dimensions?.name ?? "?";
                          const colorCount = bundle.bundle_colors?.length ?? 0;

                          return (
                            <div key={cb.id} className="flex items-center gap-3 px-8 py-2.5 hover:bg-muted/20 transition-colors">
                              <span className="text-xs text-muted-foreground/60 w-5 text-right shrink-0">{cb.position}.</span>
                              <GripVertical size={14} className="text-muted-foreground/30 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-sm">{bundle.name}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {qualityCode} &middot; {dimensionName} &middot; {colorCount} kleur{colorCount !== 1 ? "en" : ""}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleMoveBundleInCollection(coll, idx, "up")}
                                  disabled={idx === 0}
                                  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20"
                                  title="Omhoog"
                                >
                                  <ChevronUp size={14} />
                                </button>
                                <button
                                  onClick={() => handleMoveBundleInCollection(coll, idx, "down")}
                                  disabled={idx === coll.collection_bundles.length - 1}
                                  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20"
                                  title="Omlaag"
                                >
                                  <ChevronDown size={14} />
                                </button>
                                <button
                                  onClick={() => handleRemoveBundleFromCollection(cb.id)}
                                  className="rounded p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                  title="Verwijderen uit collectie"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add bundle button */}
                    {addingBundleToCollection === coll.id ? (
                      <div className="px-8 py-3 border-t border-dashed border-border" onClick={(e) => e.stopPropagation()}>
                        <div className="relative" ref={dropdownRef}>
                          <div className="flex items-center gap-2">
                            <Search size={14} className="text-muted-foreground" />
                            <Input
                              value={bundleSearchQuery}
                              onChange={(e) => { setBundleSearchQuery(e.target.value); setShowBundleDropdown(true); }}
                              onFocus={() => setShowBundleDropdown(true)}
                              placeholder="Zoek bundel om toe te voegen..."
                              className="h-7 w-64 text-xs"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => { setAddingBundleToCollection(null); setBundleSearchQuery(""); }}
                            >
                              Annuleer
                            </Button>
                          </div>
                          {showBundleDropdown && (
                            <div className="absolute top-full left-6 z-10 mt-1 max-h-48 w-80 overflow-y-auto rounded-lg bg-card p-1 shadow-lg ring-1 ring-border">
                              {(() => {
                                const existingBundleIds = new Set(coll.collection_bundles.map((cb) => cb.bundle_id));
                                const bq = bundleSearchQuery.toLowerCase();
                                const filtered = bundles.filter((b) => {
                                  if (existingBundleIds.has(b.id)) return false;
                                  if (!bq) return true;
                                  return b.name.toLowerCase().includes(bq) || (b.qualities?.code ?? "").toLowerCase().includes(bq);
                                });
                                if (filtered.length === 0) {
                                  return <p className="px-2 py-1.5 text-xs text-muted-foreground">Geen bundels gevonden</p>;
                                }
                                return filtered.map((b) => (
                                  <button
                                    key={b.id}
                                    onClick={() => handleAddBundleToCollection(coll.id, b.id)}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left hover:bg-muted"
                                  >
                                    <span className="font-medium">{b.name}</span>
                                    <span className="text-muted-foreground">
                                      {b.qualities?.code} &middot; {b.sample_dimensions?.name} &middot; {b.bundle_colors?.length ?? 0} kl.
                                    </span>
                                  </button>
                                ));
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAddingBundleToCollection(coll.id); }}
                        className="flex w-full items-center gap-2 px-8 py-3 border-t border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
                      >
                        <Plus size={14} /> Bundel toevoegen aan collectie
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   BUNDELS TAB
   ═══════════════════════════════════════════════════════ */

function BundelsTab({
  bundles,
  qualities,
  dimensions,
  colorCodes,
  searchQuery,
  setSearchQuery,
  expandedItems,
  toggleExpand,
  supabase,
  onReload,
}: {
  bundles: BundleData[];
  qualities: Quality[];
  dimensions: Dimension[];
  colorCodes: ColorCode[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  expandedItems: Set<string>;
  toggleExpand: (id: string) => void;
  supabase: ReturnType<typeof createClient>;
  onReload: () => void;
}) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // New/edit bundle fields
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuality, setEditQuality] = useState("");
  const [editDimension, setEditDimension] = useState("");
  const [editColors, setEditColors] = useState<string[]>([]);

  // Color picker
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

  const filtered = bundles.filter((b) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      (b.qualities?.code ?? "").toLowerCase().includes(q) ||
      (b.qualities?.name ?? "").toLowerCase().includes(q)
    );
  });

  const editColorsForQuality = colorCodes.filter((cc) => cc.quality_id === editQuality);
  const availableColors = editColorsForQuality.filter((cc) => !editColors.includes(cc.id));

  function startEdit(bundle: BundleData) {
    setEditingId(bundle.id);
    setEditName(bundle.name);
    setEditQuality(bundle.quality_id);
    setEditDimension(bundle.dimension_id);
    setEditColors(
      [...(bundle.bundle_colors ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((bc) => bc.color_code_id)
    );
    setShowNewForm(false);
  }

  function startNew() {
    setShowNewForm(true);
    setEditingId("new");
    setEditName("");
    setEditQuality("");
    setEditDimension("");
    setEditColors([]);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowNewForm(false);
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

  async function handleSave() {
    if (!editName.trim() || !editQuality || !editDimension || editColors.length === 0) return;
    setSaving(true);

    const isNew = editingId === "new";

    if (isNew) {
      const { data: newBundle, error: insertErr } = await supabase
        .from("bundles")
        .insert({ name: editName.trim(), quality_id: editQuality, dimension_id: editDimension })
        .select("id")
        .single();

      if (insertErr || !newBundle) {
        alert("Fout bij aanmaken: " + (insertErr?.message ?? "Onbekende fout"));
        setSaving(false);
        return;
      }

      const colorInserts = editColors.map((colorId, idx) => ({
        bundle_id: newBundle.id,
        color_code_id: colorId,
        position: idx + 1,
      }));

      if (colorInserts.length > 0) {
        await supabase.from("bundle_colors").insert(colorInserts);
      }
    } else {
      // Update bundle
      await supabase
        .from("bundles")
        .update({ name: editName.trim(), quality_id: editQuality, dimension_id: editDimension })
        .eq("id", editingId!);

      // Replace colors: delete all then re-insert
      await supabase.from("bundle_colors").delete().eq("bundle_id", editingId!);

      const colorInserts = editColors.map((colorId, idx) => ({
        bundle_id: editingId!,
        color_code_id: colorId,
        position: idx + 1,
      }));

      if (colorInserts.length > 0) {
        await supabase.from("bundle_colors").insert(colorInserts);
      }
    }

    setSaving(false);
    cancelEdit();
    onReload();
  }

  async function handleDeactivate(id: string) {
    await supabase.from("bundles").update({ active: false }).eq("id", id);
    onReload();
  }

  return (
    <>
      {/* Search + New button */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek bundel..."
            className="pl-8"
          />
        </div>
        <Button onClick={startNew} disabled={showNewForm}>
          <Plus size={14} /> Nieuwe bundel
        </Button>
      </div>

      {/* New bundle form */}
      {showNewForm && editingId === "new" && (
        <BundleEditForm
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
          onSave={handleSave}
          onCancel={cancelEdit}
          onRemoveColor={(id) => setEditColors((prev) => prev.filter((c) => c !== id))}
          onAddColor={(id) => setEditColors((prev) => [...prev, id])}
          onMoveColor={moveColor}
          showColorPicker={showColorPicker}
          setShowColorPicker={setShowColorPicker}
          colorPickerRef={colorPickerRef}
          isNew
        />
      )}

      {/* Bundles list */}
      {filtered.length === 0 && !showNewForm ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <Package size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {bundles.length === 0
              ? "Nog geen bundels aangemaakt."
              : "Geen bundels gevonden voor deze zoekopdracht."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((bundle) => {
            const expanded = expandedItems.has(bundle.id);
            const isEditing = editingId === bundle.id && editingId !== "new";
            const qualityCode = bundle.qualities?.code ?? "?";
            const dimensionName = bundle.sample_dimensions?.name ?? "?";
            const colorCount = bundle.bundle_colors?.length ?? 0;

            // Count collections this bundle is in
            const collectionCount = bundle.collection_bundles?.length ?? 0;
            const collectionNames = (bundle.collection_bundles ?? [])
              .map((cb) => cb.collections?.name)
              .filter(Boolean);

            if (isEditing) {
              return (
                <BundleEditForm
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
                  onSave={handleSave}
                  onCancel={cancelEdit}
                  onRemoveColor={(id) => setEditColors((prev) => prev.filter((c) => c !== id))}
                  onAddColor={(id) => setEditColors((prev) => [...prev, id])}
                  onMoveColor={moveColor}
                  showColorPicker={showColorPicker}
                  setShowColorPicker={setShowColorPicker}
                  colorPickerRef={colorPickerRef}
                  isNew={false}
                />
              );
            }

            return (
              <div key={bundle.id} className="rounded-xl bg-card ring-1 ring-border overflow-hidden">
                {/* Bundle header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(bundle.id)}
                >
                  <span className="text-muted-foreground">
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <span className="font-semibold text-foreground">{bundle.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {qualityCode} &middot; {dimensionName} &middot; {colorCount} kleur{colorCount !== 1 ? "en" : ""}
                  </span>
                  {collectionCount > 0 && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      In {collectionCount} collectie{collectionCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => startEdit(bundle)}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      Bewerken
                    </button>
                    <DeactivateDialog itemType="Bundel" itemName={bundle.name} onConfirm={() => handleDeactivate(bundle.id)} />
                  </div>
                </div>

                {/* Expanded: colors + collections */}
                {expanded && (
                  <div className="border-t border-border px-8 py-3 space-y-3">
                    {/* Color pills */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Kleuren ({colorCount})
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {[...(bundle.bundle_colors ?? [])]
                          .sort((a, b) => a.position - b.position)
                          .map((bc, i) => {
                            const cc = bc.color_codes;
                            return (
                              <span
                                key={bc.id}
                                className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1 text-xs ring-1 ring-border/40"
                              >
                                {cc?.hex_color && (
                                  <span
                                    className="inline-block h-3 w-3 rounded-sm shrink-0 ring-1 ring-border/30"
                                    style={{ backgroundColor: cc.hex_color }}
                                  />
                                )}
                                <span className="text-muted-foreground/60">{i + 1}.</span>
                                {cc?.code ?? "?"}
                                {cc && cc.name !== cc.code && (
                                  <span className="text-muted-foreground"> &mdash; {cc.name}</span>
                                )}
                              </span>
                            );
                          })}
                      </div>
                    </div>

                    {/* Collections using this bundle */}
                    {collectionNames.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                          Gebruikt in collecties
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {collectionNames.map((name, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs text-blue-800 ring-1 ring-blue-200/50"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   BUNDLE EDIT FORM (shared between new + edit)
   ═══════════════════════════════════════════════════════ */

function BundleEditForm({
  editName,
  setEditName,
  editQuality,
  setEditQuality,
  editDimension,
  setEditDimension,
  editColors,
  qualities,
  dimensions,
  editColorsForQuality,
  availableColors,
  colorCodes,
  saving,
  onSave,
  onCancel,
  onRemoveColor,
  onAddColor,
  onMoveColor,
  showColorPicker,
  setShowColorPicker,
  colorPickerRef,
  isNew,
}: {
  editName: string;
  setEditName: (v: string) => void;
  editQuality: string;
  setEditQuality: (v: string) => void;
  editDimension: string;
  setEditDimension: (v: string) => void;
  editColors: string[];
  qualities: Quality[];
  dimensions: Dimension[];
  editColorsForQuality: ColorCode[];
  availableColors: ColorCode[];
  colorCodes: ColorCode[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onRemoveColor: (id: string) => void;
  onAddColor: (id: string) => void;
  onMoveColor: (index: number, direction: "up" | "down") => void;
  showColorPicker: boolean;
  setShowColorPicker: (v: boolean) => void;
  colorPickerRef: React.RefObject<HTMLDivElement | null>;
  isNew: boolean;
}) {
  return (
    <div className="rounded-xl bg-amber-50/50 ring-1 ring-amber-200/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="Bundelnaam"
          className="h-8 w-48"
          autoFocus
        />
        <Select value={editQuality} onValueChange={(v) => setEditQuality(v ?? "")}>
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="Kwaliteit">{qualities.find((q) => q.id === editQuality)?.code ?? "Kwaliteit"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {qualities.map((q) => (
              <SelectItem key={q.id} value={q.id}>{q.code} &mdash; {q.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={editDimension} onValueChange={(v) => setEditDimension(v ?? "")}>
          <SelectTrigger className="h-8 w-28">
            <SelectValue placeholder="Maat">{dimensions.find((d) => d.id === editDimension)?.name ?? "Maat"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {dimensions.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={saving || !editName.trim() || !editQuality || !editDimension || editColors.length === 0}
            onClick={onSave}
          >
            {saving ? "Opslaan..." : isNew ? "Aanmaken" : "Opslaan"}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>
            Annuleer
          </Button>
        </div>
      </div>

      {/* Colors */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {editColors.map((colorId, i) => {
          const color = editColorsForQuality.find((c) => c.id === colorId) ??
            colorCodes.find((c) => c.id === colorId);
          return (
            <span
              key={colorId}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs ring-1 ring-border/60"
            >
              {color?.hex_color && (
                <span
                  className="inline-block h-3 w-3 rounded-sm shrink-0 ring-1 ring-border/30"
                  style={{ backgroundColor: color.hex_color }}
                />
              )}
              <span className="text-muted-foreground/60">{i + 1}.</span>
              {color?.code ?? "?"}
              <button
                onClick={() => onMoveColor(i, "up")}
                disabled={i === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onClick={() => onMoveColor(i, "down")}
                disabled={i === editColors.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20"
              >
                <ChevronRight size={12} />
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
                    {c.hex_color && (
                      <span
                        className="inline-block h-3 w-3 rounded-sm shrink-0 ring-1 ring-border/30"
                        style={{ backgroundColor: c.hex_color }}
                      />
                    )}
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

        {!editQuality && (
          <p className="text-xs text-muted-foreground italic">Selecteer eerst een kwaliteit om kleuren toe te voegen.</p>
        )}
      </div>
    </div>
  );
}
