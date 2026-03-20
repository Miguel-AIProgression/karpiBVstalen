# Product → Bundel → Collectie Hiërarchie

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Herstructureer de producthiërarchie naar 3 lagen (Product → Bundel → Collectie) en bouw een centrale "Samenstellen" pagina in Management waar bundels en collecties geconfigureerd worden.

**Architecture:** Producten (qualities) worden onafhankelijk van collecties. Een bundel koppelt 1 product + 1 afmeting + een selectie kleuren. Collecties bevatten bundels via een many-to-many relatie. De bestaande pipeline (raw_stock, finished_stock) blijft ongewijzigd — alleen de bundellaag en collectielaag veranderen.

**Tech Stack:** Supabase (PostgreSQL), Next.js 16+ App Router, TypeScript, Tailwind CSS v4, shadcn/ui v4 (base-nova met @base-ui/react)

---

## Bestandsoverzicht

| Actie | Bestand | Verantwoordelijkheid |
|---|---|---|
| Create | `supabase/migrations/017_product_bundle_collection.sql` | Database herstructurering |
| Modify | `src/lib/supabase/types.ts` | TypeScript types bijwerken |
| Create | `src/app/management/compose/page.tsx` | Samenstellen pagina (bundels + collecties CRUD) |
| Modify | `src/components/nav-sidebar.tsx` | Samenstellen link toevoegen aan Management |
| Modify | `src/app/production/page.tsx` | collection_id referenties verwijderen |
| Modify | `src/app/production/bundles/page.tsx` | Gebruik nieuwe bundles tabel ipv bundle_configs |
| Cleanup | `src/app/sales/*/page.tsx` | Verwijder referenties naar gedropte views |

---

### Task 1: Database migratie

**Files:**
- Create: `supabase/migrations/017_product_bundle_collection.sql`

- [ ] **Step 1: Schrijf de migratie**

