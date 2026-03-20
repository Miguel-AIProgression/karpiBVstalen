"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Package, Boxes, Layers } from "lucide-react";
import { ProductsTab } from "@/components/compose/products-tab";
import { BundlesTab } from "@/components/compose/bundles-tab";
import { CollectionsTab } from "@/components/compose/collections-tab";

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

interface Collection {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  bundles: { id: string; bundle_id: string; bundle_name: string; quality_code: string; dimension_name: string; color_count: number }[];
}

type Tab = "products" | "bundles" | "collections";

/* ─── Component ──────────────────────────────────────── */

export default function ComposePage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<Tab>("bundles");

  // Data
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [colorCodes, setColorCodes] = useState<ColorCode[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

  // Loading / error
  const [loadingData, setLoadingData] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  /* ─── Data loading ─── */

  const loadQualities = useCallback(async () => {
    const { data } = await supabase
      .from("qualities")
      .select("id, name, code")
      .eq("active", true)
      .order("code");
    setQualities(data ?? []);
  }, [supabase]);

  const loadColorCodes = useCallback(async () => {
    const { data } = await supabase
      .from("color_codes")
      .select("id, code, name, quality_id")
      .eq("active", true)
      .order("code");
    setColorCodes(data ?? []);
  }, [supabase]);

  const loadDimensions = useCallback(async () => {
    const { data } = await supabase
      .from("sample_dimensions")
      .select("id, name")
      .order("name");
    setDimensions(data ?? []);
  }, [supabase]);

  const loadBundles = useCallback(async () => {
    const { data } = await supabase
      .from("bundles")
      .select("id, name, quality_id, dimension_id, active, qualities(name, code), sample_dimensions(name)")
      .eq("active", true)
      .order("name");
    const bundleData = data as any[] | null;

    if (!bundleData) { setBundles([]); return; }

    const bundleIds = bundleData.map((b: any) => b.id);
    const { data: rawColors } = bundleIds.length > 0
      ? await supabase
          .from("bundle_colors")
          .select("id, bundle_id, color_code_id, position, color_codes(code, name)")
          .in("bundle_id", bundleIds)
          .order("position")
      : { data: [] };
    const colorsData = rawColors as any[] | null;

    const colorsByBundle = new Map<string, Bundle["colors"]>();
    for (const c of colorsData ?? []) {
      if (!colorsByBundle.has(c.bundle_id)) colorsByBundle.set(c.bundle_id, []);
      colorsByBundle.get(c.bundle_id)!.push({
        id: c.id,
        color_code_id: c.color_code_id,
        code: (c.color_codes as { code: string; name: string } | null)?.code ?? "?",
        name: (c.color_codes as { code: string; name: string } | null)?.name ?? "?",
      });
    }

    setBundles(bundleData.map((b) => ({
      id: b.id,
      name: b.name,
      quality_id: b.quality_id,
      quality_name: (b.qualities as { name: string; code: string } | null)?.name ?? "?",
      quality_code: (b.qualities as { name: string; code: string } | null)?.code ?? "?",
      dimension_id: b.dimension_id,
      dimension_name: (b.sample_dimensions as { name: string } | null)?.name ?? "?",
      colors: colorsByBundle.get(b.id) ?? [],
      active: b.active,
    })));
  }, [supabase]);

  const loadCollections = useCallback(async () => {
    const { data: collData } = await supabase
      .from("collections")
      .select("id, name, description, active")
      .eq("active", true)
      .order("name");

    if (!collData) { setCollections([]); return; }

    const collIds = collData.map((c) => c.id);
    const { data: rawCb } = collIds.length > 0
      ? await supabase
          .from("collection_bundles")
          .select("id, collection_id, bundle_id, bundles(name, qualities(code), sample_dimensions(name))")
          .in("collection_id", collIds)
      : { data: [] };
    const cbData = rawCb as any[] | null;

    const bundleIds = [...new Set((cbData ?? []).map((cb: any) => cb.bundle_id))];
    const { data: rawColorCount } = bundleIds.length > 0
      ? await supabase
          .from("bundle_colors")
          .select("bundle_id")
          .in("bundle_id", bundleIds)
      : { data: [] };
    const colorCountData = rawColorCount as any[] | null;

    const colorCountMap = new Map<string, number>();
    for (const cc of colorCountData ?? []) {
      colorCountMap.set(cc.bundle_id, (colorCountMap.get(cc.bundle_id) ?? 0) + 1);
    }

    const bundlesByCollection = new Map<string, Collection["bundles"]>();
    for (const cb of cbData ?? []) {
      if (!bundlesByCollection.has(cb.collection_id)) bundlesByCollection.set(cb.collection_id, []);
      const b = cb.bundles as { name: string; qualities: { code: string } | null; sample_dimensions: { name: string } | null } | null;
      bundlesByCollection.get(cb.collection_id)!.push({
        id: cb.id,
        bundle_id: cb.bundle_id,
        bundle_name: b?.name ?? "?",
        quality_code: b?.qualities?.code ?? "?",
        dimension_name: b?.sample_dimensions?.name ?? "?",
        color_count: colorCountMap.get(cb.bundle_id) ?? 0,
      });
    }

    setCollections(collData.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      active: c.active,
      bundles: bundlesByCollection.get(c.id) ?? [],
    })));
  }, [supabase]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Bundle handlers ─── */

  async function handleSaveBundle(data: {
    id: string | null;
    name: string;
    quality_id: string;
    dimension_id: string;
    color_ids: string[];
  }): Promise<{ error?: string }> {
    if (data.id) {
      const { error: updateError } = await supabase
        .from("bundles")
        .update({ name: data.name, quality_id: data.quality_id, dimension_id: data.dimension_id })
        .eq("id", data.id);
      if (updateError) return { error: updateError.message };

      await supabase.from("bundle_colors").delete().eq("bundle_id", data.id);
      const inserts = data.color_ids.map((colorId, i) => ({
        bundle_id: data.id!, color_code_id: colorId, position: i,
      }));
      const { error: colorError } = await supabase.from("bundle_colors").insert(inserts);
      if (colorError) return { error: colorError.message };
    } else {
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

  async function handleDeactivateBundle(bundleId: string) {
    await supabase.from("bundles").update({ active: false }).eq("id", bundleId);
    loadBundles();
    loadCollections();
  }

  /* ─── Collection handlers ─── */

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

  async function handleDeactivateCollection(collectionId: string) {
    await supabase.from("collections").update({ active: false }).eq("id", collectionId);
    loadCollections();
  }

  /* ─── Tab definitions ─── */

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "products", label: "Producten", icon: <Package size={16} /> },
    { key: "bundles", label: "Bundels", icon: <Boxes size={16} /> },
    { key: "collections", label: "Collecties", icon: <Layers size={16} /> },
  ];

  /* ─── UI ─── */

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl tracking-tight text-foreground">
          Samenstellen
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configureer bundels en collecties
        </p>
      </div>

      <div className="flex gap-1 rounded-xl bg-muted/50 p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className={`text-xs ${activeTab === tab.key ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
              {tab.key === "products" ? qualities.length
                : tab.key === "bundles" ? bundles.length
                : collections.length}
            </span>
          </button>
        ))}
      </div>

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
    </div>
  );
}
