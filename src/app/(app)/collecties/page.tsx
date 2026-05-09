"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  GripVertical,
  Package,
  AlertCircle,
  Check,
} from "lucide-react";
import { DeactivateDialog } from "@/components/compose/deactivate-dialog";

/* ─── Types ──────────────────────────────────────────── */

interface SampleInfo {
  id: string;
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  quality_name: string;
  quality_code: string;
  color_name: string;
  color_code: string;
  hex_color: string | null;
  dimension_name: string;
}

interface BundleItem {
  id: string;
  sample_id: string;
  position: number;
  samples: {
    id: string;
    quality_id: string;
    color_code_id: string;
    dimension_id: string;
    qualities: { name: string; code: string } | null;
    color_codes: { name: string; code: string; hex_color: string | null } | null;
    sample_dimensions: { name: string } | null;
  } | null;
}

interface BundleData {
  id: string;
  name: string;
  quality_id: string | null;
  dimension_id: string | null;
  active: boolean;
  price_cents: number | null;
  bundle_items: BundleItem[];
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
  price_cents: number | null;
  sample_price_cents: number | null;
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
  const [allSamples, setAllSamples] = useState<SampleInfo[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Expand
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  /* ─── Data loading ─── */

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bundleSelect = "*, bundle_items(*, samples(*, qualities(name, code), color_codes(name, code, hex_color), sample_dimensions(name))), collection_bundles(collection_id, collections(name))";

      const [
        { data: collData, error: collErr },
        { data: bundleData, error: bundleErr },
        { data: samplesData },
      ] = await Promise.all([
        supabase
          .from("collections")
          .select(`*, collection_bundles(*, bundles(${bundleSelect}))`)
          .eq("active", true)
          .order("name"),
        supabase
          .from("bundles")
          .select(bundleSelect)
          .eq("active", true)
          .order("name"),
        supabase
          .from("samples")
          .select("id, quality_id, color_code_id, dimension_id, qualities(name, code), color_codes(name, code, hex_color), sample_dimensions(name)")
          .eq("active", true),
      ]);

      if (collErr) throw collErr;
      if (bundleErr) throw bundleErr;

      // Sort collection_bundles by position
      const sortedCollections = ((collData as CollectionData[]) ?? []).map((c) => ({
        ...c,
        collection_bundles: [...(c.collection_bundles ?? [])].sort((a, b) => a.position - b.position),
      }));

      // Sort bundle_items by position
      const sortedBundles = ((bundleData as BundleData[]) ?? []).map((b) => ({
        ...b,
        bundle_items: [...(b.bundle_items ?? [])].sort((a, b2) => a.position - b2.position),
      }));

      // Map samples for the picker
      const mappedSamples: SampleInfo[] = (samplesData ?? []).map((s: any) => ({
        id: s.id,
        quality_id: s.quality_id,
        color_code_id: s.color_code_id,
        dimension_id: s.dimension_id,
        quality_name: s.qualities?.name ?? "",
        quality_code: s.qualities?.code ?? "",
        color_name: s.color_codes?.name ?? "",
        color_code: s.color_codes?.code ?? "",
        hex_color: s.color_codes?.hex_color ?? null,
        dimension_name: s.sample_dimensions?.name ?? "",
      }));

      setCollections(sortedCollections);
      setBundles(sortedBundles);
      setAllSamples(mappedSamples);
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
          allSamples={allSamples}
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

  // Price editing
  const [editPriceInput, setEditPriceInput] = useState("");
  const [editPriceCollectionId, setEditPriceCollectionId] = useState<string | null>(null);
  const [editPriceType, setEditPriceType] = useState<"collection" | "sample">("collection");

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

  async function handleSaveCollectionPrice(collectionId: string) {
    const cents = Math.round(parseFloat(editPriceInput || "0") * 100);
    const field = editPriceType === "sample" ? "sample_price_cents" : "price_cents";
    await supabase.from("collections").update({
      [field]: cents > 0 ? cents : null,
    }).eq("id", collectionId);
    setEditPriceCollectionId(null);
    setEditPriceInput("");
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

  function getBundleSummary(bundle: BundleData): string {
    const items = bundle.bundle_items ?? [];
    if (items.length === 0) return "Geen stalen";
    const names = items
      .slice(0, 4)
      .map((bi) => {
        const s = bi.samples;
        if (!s) return "?";
        return `${s.qualities?.code ?? "?"} ${s.color_codes?.code ?? "?"}`;
      });
    const suffix = items.length > 4 ? ` +${items.length - 4}` : "";
    return names.join(", ") + suffix;
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
                      <span className="font-semibold text-foreground flex-1">
                        {coll.name}
                        {" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          {[
                            coll.price_cents != null && coll.price_cents > 0 ? `Collectie: €${(coll.price_cents / 100).toFixed(2)}` : null,
                            coll.sample_price_cents != null && coll.sample_price_cents > 0 ? `Sample: €${(coll.sample_price_cents / 100).toFixed(2)}` : null,
                          ].filter(Boolean).join(" · ") || "Geen prijs"}
                        </span>
                      </span>
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
                    {/* Price editing */}
                    <div className="px-8 py-2.5 flex items-center gap-4 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      {editPriceCollectionId === coll.id ? (
                        <>
                          <label className="text-xs text-muted-foreground shrink-0">
                            {editPriceType === "sample" ? "Sampleprijs (€)" : "Collectieprijs (€)"}
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editPriceInput}
                            onChange={(e) => setEditPriceInput(e.target.value)}
                            placeholder="0.00"
                            className="w-24 text-sm h-8"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveCollectionPrice(coll.id); if (e.key === "Escape") { setEditPriceCollectionId(null); setEditPriceInput(""); } }}
                          />
                          <Button size="sm" variant="outline" className="h-7" onClick={() => handleSaveCollectionPrice(coll.id)}>
                            <Check size={14} />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditPriceCollectionId(null); setEditPriceInput(""); }}>
                            Annuleer
                          </Button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditPriceInput(coll.price_cents != null ? (coll.price_cents / 100).toFixed(2) : "");
                              setEditPriceType("collection");
                              setEditPriceCollectionId(coll.id);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                          >
                            {coll.price_cents != null && coll.price_cents > 0
                              ? `Collectieprijs: €${(coll.price_cents / 100).toFixed(2)} — bewerken`
                              : "Collectieprijs instellen"}
                          </button>
                          <span className="text-xs text-muted-foreground/40">|</span>
                          <button
                            onClick={() => {
                              setEditPriceInput(coll.sample_price_cents != null ? (coll.sample_price_cents / 100).toFixed(2) : "");
                              setEditPriceType("sample");
                              setEditPriceCollectionId(coll.id);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                          >
                            {coll.sample_price_cents != null && coll.sample_price_cents > 0
                              ? `Sampleprijs: €${(coll.sample_price_cents / 100).toFixed(2)} — bewerken`
                              : "Sampleprijs instellen"}
                          </button>
                        </>
                      )}
                    </div>

                    {coll.collection_bundles.length === 0 ? (
                      <div className="px-8 py-4 text-sm text-muted-foreground italic">
                        Geen bundels in deze collectie
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {coll.collection_bundles.map((cb, idx) => {
                          const bundle = cb.bundles;
                          if (!bundle) return null;

                          const summary = getBundleSummary(bundle);
                          const itemCount = bundle.bundle_items?.length ?? 0;

                          return (
                            <div key={cb.id} className="flex items-center gap-3 px-8 py-2.5 hover:bg-muted/20 transition-colors">
                              <span className="text-xs text-muted-foreground/60 w-5 text-right shrink-0">{cb.position}.</span>
                              <GripVertical size={14} className="text-muted-foreground/30 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-sm">{bundle.name}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {summary} &middot; {itemCount} staal{itemCount !== 1 ? "" : ""}
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
                                  return b.name.toLowerCase().includes(bq) || getBundleSummary(b).toLowerCase().includes(bq);
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
                                      {getBundleSummary(b)}
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
  allSamples,
  searchQuery,
  setSearchQuery,
  expandedItems,
  toggleExpand,
  supabase,
  onReload,
}: {
  bundles: BundleData[];
  allSamples: SampleInfo[];
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
  const [editSampleIds, setEditSampleIds] = useState<string[]>([]);

  // Bundle price editing
  const [editPriceBundleId, setEditPriceBundleId] = useState<string | null>(null);
  const [editBundlePriceInput, setEditBundlePriceInput] = useState("");

  const filtered = bundles.filter((b) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (b.name.toLowerCase().includes(q)) return true;
    // Search in bundle items
    for (const bi of b.bundle_items ?? []) {
      const s = bi.samples;
      if (!s) continue;
      if ((s.qualities?.code ?? "").toLowerCase().includes(q)) return true;
      if ((s.qualities?.name ?? "").toLowerCase().includes(q)) return true;
      if ((s.color_codes?.code ?? "").toLowerCase().includes(q)) return true;
    }
    return false;
  });

  function startEdit(bundle: BundleData) {
    setEditingId(bundle.id);
    setEditName(bundle.name);
    setEditSampleIds(
      [...(bundle.bundle_items ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((bi) => bi.sample_id)
    );
    setShowNewForm(false);
  }

  function startNew() {
    setShowNewForm(true);
    setEditingId("new");
    setEditName("");
    setEditSampleIds([]);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowNewForm(false);
  }

  function moveSample(index: number, direction: "up" | "down") {
    setEditSampleIds((prev) => {
      const next = [...prev];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  }

  async function handleSave() {
    if (!editName.trim() || editSampleIds.length === 0) return;
    setSaving(true);

    const isNew = editingId === "new";

    if (isNew) {
      const { data: newBundle, error: insertErr } = await supabase
        .from("bundles")
        .insert({ name: editName.trim() })
        .select("id")
        .single();

      if (insertErr || !newBundle) {
        alert("Fout bij aanmaken: " + (insertErr?.message ?? "Onbekende fout"));
        setSaving(false);
        return;
      }

      const itemInserts = editSampleIds.map((sampleId, idx) => ({
        bundle_id: newBundle.id,
        sample_id: sampleId,
        position: idx + 1,
      }));

      if (itemInserts.length > 0) {
        await supabase.from("bundle_items").insert(itemInserts);
      }
    } else {
      // Update bundle name
      await supabase
        .from("bundles")
        .update({ name: editName.trim() })
        .eq("id", editingId!);

      // Replace bundle_items: delete all then re-insert
      await supabase.from("bundle_items").delete().eq("bundle_id", editingId!);

      const itemInserts = editSampleIds.map((sampleId, idx) => ({
        bundle_id: editingId!,
        sample_id: sampleId,
        position: idx + 1,
      }));

      if (itemInserts.length > 0) {
        await supabase.from("bundle_items").insert(itemInserts);
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

  async function handleSaveBundlePrice(bundleId: string) {
    const cents = Math.round(parseFloat(editBundlePriceInput || "0") * 100);
    await supabase.from("bundles").update({
      price_cents: cents > 0 ? cents : null,
    }).eq("id", bundleId);
    setEditPriceBundleId(null);
    setEditBundlePriceInput("");
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
          editSampleIds={editSampleIds}
          setEditSampleIds={setEditSampleIds}
          allSamples={allSamples}
          saving={saving}
          onSave={handleSave}
          onCancel={cancelEdit}
          onMoveSample={moveSample}
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
            const itemCount = bundle.bundle_items?.length ?? 0;

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
                  editSampleIds={editSampleIds}
                  setEditSampleIds={setEditSampleIds}
                  allSamples={allSamples}
                  saving={saving}
                  onSave={handleSave}
                  onCancel={cancelEdit}
                  onMoveSample={moveSample}
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
                    {itemCount} staal{itemCount !== 1 ? "" : ""}
                    {bundle.price_cents != null && bundle.price_cents > 0 && (
                      <> &middot; €{(bundle.price_cents / 100).toFixed(2)}</>
                    )}
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

                {/* Expanded: samples + collections */}
                {expanded && (
                  <div className="border-t border-border px-8 py-3 space-y-3">
                    {/* Sample pills */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Stalen ({itemCount})
                      </h4>
                      {itemCount === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Geen stalen in deze bundel</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {[...(bundle.bundle_items ?? [])]
                            .sort((a, b) => a.position - b.position)
                            .map((bi, i) => {
                              const s = bi.samples;
                              return (
                                <span
                                  key={bi.id}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1 text-xs ring-1 ring-border/40"
                                >
                                  {s?.color_codes?.hex_color && (
                                    <span
                                      className="inline-block h-3 w-3 rounded-sm shrink-0 ring-1 ring-border/30"
                                      style={{ backgroundColor: s.color_codes.hex_color }}
                                    />
                                  )}
                                  <span className="text-muted-foreground/60">{i + 1}.</span>
                                  <span className="font-medium">{s?.qualities?.code ?? "?"}</span>
                                  {s?.color_codes?.code ?? "?"}
                                  {s?.sample_dimensions?.name && (
                                    <span className="text-muted-foreground"> &mdash; {s.sample_dimensions.name}</span>
                                  )}
                                </span>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* Bundle price */}
                    <div className="flex items-center gap-2">
                      {editPriceBundleId === bundle.id ? (
                        <>
                          <label className="text-xs text-muted-foreground shrink-0">Bundelprijs (€)</label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editBundlePriceInput}
                            onChange={(e) => setEditBundlePriceInput(e.target.value)}
                            placeholder="0.00"
                            className="w-24 text-sm h-8"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveBundlePrice(bundle.id); if (e.key === "Escape") { setEditPriceBundleId(null); setEditBundlePriceInput(""); } }}
                          />
                          <Button size="sm" variant="outline" className="h-7" onClick={() => handleSaveBundlePrice(bundle.id)}>
                            <Check size={14} />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditPriceBundleId(null); setEditBundlePriceInput(""); }}>
                            Annuleer
                          </Button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setEditBundlePriceInput(bundle.price_cents != null ? (bundle.price_cents / 100).toFixed(2) : "");
                            setEditPriceBundleId(bundle.id);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                          {bundle.price_cents != null && bundle.price_cents > 0
                            ? `Bundelprijs: €${(bundle.price_cents / 100).toFixed(2)} — bewerken`
                            : "Bundelprijs instellen"}
                        </button>
                      )}
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
   Now uses sample picker instead of quality + colors
   ═══════════════════════════════════════════════════════ */

function BundleEditForm({
  editName,
  setEditName,
  editSampleIds,
  setEditSampleIds,
  allSamples,
  saving,
  onSave,
  onCancel,
  onMoveSample,
  isNew,
}: {
  editName: string;
  setEditName: (v: string) => void;
  editSampleIds: string[];
  setEditSampleIds: React.Dispatch<React.SetStateAction<string[]>>;
  allSamples: SampleInfo[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onMoveSample: (index: number, direction: "up" | "down") => void;
  isNew: boolean;
}) {
  const [sampleSearch, setSampleSearch] = useState("");
  const [showSamplePicker, setShowSamplePicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowSamplePicker(false);
      }
    }
    if (showSamplePicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSamplePicker]);

  // Available samples (not already selected)
  const selectedSet = new Set(editSampleIds);
  const sq = sampleSearch.toLowerCase();
  const availableSamples = allSamples.filter((s) => {
    if (selectedSet.has(s.id)) return false;
    if (!sq) return true;
    return (
      s.quality_name.toLowerCase().includes(sq) ||
      s.quality_code.toLowerCase().includes(sq) ||
      s.color_name.toLowerCase().includes(sq) ||
      s.color_code.toLowerCase().includes(sq) ||
      s.dimension_name.toLowerCase().includes(sq) ||
      `${s.quality_code} ${s.color_code}`.toLowerCase().includes(sq)
    );
  });

  // Group available samples by quality for nicer display
  const groupedSamples = new Map<string, SampleInfo[]>();
  for (const s of availableSamples) {
    const key = s.quality_code;
    if (!groupedSamples.has(key)) groupedSamples.set(key, []);
    groupedSamples.get(key)!.push(s);
  }

  return (
    <div className="rounded-xl bg-amber-50/50 ring-1 ring-amber-200/50 p-4 space-y-3">
      {/* Name + save/cancel */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="Bundelnaam"
          className="h-8 w-48"
          autoFocus
        />
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={saving || !editName.trim() || editSampleIds.length === 0}
            onClick={onSave}
          >
            {saving ? "Opslaan..." : isNew ? "Aanmaken" : "Opslaan"}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>
            Annuleer
          </Button>
        </div>
      </div>

      {/* Selected samples */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {editSampleIds.map((sampleId, i) => {
          const sample = allSamples.find((s) => s.id === sampleId);
          return (
            <span
              key={sampleId}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs ring-1 ring-border/60"
            >
              {sample?.hex_color && (
                <span
                  className="inline-block h-3 w-3 rounded-sm shrink-0 ring-1 ring-border/30"
                  style={{ backgroundColor: sample.hex_color }}
                />
              )}
              <span className="text-muted-foreground/60">{i + 1}.</span>
              <span className="font-medium">{sample?.quality_code ?? "?"}</span>
              {sample?.color_code ?? "?"}
              {sample?.dimension_name && (
                <span className="text-muted-foreground/60 text-[10px]"> {sample.dimension_name}</span>
              )}
              <button
                onClick={() => onMoveSample(i, "up")}
                disabled={i === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20"
              >
                <ChevronUp size={12} />
              </button>
              <button
                onClick={() => onMoveSample(i, "down")}
                disabled={i === editSampleIds.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20"
              >
                <ChevronDown size={12} />
              </button>
              <button
                onClick={() => setEditSampleIds((prev) => prev.filter((id) => id !== sampleId))}
                className="text-muted-foreground hover:text-red-600"
              >
                <X size={12} />
              </button>
            </span>
          );
        })}

        {/* Add sample button + picker */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setShowSamplePicker(!showSamplePicker)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
          >
            <Plus size={12} /> Staal toevoegen
          </button>
          {showSamplePicker && (
            <div className="absolute top-full left-0 z-10 mt-1 w-80 rounded-lg bg-card shadow-lg ring-1 ring-border">
              <div className="p-2 border-b border-border">
                <Input
                  value={sampleSearch}
                  onChange={(e) => setSampleSearch(e.target.value)}
                  placeholder="Zoek op kwaliteit of kleur..."
                  className="h-7 text-xs"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {availableSamples.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground text-center">
                    Geen stalen gevonden
                  </p>
                ) : (
                  Array.from(groupedSamples.entries()).map(([qualityCode, samples]) => (
                    <div key={qualityCode}>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        {qualityCode}
                      </div>
                      {samples.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setEditSampleIds((prev) => [...prev, s.id]);
                            // Keep picker open for quick multi-select
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted text-left"
                        >
                          {s.hex_color && (
                            <span
                              className="inline-block h-3 w-3 rounded-sm shrink-0 ring-1 ring-border/30"
                              style={{ backgroundColor: s.hex_color }}
                            />
                          )}
                          <span className="font-medium">{s.quality_code}</span>
                          <span className="font-mono">{s.color_code}</span>
                          <span className="text-muted-foreground">{s.color_name !== s.color_code ? s.color_name : ""}</span>
                          <span className="text-muted-foreground/60 ml-auto">{s.dimension_name}</span>
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {editSampleIds.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Voeg stalen toe aan deze bundel.</p>
        )}
      </div>
    </div>
  );
}