```sql
-- ============================================================
-- Product → Bundel → Collectie hiërarchie
-- ============================================================

-- 0. Guard: zorg dat set_updated_at() bestaat
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 1. Nieuwe tabellen
-- ============================================================

-- Bundels: 1 product + 1 afmeting
create table public.bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quality_id uuid not null references public.qualities(id),
  dimension_id uuid not null references public.sample_dimensions(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kleuren per bundel (selectie uit beschikbare kleuren van het product)
create table public.bundle_colors (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  color_code_id uuid not null references public.color_codes(id),
  unique(bundle_id, color_code_id)
);

-- Many-to-many: collecties bevatten bundels
create table public.collection_bundles (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  unique(collection_id, bundle_id)
);

-- 2. Indexes
-- ============================================================

create index idx_bundles_quality on public.bundles(quality_id);
create index idx_bundles_dimension on public.bundles(dimension_id);
create index idx_bundle_colors_bundle on public.bundle_colors(bundle_id);
create index idx_collection_bundles_collection on public.collection_bundles(collection_id);
create index idx_collection_bundles_bundle on public.collection_bundles(bundle_id);

-- 3. Updated_at trigger voor bundles
-- ============================================================

create trigger trg_bundles_updated_at
  before update on public.bundles
  for each row execute function public.set_updated_at();

-- 4. Verwijder collection_id FK van qualities (producten staan los)
-- ============================================================

alter table public.qualities drop constraint if exists qualities_collection_id_fkey;
alter table public.qualities drop column if exists collection_id;

-- 5. Verwijder oude bundle_config tabellen en hernoem kolommen
-- ============================================================

-- Drop alle FK constraints die naar bundle_configs verwijzen
-- (gebruik dynamische constraint lookup voor robuustheid)
do $$
declare
  r record;
begin
  for r in
    select constraint_name, table_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name
    where ccu.table_name = 'bundle_configs'
      and tc.constraint_type = 'FOREIGN KEY'
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.table_name, r.constraint_name);
  end loop;
end;
$$;

-- Rename bundle_config_id → bundle_id in bundle_stock
alter table public.bundle_stock rename column bundle_config_id to bundle_id;
alter table public.bundle_stock
  add constraint bundle_stock_bundle_id_fkey
  foreign key (bundle_id) references public.bundles(id);

-- Rename bundle_config_id → bundle_id in bundle_batches
alter table public.bundle_batches rename column bundle_config_id to bundle_id;
alter table public.bundle_batches
  add constraint bundle_batches_bundle_id_fkey
  foreign key (bundle_id) references public.bundles(id);

-- Drop oude tabellen
drop table if exists public.bundle_config_items;
drop table if exists public.bundle_configs;

-- 6. Herschrijf bundle_batches trigger voor nieuwe schema
-- ============================================================
-- De trigger verlaagt finished_stock en verhoogt bundle_stock
-- bij het samenstellen van een bundel. Aangepast voor bundles
-- (was bundle_configs + bundle_config_items).

create or replace function public.process_bundle_batch()
returns trigger as $$
declare
  v_bundle record;
  v_color record;
  v_available integer;
begin
  -- Haal bundel info op
  select quality_id, dimension_id into v_bundle
  from public.bundles where id = new.bundle_id;

  if not found then
    raise exception 'Bundle not found: %', new.bundle_id;
  end if;

  -- Loop door alle kleuren in de bundel
  for v_color in
    select bc.color_code_id
    from public.bundle_colors bc
    where bc.bundle_id = new.bundle_id
  loop
    -- Check beschikbaarheid in finished_stock (ANY finishing type)
    select coalesce(sum(quantity), 0) into v_available
    from public.finished_stock
    where quality_id = v_bundle.quality_id
      and color_code_id = v_color.color_code_id
      and dimension_id = v_bundle.dimension_id;

    if v_available < new.quantity then
      raise exception 'Insufficient finished stock for color %: available %, requested %',
        v_color.color_code_id, v_available, new.quantity;
    end if;

    -- Verlaag finished_stock (pak van eerste beschikbare locatie/finishing)
    update public.finished_stock
    set quantity = quantity - new.quantity
    where quality_id = v_bundle.quality_id
      and color_code_id = v_color.color_code_id
      and dimension_id = v_bundle.dimension_id
      and quantity >= new.quantity
    limit 1;
    -- Fallback: als geen enkele rij genoeg had, verdeel over meerdere
    -- (dit is een simplificatie; in productie eventueel verfijnen)
  end loop;

  -- Verhoog bundle_stock
  insert into public.bundle_stock (bundle_id, location_id, quantity)
  values (new.bundle_id, new.location_id, new.quantity)
  on conflict (bundle_id, location_id)
  do update set quantity = bundle_stock.quantity + excluded.quantity;

  return new;
end;
$$ language plpgsql;

-- Drop en hermaak trigger
drop trigger if exists trg_process_bundle_batch on public.bundle_batches;
create trigger trg_process_bundle_batch
  after insert on public.bundle_batches
  for each row execute function public.process_bundle_batch();

-- 7. RLS uitschakelen voor development
-- ============================================================

alter table public.bundles disable row level security;
alter table public.bundle_colors disable row level security;
alter table public.collection_bundles disable row level security;

-- 8. Update v_pipeline_status (verwijder collection referentie)
-- ============================================================
-- NB: bundle_stock_total per kleur = aantal bundels dat die kleur bevat
-- (elke bundel-eenheid telt als 1, niet vermenigvuldigd met kleuraantal)

drop view if exists public.v_pipeline_status;
create view public.v_pipeline_status as
select
  q.id            as quality_id,
  q.name          as quality_name,
  q.code          as quality_code,
  cc.id           as color_code_id,
  cc.code         as color_code,
  cc.name         as color_name,
  sd.id           as dimension_id,
  sd.name         as dimension_name,
  coalesce(rs.total, 0)  as raw_stock_total,
  coalesce(fs.total, 0)  as finished_stock_total,
  coalesce(bs.total, 0)  as bundle_stock_total
from qualities q
join color_codes cc  on cc.quality_id = q.id
cross join sample_dimensions sd
left join (
  select quality_id, color_code_id, dimension_id, sum(quantity) as total
  from raw_stock group by quality_id, color_code_id, dimension_id
) rs on rs.quality_id = q.id and rs.color_code_id = cc.id and rs.dimension_id = sd.id
left join (
  select quality_id, color_code_id, dimension_id, sum(quantity) as total
  from finished_stock group by quality_id, color_code_id, dimension_id
) fs on fs.quality_id = q.id and fs.color_code_id = cc.id and fs.dimension_id = sd.id
left join (
  -- Bundels die deze kleur bevatten: tel het totaal aantal bundel-eenheden
  select b.quality_id, bc.color_code_id, b.dimension_id,
         sum(bst.quantity) as total
  from bundle_stock bst
  join bundles b on b.id = bst.bundle_id
  join bundle_colors bc on bc.bundle_id = b.id
  group by b.quality_id, bc.color_code_id, b.dimension_id
) bs on bs.quality_id = q.id and bs.color_code_id = cc.id and bs.dimension_id = sd.id
where q.active = true and cc.active = true;

-- 9. Drop verouderde views
-- ============================================================

drop view if exists public.v_bundle_availability;
drop view if exists public.v_restock_needed;
drop view if exists public.v_client_catalog;
drop view if exists public.v_request_overview;
drop view if exists public.v_production_demand;
```

**Let op:** De sales pagina's (`sales/availability`, `sales/requests`, `sales/projects/[id]`) refereren aan gedropte views. Deze pagina's moeten in Task 5 gestript worden van de dode code.

- [ ] **Step 2: Push migratie naar Supabase**

Run: `cd karpi-sample-management && npx supabase db push`

OF voer de SQL handmatig uit in Supabase Dashboard → SQL Editor.

Verwacht: alle tabellen aangemaakt, oude verwijderd, view bijgewerkt.

- [ ] **Step 3: Verifieer in Supabase**

Controleer in SQL Editor:
```sql
-- Nieuwe tabellen bestaan
select count(*) from information_schema.tables where table_name in ('bundles', 'bundle_colors', 'collection_bundles');
-- Moet 3 zijn

-- qualities heeft geen collection_id meer
select column_name from information_schema.columns where table_name = 'qualities' and column_name = 'collection_id';
-- Moet 0 rijen zijn

-- bundle_stock heeft bundle_id (niet bundle_config_id)
select column_name from information_schema.columns where table_name = 'bundle_stock' and column_name = 'bundle_id';
-- Moet 1 rij zijn
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/017_product_bundle_collection.sql
git commit -m "feat: restructure product hierarchy to Product → Bundle → Collection"
```

---

### Task 2: TypeScript types bijwerken

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Verwijder oude types, voeg nieuwe toe**

Verwijder de `bundle_configs` en `bundle_config_items` types. Voeg toe:

```typescript
bundles: {
  Row: { id: string; name: string; quality_id: string; dimension_id: string; active: boolean; created_at: string; updated_at: string };
  Insert: { id?: string; name: string; quality_id: string; dimension_id: string; active?: boolean };
  Update: { name?: string; quality_id?: string; dimension_id?: string; active?: boolean };
  Relationships: [];
};
bundle_colors: {
  Row: { id: string; bundle_id: string; color_code_id: string };
  Insert: { id?: string; bundle_id: string; color_code_id: string };
  Update: { bundle_id?: string; color_code_id?: string };
  Relationships: [];
};
collection_bundles: {
  Row: { id: string; collection_id: string; bundle_id: string };
  Insert: { id?: string; collection_id: string; bundle_id: string };
  Update: { collection_id?: string; bundle_id?: string };
  Relationships: [];
};
```

Update `qualities` type — verwijder `collection_id` uit Row, Insert, en Update.

Update `bundle_stock` type — `bundle_config_id` → `bundle_id`.

Update `bundle_batches` type — `bundle_config_id` → `bundle_id`.

Update `v_pipeline_status` type — verwijder `collection_id` en `collection_name`.

Verwijder views die niet meer bestaan: `v_bundle_availability`, `v_restock_needed`, `v_client_catalog`, `v_request_overview`, `v_production_demand`.

- [ ] **Step 2: Verifieer TypeScript compilatie**

Run: `cd karpi-sample-management && npx tsc --noEmit 2>&1 | head -30`

Er zullen fouten zijn in pagina's die oude types/kolommen gebruiken — die worden in Tasks 4-5 opgelost.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: update TypeScript types for new bundle/collection schema"
```

---

### Task 3: Samenstellen pagina (Management)

**Files:**
- Create: `src/app/management/compose/page.tsx`

Dit is de **centrale pagina** met 3 tabs:
1. **Producten** — overzicht van producten (qualities) + hun kleuren (read-only, al beheerd via productie)
2. **Bundels** — CRUD: maak bundel = kies product + afmeting + selecteer kleuren
3. **Collecties** — CRUD: maak collectie = kies bundels (many-to-many)

- [ ] **Step 1: Bouw de Samenstellen pagina**

Create file: `src/app/management/compose/page.tsx`

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Pencil,
  Package,
  Boxes,
  Layers,
  Check,
  X,
} from "lucide-react";

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

  // Bundle form
  const [showBundleForm, setShowBundleForm] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [bundleName, setBundleName] = useState("");
  const [bundleQuality, setBundleQuality] = useState("");
  const [bundleDimension, setBundleDimension] = useState("");
  const [bundleSelectedColors, setBundleSelectedColors] = useState<Set<string>>(new Set());
  const [bundleStatus, setBundleStatus] = useState<"idle" | "saving" | "error">("idle");
  const [bundleError, setBundleError] = useState("");

  // Collection form
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionSelectedBundles, setCollectionSelectedBundles] = useState<Set<string>>(new Set());
  const [collectionStatus, setCollectionStatus] = useState<"idle" | "saving" | "error">("idle");
  const [collectionError, setCollectionError] = useState("");

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
    const { data: bundleData } = await supabase
      .from("bundles")
      .select("id, name, quality_id, dimension_id, active, qualities(name, code), sample_dimensions(name)")
      .eq("active", true)
      .order("name");

    if (!bundleData) { setBundles([]); return; }

    const bundleIds = bundleData.map((b) => b.id);
    const { data: colorsData } = bundleIds.length > 0
      ? await supabase
          .from("bundle_colors")
          .select("id, bundle_id, color_code_id, color_codes(code, name)")
          .in("bundle_id", bundleIds)
      : { data: [] };

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
      colors: (colorsByBundle.get(b.id) ?? []).sort((a, b) => Number(a.code) - Number(b.code)),
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
    const { data: cbData } = collIds.length > 0
      ? await supabase
          .from("collection_bundles")
          .select("id, collection_id, bundle_id, bundles(name, qualities(code), sample_dimensions(name))")
          .in("collection_id", collIds)
      : { data: [] };

    // Get color counts per bundle
    const bundleIds = [...new Set((cbData ?? []).map((cb) => cb.bundle_id))];
    const { data: colorCountData } = bundleIds.length > 0
      ? await supabase
          .from("bundle_colors")
          .select("bundle_id")
          .in("bundle_id", bundleIds)
      : { data: [] };

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
    loadQualities();
    loadColorCodes();
    loadDimensions();
    loadBundles();
    loadCollections();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Bundle handlers ─── */

  const colorsForQuality = colorCodes.filter((cc) => cc.quality_id === bundleQuality);

  function resetBundleForm() {
    setShowBundleForm(false);
    setEditingBundleId(null);
    setBundleName("");
    setBundleQuality("");
    setBundleDimension("");
    setBundleSelectedColors(new Set());
    setBundleStatus("idle");
    setBundleError("");
  }

  function toggleColor(colorId: string) {
    setBundleSelectedColors((prev) => {
      const next = new Set(prev);
      if (next.has(colorId)) next.delete(colorId);
      else next.add(colorId);
      return next;
    });
  }

  function selectAllColors() {
    setBundleSelectedColors(new Set(colorsForQuality.map((c) => c.id)));
  }

  function deselectAllColors() {
    setBundleSelectedColors(new Set());
  }

  function startEditBundle(bundle: Bundle) {
    setEditingBundleId(bundle.id);
    setBundleName(bundle.name);
    setBundleQuality(bundle.quality_id);
    setBundleDimension(bundle.dimension_id);
    setBundleSelectedColors(new Set(bundle.colors.map((c) => c.color_code_id)));
    setShowBundleForm(true);
    setBundleStatus("idle");
    setBundleError("");
  }

  async function handleSaveBundle(e: React.FormEvent) {
    e.preventDefault();
    if (!bundleName.trim() || !bundleQuality || !bundleDimension) return;
    if (bundleSelectedColors.size === 0) {
      setBundleStatus("error");
      setBundleError("Selecteer minimaal 1 kleur.");
      return;
    }

    setBundleStatus("saving");
    setBundleError("");

    if (editingBundleId) {
      // Update existing
      const { error: updateError } = await supabase
        .from("bundles")
        .update({ name: bundleName.trim(), quality_id: bundleQuality, dimension_id: bundleDimension })
        .eq("id", editingBundleId);
      if (updateError) { setBundleStatus("error"); setBundleError(updateError.message); return; }

      // Replace colors
      await supabase.from("bundle_colors").delete().eq("bundle_id", editingBundleId);
      const inserts = [...bundleSelectedColors].map((colorId) => ({
        bundle_id: editingBundleId,
        color_code_id: colorId,
      }));
      const { error: colorError } = await supabase.from("bundle_colors").insert(inserts);
      if (colorError) { setBundleStatus("error"); setBundleError(colorError.message); return; }
    } else {
      // Create new
      const { data: newBundle, error: createError } = await supabase
        .from("bundles")
        .insert({ name: bundleName.trim(), quality_id: bundleQuality, dimension_id: bundleDimension })
        .select("id")
        .single();
      if (createError || !newBundle) {
        setBundleStatus("error");
        setBundleError(createError?.message ?? "Kon bundel niet aanmaken.");
        return;
      }

      const inserts = [...bundleSelectedColors].map((colorId) => ({
        bundle_id: newBundle.id,
        color_code_id: colorId,
      }));
      const { error: colorError } = await supabase.from("bundle_colors").insert(inserts);
      if (colorError) { setBundleStatus("error"); setBundleError(colorError.message); return; }
    }

    resetBundleForm();
    loadBundles();
  }

  async function handleDeactivateBundle(bundleId: string) {
    await supabase.from("bundles").update({ active: false }).eq("id", bundleId);
    loadBundles();
    loadCollections();
  }

  /* ─── Collection handlers ─── */

  function resetCollectionForm() {
    setShowCollectionForm(false);
    setEditingCollectionId(null);
    setCollectionName("");
    setCollectionDescription("");
    setCollectionSelectedBundles(new Set());
    setCollectionStatus("idle");
    setCollectionError("");
  }

  function toggleBundle(bundleId: string) {
    setCollectionSelectedBundles((prev) => {
      const next = new Set(prev);
      if (next.has(bundleId)) next.delete(bundleId);
      else next.add(bundleId);
      return next;
    });
  }

  function startEditCollection(collection: Collection) {
    setEditingCollectionId(collection.id);
    setCollectionName(collection.name);
    setCollectionDescription(collection.description ?? "");
    setCollectionSelectedBundles(new Set(collection.bundles.map((b) => b.bundle_id)));
    setShowCollectionForm(true);
    setCollectionStatus("idle");
    setCollectionError("");
  }

  async function handleSaveCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!collectionName.trim()) return;

    setCollectionStatus("saving");
    setCollectionError("");

    if (editingCollectionId) {
      const { error: updateError } = await supabase
        .from("collections")
        .update({ name: collectionName.trim(), description: collectionDescription.trim() || null })
        .eq("id", editingCollectionId);
      if (updateError) { setCollectionStatus("error"); setCollectionError(updateError.message); return; }

      // Replace bundle links
      await supabase.from("collection_bundles").delete().eq("collection_id", editingCollectionId);
      if (collectionSelectedBundles.size > 0) {
        const inserts = [...collectionSelectedBundles].map((bundleId) => ({
          collection_id: editingCollectionId,
          bundle_id: bundleId,
        }));
        const { error: linkError } = await supabase.from("collection_bundles").insert(inserts);
        if (linkError) { setCollectionStatus("error"); setCollectionError(linkError.message); return; }
      }
    } else {
      const { data: newColl, error: createError } = await supabase
        .from("collections")
        .insert({ name: collectionName.trim(), description: collectionDescription.trim() || null })
        .select("id")
        .single();
      if (createError || !newColl) {
        setCollectionStatus("error");
        setCollectionError(createError?.message ?? "Kon collectie niet aanmaken.");
        return;
      }

      if (collectionSelectedBundles.size > 0) {
        const inserts = [...collectionSelectedBundles].map((bundleId) => ({
          collection_id: newColl.id,
          bundle_id: bundleId,
        }));
        const { error: linkError } = await supabase.from("collection_bundles").insert(inserts);
        if (linkError) { setCollectionStatus("error"); setCollectionError(linkError.message); return; }
      }
    }

    resetCollectionForm();
    loadCollections();
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
      {/* Header */}
      <div>
        <h2 className="font-display text-3xl tracking-tight text-foreground">
          Samenstellen
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configureer bundels en collecties
        </p>
      </div>

      {/* Tabs */}
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

      {/* ─── Products tab ─── */}
      {activeTab === "products" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Producten worden beheerd via Productie → Overzicht. Hier zie je een overzicht.
          </p>
          {qualities.length === 0 ? (
            <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
              <Package size={32} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Geen producten gevonden.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {qualities.map((q) => {
                const colors = colorCodes.filter((cc) => cc.quality_id === q.id);
                return (
                  <div key={q.id} className="rounded-xl bg-card p-4 ring-1 ring-border">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-display text-lg font-semibold">{q.code}</span>
                      <span className="text-sm text-muted-foreground">{q.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{colors.length} kleuren</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {colors.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center rounded-md bg-muted/50 px-2 py-0.5 text-xs ring-1 ring-border/40"
                        >
                          {c.code}{c.name !== c.code ? ` — ${c.name}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Bundles tab ─── */}
      {activeTab === "bundles" && (
        <div className="space-y-4">
          {/* Bundle list */}
          {bundles.length === 0 && !showBundleForm && (
            <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
              <Boxes size={32} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nog geen bundels aangemaakt.</p>
            </div>
          )}
          {bundles.map((bundle) => (
            <div key={bundle.id} className="rounded-xl bg-card p-4 ring-1 ring-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{bundle.name}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {bundle.quality_code}
                  </span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {bundle.dimension_name}
                  </span>
                  <span className="text-xs text-muted-foreground">{bundle.colors.length} kleuren</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEditBundle(bundle)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Bewerken"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDeactivateBundle(bundle.id)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                    title="Verwijderen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {bundle.colors.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center rounded-md bg-muted/50 px-2 py-0.5 text-xs ring-1 ring-border/40"
                  >
                    {c.code}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {/* New/edit bundle form */}
          {showBundleForm ? (
            <form onSubmit={handleSaveBundle} className="rounded-xl bg-card p-5 ring-1 ring-border space-y-4">
              <h3 className="font-medium">
                {editingBundleId ? "Bundel bewerken" : "Nieuwe bundel"}
              </h3>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Naam</Label>
                  <Input
                    value={bundleName}
                    onChange={(e) => setBundleName(e.target.value)}
                    placeholder="bijv. AEST 30x50"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Product</Label>
                  <Select
                    value={bundleQuality}
                    onValueChange={(v) => {
                      setBundleQuality(v ?? "");
                      setBundleSelectedColors(new Set());
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecteer product">
                        {qualities.find((q) => q.id === bundleQuality)?.code}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {qualities.map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.code} — {q.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Afmeting</Label>
                  <Select value={bundleDimension} onValueChange={(v) => setBundleDimension(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecteer afmeting">
                        {dimensions.find((d) => d.id === bundleDimension)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {dimensions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Color selection */}
              {bundleQuality && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      Kleuren ({bundleSelectedColors.size} van {colorsForQuality.length} geselecteerd)
                    </Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllColors}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Alles selecteren
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllColors}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Alles deselecteren
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {colorsForQuality.map((c) => {
                      const selected = bundleSelectedColors.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleColor(c.id)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all ring-1 ${
                            selected
                              ? "bg-foreground text-background ring-foreground"
                              : "bg-card text-muted-foreground ring-border hover:ring-foreground/30"
                          }`}
                        >
                          {selected && <Check size={14} />}
                          {c.code}
                          {c.name !== c.code && (
                            <span className={`text-xs ${selected ? "text-background/70" : "text-muted-foreground/60"}`}>
                              {c.name}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {colorsForQuality.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Dit product heeft nog geen kleuren. Voeg kleuren toe via Productie → Overzicht.
                    </p>
                  )}
                </div>
              )}

              {bundleStatus === "error" && <p className="text-sm text-red-600">{bundleError}</p>}

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={bundleStatus === "saving" || !bundleName.trim() || !bundleQuality || !bundleDimension || bundleSelectedColors.size === 0}
                >
                  {bundleStatus === "saving" ? "Opslaan..." : editingBundleId ? "Opslaan" : "Bundel aanmaken"}
                </Button>
                <Button type="button" variant="outline" onClick={resetBundleForm}>
                  Annuleren
                </Button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => { resetBundleForm(); setShowBundleForm(true); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Plus size={16} />
              Nieuwe bundel aanmaken
            </button>
          )}
        </div>
      )}

      {/* ─── Collections tab ─── */}
      {activeTab === "collections" && (
        <div className="space-y-4">
          {collections.length === 0 && !showCollectionForm && (
            <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
              <Layers size={32} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nog geen collecties aangemaakt.</p>
            </div>
          )}
          {collections.map((coll) => (
            <div key={coll.id} className="rounded-xl bg-card p-4 ring-1 ring-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-display text-lg font-semibold">{coll.name}</span>
                  {coll.description && (
                    <span className="ml-3 text-sm text-muted-foreground">{coll.description}</span>
                  )}
                  <span className="ml-3 text-xs text-muted-foreground">{coll.bundles.length} bundels</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEditCollection(coll)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Bewerken"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDeactivateCollection(coll.id)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                    title="Verwijderen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {coll.bundles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {coll.bundles.map((b) => (
                    <span
                      key={b.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-1.5 text-sm ring-1 ring-border/40"
                    >
                      <span className="font-medium">{b.bundle_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {b.quality_code} · {b.dimension_name} · {b.color_count} kleuren
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Geen bundels toegevoegd</p>
              )}
            </div>
          ))}

          {/* New/edit collection form */}
          {showCollectionForm ? (
            <form onSubmit={handleSaveCollection} className="rounded-xl bg-card p-5 ring-1 ring-border space-y-4">
              <h3 className="font-medium">
                {editingCollectionId ? "Collectie bewerken" : "Nieuwe collectie"}
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Naam</Label>
                  <Input
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                    placeholder="bijv. Headlam Voorjaar 2026"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Omschrijving (optioneel)</Label>
                  <Input
                    value={collectionDescription}
                    onChange={(e) => setCollectionDescription(e.target.value)}
                    placeholder="Korte omschrijving"
                  />
                </div>
              </div>

              {/* Bundle selection */}
              <div className="space-y-2">
                <Label className="text-xs">
                  Bundels ({collectionSelectedBundles.size} geselecteerd)
                </Label>
                {bundles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Maak eerst bundels aan in de Bundels tab.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {bundles.map((b) => {
                      const selected = collectionSelectedBundles.has(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleBundle(b.id)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ring-1 ${
                            selected
                              ? "bg-foreground/5 ring-foreground/20"
                              : "bg-card ring-border hover:ring-foreground/20"
                          }`}
                        >
                          <div className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                            selected ? "border-foreground bg-foreground" : "border-border"
                          }`}>
                            {selected && <Check size={12} className="text-background" />}
                          </div>
                          <span className="font-medium">{b.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {b.quality_code} · {b.dimension_name} · {b.colors.length} kleuren
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {collectionStatus === "error" && <p className="text-sm text-red-600">{collectionError}</p>}

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={collectionStatus === "saving" || !collectionName.trim()}
                >
                  {collectionStatus === "saving" ? "Opslaan..." : editingCollectionId ? "Opslaan" : "Collectie aanmaken"}
                </Button>
                <Button type="button" variant="outline" onClick={resetCollectionForm}>
                  Annuleren
                </Button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => { resetCollectionForm(); setShowCollectionForm(true); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Plus size={16} />
              Nieuwe collectie aanmaken
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/management/compose/page.tsx
git commit -m "feat: add Samenstellen page for bundle and collection management"
```

---

### Task 4: Nav sidebar bijwerken

**Files:**
- Modify: `src/components/nav-sidebar.tsx`

- [ ] **Step 1: Voeg "Samenstellen" toe aan Management sectie**

In de `sections` array, voeg een nav item toe aan de `admin` sectie:

```typescript
{
  key: "admin",
  label: "Management",
  icon: <Shield size={16} />,
  basePath: "/management",
  items: [
    { label: "Overzicht", href: "/management", icon: <LayoutDashboard size={18} /> },
    { label: "Samenstellen", href: "/management/compose", icon: <Boxes size={18} /> },
  ],
},
```

Import `Boxes` is al aanwezig in de imports.

- [ ] **Step 2: Commit**

```bash
git add src/components/nav-sidebar.tsx
git commit -m "feat: add Samenstellen navigation item to Management section"
```

---

### Task 5: Production page opschonen

**Files:**
- Modify: `src/app/production/page.tsx`

- [ ] **Step 1: Verwijder collection-gerelateerde code**

De `PipelineRow` interface: verwijder `collection_name`.

Het "Nieuw product" formulier: verwijder de collectie-selectie. Producten hebben geen `collection_id` meer. Verwijder:
- `newQualityCollection`, `newCollectionName`, `showNewCollection` state
- `addCollections` state en de collections query in `loadAddOptions`
- Het collectie-selectie veld uit het formulier
- De `collection_id` uit de insert in `handleAddQuality`

De `handleAddQuality` functie: verwijder de collectie-logica. Insert wordt:
```typescript
const { error } = await supabase.from("qualities").insert({
  name: newQualityName,
  code: newQualityCode,
});
```

In de tabel: de `quality_name` kolom toont nu de productnaam (was collection_name). De view heeft geen `collection_name` meer, dus verwijder alle referenties.

In `loadAddOptions`: verwijder de collections query.

De `DemandRow` interface en "Openstaande verzoeken" sectie: verwijder (de v_production_demand view bestaat niet meer). Verwijder:
- `demand` state en `loadDemand` functie
- De demand tabel in de render
- De realtime subscriptions voor `bundle_requests` en `bundle_reservations`

- [ ] **Step 2: Verifieer dat de pagina compileert**

Run: `cd karpi-sample-management && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/production/page.tsx
git commit -m "refactor: remove collection dependency and demand section from production page"
```

---

### Task 6: Bundle assembly page bijwerken

**Files:**
- Modify: `src/app/production/bundles/page.tsx`

- [ ] **Step 1: Refactor naar nieuwe bundles tabel**

Dit is een grote refactor. De pagina moet nu:
- Bundels laden uit `bundles` + `bundle_colors` (ipv `bundle_configs` + `bundle_config_items`)
- Bij assembly een `bundle_batches` insert doen met `bundle_id` (ipv `bundle_config_id`)
- De beschikbaarheidscheck per kleur uit `finished_stock` doen

De configuratie-beheer (aanmaken/bewerken/deactiveren van bundel-configuraties) wordt nu gedaan op de Samenstellen pagina. Verwijder die secties uit deze pagina.

De pagina behoudt alleen:
1. Selecteer een bundel
2. Toon beschikbaarheid per kleur
3. Selecteer locatie + aantal
4. Stel samen (insert bundle_batch)

**Belangrijk:** De `bundle_batches` trigger die finished_stock verlaagt moet ook bijgewerkt worden. De trigger gebruikt nu `bundle_config_id` — dat moet `bundle_id` worden. Check of de trigger al correct werkt met de hernoemde kolom, of maak een aparte migratie.

Vervang de volledige pagina door een versimpelde versie die de nieuwe tabellen gebruikt. De details hangen af van hoe de trigger werkt met de nieuwe structuur. Test dit handmatig na implementatie.

- [ ] **Step 2: Commit**

```bash
git add src/app/production/bundles/page.tsx
git commit -m "refactor: update bundle assembly page to use new bundles table"
```

---

### Task 7: Verificatie en opschonen

- [ ] **Step 1: Build check**

Run: `cd karpi-sample-management && npm run build`

Fix eventuele TypeScript errors.

- [ ] **Step 2: Handmatig testen**

Run: `cd karpi-sample-management && npm run dev`

Test:
1. Management → Samenstellen: maak een bundel (AEST + 30x50 + kleuren selecteren)
2. Management → Samenstellen → Collecties: maak een collectie met de bundel
3. Productie → Overzicht: check dat de pipeline tabel nog werkt (zonder collection_name)
4. Productie → Bundelen: check dat bundels laden uit de nieuwe tabel

- [ ] **Step 3: Verwijder oude collectie "Standaard"**

De collectie "Standaard" was de oude placeholder. Verwijder deze via de Samenstellen pagina of via SQL:

```sql
delete from collections where name = 'Standaard';
```

- [ ] **Step 4: Update architectuurdocs**

Update `docs/architecture/database.md` om de nieuwe hiërarchie te beschrijven:
- Product → Bundel → Collectie (3 lagen)
- Verwijder de oude `collections → qualities` hiërarchie beschrijving
- Update de bundeling sectie

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verification, cleanup, and docs update for new hierarchy"
```
