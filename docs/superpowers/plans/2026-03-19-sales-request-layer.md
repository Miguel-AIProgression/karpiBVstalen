# Sales Request Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project/request/reservation layer so sales can submit bundle requests per client project, see availability, and production sees aggregated demand.

**Architecture:** Three new DB tables (projects, bundle_requests, bundle_reservations) with triggers for auto-reservation and over-commit protection. Two new views for sales and production. Three new frontend pages under /sales/projects. Production dashboard extended with demand section.

**Tech Stack:** PostgreSQL (Supabase), Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui v4 (base-nova)

**Spec:** `docs/superpowers/specs/2026-03-19-sales-request-layer-design.md`

---

## File Structure

### Database (SQL migrations applied via Supabase dashboard)
- `supabase/migrations/013_sales_request_layer.sql` — tables, triggers, indexes, views, RLS
- `supabase/migrations/014_seed_request_layer.sql` — updated seed data with projects & requests

### Frontend (new files)
- `src/app/sales/projects/page.tsx` — projects overview
- `src/app/sales/projects/[id]/page.tsx` — project detail + requests
- `src/app/sales/requests/page.tsx` — all open requests cross-project
- `src/components/client-selector.tsx` — reusable client dropdown

### Frontend (modified files)
- `src/components/nav-sidebar.tsx` — add Projecten + Verzoeken nav items
- `src/app/production/page.tsx` — add demand section
- `src/lib/supabase/types.ts` — add new table/view types

---

## Task 1: Database migration — tables, triggers, indexes

**Files:**
- Create: `supabase/migrations/013_sales_request_layer.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/013_sales_request_layer.sql` with:

```sql
-- ============================================================
-- Sales Request Layer: tables, triggers, indexes, views, RLS
-- ============================================================

-- 1. Tables
-- ============================================================

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bundle_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  bundle_config_id uuid not null references public.bundle_configs(id),
  quantity integer not null check (quantity > 0),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bundle_reservations (
  id uuid primary key default gen_random_uuid(),
  bundle_request_id uuid not null references public.bundle_requests(id),
  quantity integer not null check (quantity > 0),
  reserved_at timestamptz not null default now()
);

-- 2. Indexes
-- ============================================================

create index idx_bundle_reservations_request on public.bundle_reservations(bundle_request_id);
create index idx_bundle_requests_config_status on public.bundle_requests(bundle_config_id, status);
create index idx_bundle_requests_project on public.bundle_requests(project_id);

-- 3. Updated_at triggers
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger trg_bundle_requests_updated_at
  before update on public.bundle_requests
  for each row execute function public.set_updated_at();

-- 4. Over-reservation protection trigger
-- ============================================================

create or replace function public.check_reservation_limit()
returns trigger as $$
declare
  v_request_qty integer;
  v_existing_reserved integer;
begin
  -- Lock the request row to prevent race conditions
  select quantity into v_request_qty
  from public.bundle_requests
  where id = new.bundle_request_id
  for update;

  if not found then
    raise exception 'Bundle request not found: %', new.bundle_request_id;
  end if;

  select coalesce(sum(quantity), 0) into v_existing_reserved
  from public.bundle_reservations
  where bundle_request_id = new.bundle_request_id;

  if v_existing_reserved + new.quantity > v_request_qty then
    raise exception 'Over-reservation: existing (%) + new (%) > requested (%)',
      v_existing_reserved, new.quantity, v_request_qty;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_check_reservation_limit
  before insert on public.bundle_reservations
  for each row execute function public.check_reservation_limit();

-- 5. Auto-status trigger (pending → ready when fully reserved)
-- ============================================================

create or replace function public.update_request_status_on_reservation()
returns trigger as $$
declare
  v_request_qty integer;
  v_total_reserved integer;
begin
  select br.quantity into v_request_qty
  from public.bundle_requests br
  where br.id = new.bundle_request_id;

  select coalesce(sum(quantity), 0) into v_total_reserved
  from public.bundle_reservations
  where bundle_request_id = new.bundle_request_id;

  if v_total_reserved >= v_request_qty then
    update public.bundle_requests
    set status = 'ready'
    where id = new.bundle_request_id
      and status = 'pending';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_update_request_status
  after insert on public.bundle_reservations
  for each row execute function public.update_request_status_on_reservation();

-- 6. Cancellation trigger (delete reservations when cancelled)
-- ============================================================

create or replace function public.release_reservations_on_cancel()
returns trigger as $$
begin
  if new.status = 'cancelled' and old.status != 'cancelled' then
    delete from public.bundle_reservations
    where bundle_request_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_release_on_cancel
  after update on public.bundle_requests
  for each row execute function public.release_reservations_on_cancel();

-- 7. Auto-reservation trigger on bundle_stock changes
-- ============================================================

create or replace function public.auto_reserve_on_stock_change()
returns trigger as $$
declare
  v_config_id uuid;
  v_total_stock integer;
  v_total_reserved integer;
  v_free_stock integer;
  v_request record;
  v_request_reserved integer;
  v_shortage integer;
  v_to_reserve integer;
begin
  v_config_id := new.bundle_config_id;

  -- Calculate total free stock for this bundle config
  select coalesce(sum(quantity), 0) into v_total_stock
  from public.bundle_stock
  where bundle_config_id = v_config_id;

  select coalesce(sum(res.quantity), 0) into v_total_reserved
  from public.bundle_reservations res
  join public.bundle_requests br on br.id = res.bundle_request_id
  where br.bundle_config_id = v_config_id;

  v_free_stock := v_total_stock - v_total_reserved;

  if v_free_stock <= 0 then
    return new;
  end if;

  -- FIFO: oldest pending requests first
  for v_request in
    select br.id, br.quantity
    from public.bundle_requests br
    where br.bundle_config_id = v_config_id
      and br.status = 'pending'
    order by br.created_at asc
  loop
    if v_free_stock <= 0 then
      exit;
    end if;

    select coalesce(sum(quantity), 0) into v_request_reserved
    from public.bundle_reservations
    where bundle_request_id = v_request.id;

    v_shortage := v_request.quantity - v_request_reserved;

    if v_shortage > 0 then
      v_to_reserve := least(v_free_stock, v_shortage);

      insert into public.bundle_reservations (bundle_request_id, quantity)
      values (v_request.id, v_to_reserve);

      v_free_stock := v_free_stock - v_to_reserve;
    end if;
  end loop;

  return new;
end;
$$ language plpgsql;

create trigger trg_auto_reserve_stock
  after insert or update on public.bundle_stock
  for each row execute function public.auto_reserve_on_stock_change();

-- 8. Views
-- ============================================================

create or replace view public.v_request_overview as
select
  br.id as request_id,
  p.id as project_id,
  p.name as project_name,
  c.id as client_id,
  c.name as client_name,
  bc.id as bundle_config_id,
  bc.name as bundle_name,
  br.quantity as requested,
  coalesce(sum(res.quantity), 0)::integer as reserved,
  (br.quantity - coalesce(sum(res.quantity), 0))::integer as shortage,
  coalesce(bs_free.free_stock, 0)::integer as available_stock,
  br.status,
  br.created_at
from public.bundle_requests br
join public.projects p on p.id = br.project_id
join public.clients c on c.id = p.client_id
join public.bundle_configs bc on bc.id = br.bundle_config_id
left join public.bundle_reservations res on res.bundle_request_id = br.id
left join lateral (
  select coalesce(sum(bs.quantity), 0) - coalesce(
    (select sum(res2.quantity)
     from public.bundle_reservations res2
     join public.bundle_requests br2 on br2.id = res2.bundle_request_id
     where br2.bundle_config_id = bc.id), 0
  ) as free_stock
  from public.bundle_stock bs where bs.bundle_config_id = bc.id
) bs_free on true
group by br.id, p.id, p.name, c.id, c.name, bc.id, bc.name, br.quantity, br.status, br.created_at, bs_free.free_stock;

create or replace view public.v_production_demand as
select
  bc.id as bundle_config_id,
  bc.name as bundle_name,
  c.id as client_id,
  c.name as client_name,
  sum(br.quantity)::integer as total_requested,
  coalesce(total_res.total_reserved, 0)::integer as total_reserved,
  coalesce(bs.total_stock, 0)::integer as total_stock,
  (coalesce(bs.total_stock, 0) - coalesce(total_res.total_reserved, 0))::integer as free_stock,
  greatest(sum(br.quantity) - coalesce(total_res.total_reserved, 0), 0)::integer as total_shortage
from public.bundle_requests br
join public.projects p on p.id = br.project_id
join public.clients c on c.id = p.client_id
join public.bundle_configs bc on bc.id = br.bundle_config_id
left join lateral (
  select coalesce(sum(res.quantity), 0) as total_reserved
  from public.bundle_reservations res
  join public.bundle_requests br2 on br2.id = res.bundle_request_id
  where br2.bundle_config_id = bc.id
) total_res on true
left join lateral (
  select sum(quantity) as total_stock from public.bundle_stock where bundle_config_id = bc.id
) bs on true
where br.status in ('pending', 'ready')
group by bc.id, bc.name, c.id, c.name, bs.total_stock, total_res.total_reserved;

-- 9. Drop is_template from bundle_configs
-- ============================================================

alter table public.bundle_configs drop column if exists is_template;

-- 10. RLS Policies
-- ============================================================

alter table public.projects enable row level security;
alter table public.bundle_requests enable row level security;
alter table public.bundle_reservations enable row level security;

-- Projects: read all, write for sales + admin
create policy "projects_select" on public.projects
  for select to authenticated using (true);

create policy "projects_insert" on public.projects
  for insert to authenticated
  with check (
    (current_setting('request.jwt.claims', true)::json->>'role') in ('sales', 'admin')
  );

create policy "projects_update" on public.projects
  for update to authenticated
  using (
    (current_setting('request.jwt.claims', true)::json->>'role') in ('sales', 'admin')
  );

-- Bundle requests: read all, write for sales + admin
create policy "bundle_requests_select" on public.bundle_requests
  for select to authenticated using (true);

create policy "bundle_requests_insert" on public.bundle_requests
  for insert to authenticated
  with check (
    (current_setting('request.jwt.claims', true)::json->>'role') in ('sales', 'admin')
  );

create policy "bundle_requests_update" on public.bundle_requests
  for update to authenticated
  using (
    (current_setting('request.jwt.claims', true)::json->>'role') in ('sales', 'admin')
  );

-- Bundle reservations: read all, no direct insert (triggers only), delete for admin
create policy "bundle_reservations_select" on public.bundle_reservations
  for select to authenticated using (true);

create policy "bundle_reservations_delete" on public.bundle_reservations
  for delete to authenticated
  using (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'admin'
  );
```

- [ ] **Step 2: Apply migration to Supabase**

Run the SQL via the Supabase dashboard SQL editor (project `mbqvhpdwtgtfbnscqrul`) or via curl:

```bash
# Copy the SQL content and paste into Supabase dashboard > SQL Editor > New query > Run
```

Expected: All tables, triggers, views, and policies created without errors.

- [ ] **Step 3: Verify tables exist**

In Supabase SQL editor:
```sql
select table_name from information_schema.tables
where table_schema = 'public'
and table_name in ('projects', 'bundle_requests', 'bundle_reservations');
```

Expected: 3 rows returned.

- [ ] **Step 4: Commit migration file**

```bash
git add supabase/migrations/013_sales_request_layer.sql
git commit -m "feat: add sales request layer — tables, triggers, views, RLS"
```

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Add new table types**

Add these entries inside `Tables: {` in `src/lib/supabase/types.ts`, after the `bundle_batches` entry:

```typescript
      projects: {
        Row: { id: string; client_id: string; name: string; status: string; notes: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; name: string; status?: string; notes?: string | null };
        Update: { client_id?: string; name?: string; status?: string; notes?: string | null };
        Relationships: [];
      };
      bundle_requests: {
        Row: { id: string; project_id: string; bundle_config_id: string; quantity: number; status: string; created_at: string; updated_at: string };
        Insert: { id?: string; project_id: string; bundle_config_id: string; quantity: number; status?: string };
        Update: { project_id?: string; bundle_config_id?: string; quantity?: number; status?: string };
        Relationships: [];
      };
      bundle_reservations: {
        Row: { id: string; bundle_request_id: string; quantity: number; reserved_at: string };
        Insert: { id?: string; bundle_request_id: string; quantity: number };
        Update: { bundle_request_id?: string; quantity?: number };
        Relationships: [];
      };
```

- [ ] **Step 2: Add new view types**

Add inside `Views: {`, after `v_client_catalog`:

```typescript
      v_request_overview: {
        Row: { request_id: string; project_id: string; project_name: string; client_id: string; client_name: string; bundle_config_id: string; bundle_name: string; requested: number; reserved: number; shortage: number; available_stock: number; status: string; created_at: string };
        Relationships: [];
      };
      v_production_demand: {
        Row: { bundle_config_id: string; bundle_name: string; client_id: string; client_name: string; total_requested: number; total_reserved: number; total_stock: number; free_stock: number; total_shortage: number };
        Relationships: [];
      };
```

- [ ] **Step 3: Remove is_template from bundle_configs type**

In the `bundle_configs` Row, Insert, and Update types, remove all `is_template` references:

Row: remove `is_template: boolean;`
Insert: remove `is_template?: boolean;`
Update: remove `is_template?: boolean;`

- [ ] **Step 4: Verify build compiles**

```bash
cd "c:/Users/migue/Documents/Karpi BV/karpi-sample-management" && npm run build
```

Expected: Build succeeds. If `is_template` is referenced anywhere, fix those files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add TypeScript types for projects, requests, reservations"
```

---

## Task 3: Client selector component

**Files:**
- Create: `src/components/client-selector.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Client {
  id: string;
  name: string;
}

interface ClientSelectorProps {
  onSelect: (clientId: string) => void;
  value?: string;
  label?: string;
}

export function ClientSelector({ onSelect, value, label = "Klant" }: ClientSelectorProps) {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setClients(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onSelect(v ?? "")}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecteer klant" />
        </SelectTrigger>
        <SelectContent>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/client-selector.tsx
git commit -m "feat: add ClientSelector component"
```

---

## Task 4: Navigation — add sales routes

**Files:**
- Modify: `src/components/nav-sidebar.tsx`

- [ ] **Step 1: Add FolderOpen and ClipboardList imports**

Add to the lucide-react import:

```typescript
import {
  LogOut,
  LayoutDashboard,
  Package,
  Clock,
  Scissors,
  Sparkles,
  Boxes,
  MapPin,
  Factory,
  ShoppingBag,
  Shield,
  FolderOpen,
  ClipboardList,
} from "lucide-react";
```

- [ ] **Step 2: Add nav items to sales section**

In the `sections` array, update the `sales` section items:

```typescript
  {
    key: "sales",
    label: "Verkoop",
    icon: <ShoppingBag size={16} />,
    basePath: "/sales",
    items: [
      { label: "Overzicht", href: "/sales", icon: <LayoutDashboard size={18} /> },
      { label: "Projecten", href: "/sales/projects", icon: <FolderOpen size={18} /> },
      { label: "Verzoeken", href: "/sales/requests", icon: <ClipboardList size={18} /> },
      { label: "Beschikbaarheid", href: "/sales/availability", icon: <Package size={18} /> },
      { label: "Levertijden", href: "/sales/delivery", icon: <Clock size={18} /> },
    ],
  },
```

- [ ] **Step 3: Verify navigation renders**

```bash
npm run dev
```

Navigate to `/sales` and check sidebar shows Projecten + Verzoeken links.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav-sidebar.tsx
git commit -m "feat: add Projecten and Verzoeken to sales navigation"
```

---

## Task 5: Projects overview page

**Files:**
- Create: `src/app/sales/projects/page.tsx`

- [ ] **Step 1: Create the projects page**

```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ClientSelector } from "@/components/client-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { FolderOpen, Plus, ArrowUpRight } from "lucide-react";

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  clients: { name: string } | null;
  request_count: number;
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  completed: "bg-gray-100 text-gray-600",
  archived: "bg-amber-100 text-amber-800",
};

const statusLabels: Record<string, string> = {
  active: "Actief",
  completed: "Afgerond",
  archived: "Gearchiveerd",
};

export default function ProjectsPage() {
  const supabase = createClient();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [filterClient, setFilterClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");

  // New project form
  const [showForm, setShowForm] = useState(false);
  const [newClientId, setNewClientId] = useState("");
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function loadProjects() {
    let query = supabase
      .from("projects")
      .select("id, name, status, created_at, clients(name)")
      .order("created_at", { ascending: false });

    if (filterClient && filterClient !== "all") query = query.eq("client_id", filterClient);
    if (filterStatus && filterStatus !== "all") query = query.eq("status", filterStatus);

    const { data } = await query;
    const rows = (data ?? []) as any[];

    // Count requests per project
    const projectIds = rows.map((r) => r.id);
    const { data: reqCounts } = await supabase
      .from("bundle_requests")
      .select("project_id")
      .in("project_id", projectIds);

    const countMap: Record<string, number> = {};
    (reqCounts ?? []).forEach((r: any) => {
      countMap[r.project_id] = (countMap[r.project_id] ?? 0) + 1;
    });

    setProjects(
      rows.map((r) => ({ ...r, request_count: countMap[r.id] ?? 0 }))
    );
  }

  useEffect(() => {
    loadProjects();
    const channel = supabase
      .channel("projects-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => loadProjects())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_requests" }, () => loadProjects())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClient, filterStatus]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientId || !newName.trim()) return;
    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("projects").insert({
      client_id: newClientId,
      name: newName.trim(),
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("success");
      setNewName("");
      setNewClientId("");
      setShowForm(false);
      loadProjects();
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">Projecten</h2>
          <p className="mt-1 text-sm text-muted-foreground">Klant-projecten en hun verzoeken</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-2" />
          Nieuw project
        </Button>
      </div>

      {/* New project form */}
      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nieuw project</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <ClientSelector onSelect={setNewClientId} value={newClientId} />
              <div className="space-y-2">
                <Label>Projectnaam</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Bijv. Stalenset Q2 2026"
                  required
                />
              </div>
              {status === "error" && <p className="text-sm text-red-600">{errorMsg}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={status === "saving" || !newClientId || !newName.trim()}>
                  {status === "saving" ? "Opslaan..." : "Aanmaken"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Annuleren
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="w-64">
          <ClientSelector onSelect={setFilterClient} value={filterClient} label="Filter op klant" />
        </div>
        <div className="w-48 space-y-2">
          <Label>Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Actief</SelectItem>
              <SelectItem value="completed">Afgerond</SelectItem>
              <SelectItem value="archived">Gearchiveerd</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Projects list */}
      {projects.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <FolderOpen size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Geen projecten gevonden.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <Link key={project.id} href={`/sales/projects/${project.id}`} className="group block">
              <div className="flex items-center justify-between rounded-xl bg-card px-5 py-4 ring-1 ring-border transition-all duration-200 hover:shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <FolderOpen size={18} className="text-primary" />
                  </div>
                  <div>
                    <span className="font-medium text-card-foreground">{project.name}</span>
                    <div className="text-xs text-muted-foreground">{project.clients?.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {project.request_count} verzoek{project.request_count !== 1 ? "en" : ""}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[project.status] ?? ""}`}>
                    {statusLabels[project.status] ?? project.status}
                  </span>
                  <ArrowUpRight size={16} className="text-muted-foreground/30 transition-all group-hover:text-primary" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify page loads**

Navigate to `http://localhost:3000/sales/projects`. Expected: empty state "Geen projecten gevonden." with "Nieuw project" button.

- [ ] **Step 3: Commit**

```bash
git add src/app/sales/projects/page.tsx
git commit -m "feat: add projects overview page"
```

---

## Task 6: Project detail page

**Files:**
- Create: `src/app/sales/projects/[id]/page.tsx`

- [ ] **Step 1: Create the project detail page**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Package, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  status: string;
  notes: string | null;
  client_id: string;
  clients: { name: string } | null;
}

interface RequestRow {
  request_id: string;
  bundle_config_id: string;
  bundle_name: string;
  requested: number;
  reserved: number;
  shortage: number;
  available_stock: number;
  status: string;
  created_at: string;
}

interface BundleConfig {
  id: string;
  name: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  ready: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  pending: "In afwachting",
  ready: "Klaar",
  fulfilled: "Afgehandeld",
  cancelled: "Geannuleerd",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock size={14} />,
  ready: <CheckCircle size={14} />,
  fulfilled: <CheckCircle size={14} />,
  cancelled: <XCircle size={14} />,
};

export default function ProjectDetailPage() {
  const supabase = createClient();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [configs, setConfigs] = useState<BundleConfig[]>([]);

  // New request form
  const [showForm, setShowForm] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState("");
  const [quantity, setQuantity] = useState("");
  const [formStatus, setFormStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function loadProject() {
    const { data } = await supabase
      .from("projects")
      .select("id, name, status, notes, client_id, clients(name)")
      .eq("id", projectId)
      .single();
    setProject(data as any);

    if (data) {
      // Load bundle configs for this client
      const { data: cfgs } = await supabase
        .from("bundle_configs")
        .select("id, name")
        .eq("client_id", (data as any).client_id)
        .eq("active", true)
        .order("name");
      setConfigs(cfgs ?? []);
    }
  }

  async function loadRequests() {
    const { data } = await supabase
      .from("v_request_overview")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at");
    setRequests((data as RequestRow[]) ?? []);
  }

  useEffect(() => {
    loadProject();
    loadRequests();
    const channel = supabase
      .channel(`project-detail-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_requests" }, () => loadRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_reservations" }, () => loadRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_stock" }, () => loadRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    const qty = Math.round(Number(quantity));
    if (!qty || qty < 1 || !Number.isFinite(qty)) {
      setFormStatus("error");
      setErrorMsg("Voer een geldig aantal in (geheel getal, minimaal 1)");
      return;
    }
    setFormStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("bundle_requests").insert({
      project_id: projectId,
      bundle_config_id: selectedConfig,
      quantity: qty,
    });

    if (error) {
      setFormStatus("error");
      setErrorMsg(error.message);
    } else {
      setFormStatus("success");
      setQuantity("");
      setSelectedConfig("");
      setShowForm(false);
      loadRequests();
    }
  }

  async function updateRequestStatus(requestId: string, newStatus: string) {
    await supabase
      .from("bundle_requests")
      .update({ status: newStatus })
      .eq("id", requestId);
    loadRequests();
  }

  if (!project) {
    return <div className="text-sm text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/sales/projects"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Terug naar projecten
        </Link>
        <h2 className="font-display text-3xl tracking-tight text-foreground">{project.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{project.clients?.name}</p>
      </div>

      {/* Add request button */}
      <div className="flex gap-2">
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-2" />
          Verzoek toevoegen
        </Button>
      </div>

      {/* New request form */}
      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nieuw verzoek</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div className="space-y-2">
                <Label>Bundel-recept</Label>
                <Select value={selectedConfig} onValueChange={(v) => setSelectedConfig(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecteer bundel-recept" />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {configs.length === 0 && (
                  <p className="text-xs text-muted-foreground">Geen bundel-recepten voor deze klant.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Aantal bundels</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Aantal"
                  required
                />
              </div>
              {formStatus === "error" && <p className="text-sm text-red-600">{errorMsg}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={formStatus === "saving" || !selectedConfig || !quantity}>
                  {formStatus === "saving" ? "Opslaan..." : "Indienen"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Annuleren
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Requests table */}
      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
          Verzoeken
        </h3>
        {requests.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
            <Package size={32} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nog geen verzoeken voor dit project.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bundel-recept</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gevraagd</th>
                  <th className="px-4 py-3 text-right font-medium text-emerald-700">Gereserveerd</th>
                  <th className="px-4 py-3 text-right font-medium text-amber-700">Tekort</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Vrij op voorraad</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acties</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.request_id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-card-foreground">{req.bundle_name}</td>
                    <td className="px-4 py-3 text-right text-card-foreground">{req.requested}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        {req.reserved}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {req.shortage > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          <AlertTriangle size={12} />
                          {req.shortage}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{req.available_stock}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[req.status] ?? ""}`}>
                        {statusIcons[req.status]}
                        {statusLabels[req.status] ?? req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {req.status === "ready" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateRequestStatus(req.request_id, "fulfilled")}
                            className="text-xs"
                          >
                            Afhandelen
                          </Button>
                        )}
                        {(req.status === "pending" || req.status === "ready") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateRequestStatus(req.request_id, "cancelled")}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Annuleren
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify page renders**

Create a test project via the projects page, then navigate to its detail page. Expected: project name, client, empty requests table with "Verzoek toevoegen" button.

- [ ] **Step 3: Commit**

```bash
git add src/app/sales/projects/[id]/page.tsx
git commit -m "feat: add project detail page with request management"
```

---

## Task 7: All requests overview page

**Files:**
- Create: `src/app/sales/requests/page.tsx`

- [ ] **Step 1: Create the requests page**

```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ClientSelector } from "@/components/client-selector";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ClipboardList, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";

interface RequestRow {
  request_id: string;
  project_id: string;
  project_name: string;
  client_name: string;
  bundle_name: string;
  requested: number;
  reserved: number;
  shortage: number;
  available_stock: number;
  status: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  ready: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  pending: "In afwachting",
  ready: "Klaar",
  fulfilled: "Afgehandeld",
  cancelled: "Geannuleerd",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock size={12} />,
  ready: <CheckCircle size={12} />,
  fulfilled: <CheckCircle size={12} />,
  cancelled: <XCircle size={12} />,
};

export default function AllRequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [filterClient, setFilterClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("pending");

  async function loadRequests() {
    let query = supabase
      .from("v_request_overview")
      .select("*")
      .order("created_at", { ascending: true });

    if (filterStatus) query = query.eq("status", filterStatus);
    if (filterClient) query = query.eq("client_id", filterClient);

    const { data } = await query;
    setRequests((data as RequestRow[]) ?? []);
  }

  useEffect(() => {
    loadRequests();
    const channel = supabase
      .channel("all-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_requests" }, () => loadRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_reservations" }, () => loadRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_stock" }, () => loadRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClient, filterStatus]);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-3xl tracking-tight text-foreground">Alle verzoeken</h2>
        <p className="mt-1 text-sm text-muted-foreground">Overzicht van alle bundelverzoeken</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="w-64">
          <ClientSelector onSelect={setFilterClient} value={filterClient} label="Filter op klant" />
        </div>
        <div className="w-48 space-y-2">
          <Label>Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">In afwachting</SelectItem>
              <SelectItem value="ready">Klaar</SelectItem>
              <SelectItem value="fulfilled">Afgehandeld</SelectItem>
              <SelectItem value="cancelled">Geannuleerd</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {requests.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <ClipboardList size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Geen verzoeken gevonden.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Klant</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Project</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bundel-recept</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gevraagd</th>
                <th className="px-4 py-3 text-right font-medium text-emerald-700">Gereserveerd</th>
                <th className="px-4 py-3 text-right font-medium text-amber-700">Tekort</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.request_id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 text-card-foreground">{req.client_name}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/sales/projects/${req.project_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {req.project_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-card-foreground">{req.bundle_name}</td>
                  <td className="px-4 py-3 text-right text-card-foreground">{req.requested}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      {req.reserved}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {req.shortage > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        <AlertTriangle size={12} />
                        {req.shortage}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[req.status] ?? ""}`}>
                      {statusIcons[req.status]}
                      {statusLabels[req.status] ?? req.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify page loads**

Navigate to `/sales/requests`. Expected: empty state or list of requests with filters.

- [ ] **Step 3: Commit**

```bash
git add src/app/sales/requests/page.tsx
git commit -m "feat: add all-requests overview page"
```

---

## Task 8: Production dashboard — demand section

**Files:**
- Modify: `src/app/production/page.tsx`

- [ ] **Step 1: Add demand interface**

Add after the `RecentBatch` interface (around line 28):

```typescript
interface DemandRow {
  bundle_config_id: string;
  bundle_name: string;
  client_name: string;
  total_requested: number;
  total_reserved: number;
  total_stock: number;
  free_stock: number;
  total_shortage: number;
}
```

- [ ] **Step 2: Add demand state and loading**

Add state after `recentFinishing` state (around line 34):

```typescript
  const [demand, setDemand] = useState<DemandRow[]>([]);
```

Add `loadDemand` function after `loadPipeline`:

```typescript
  async function loadDemand() {
    const { data } = await supabase
      .from("v_production_demand")
      .select("*")
      .order("total_shortage", { ascending: false });
    setDemand((data as DemandRow[]) ?? []);
  }
```

- [ ] **Step 3: Call loadDemand in useEffect**

Add `loadDemand();` call inside the existing `useEffect`, after `loadPipeline();` (around line 47).

Add realtime subscriptions to the existing channel (before `.subscribe()`):

```typescript
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_requests" }, () => loadDemand())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_reservations" }, () => loadDemand())
```

- [ ] **Step 4: Add demand section JSX**

Add this section after the "Recent activity" grid (before the closing `</div>` of the root container), around line 246:

```typescript
      {/* Openstaande verzoeken */}
      {demand.length > 0 && (
        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
            Openstaande verzoeken
          </h3>
          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bundel-recept</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Klant</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gevraagd</th>
                  <th className="px-4 py-3 text-right font-medium text-emerald-700">Gereserveerd</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Vrije voorraad</th>
                  <th className="px-4 py-3 text-right font-medium text-amber-700">Tekort</th>
                </tr>
              </thead>
              <tbody>
                {demand.map((row) => (
                  <tr key={`${row.bundle_config_id}-${row.client_name}`} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-card-foreground">{row.bundle_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.client_name}</td>
                    <td className="px-4 py-3 text-right text-card-foreground">{row.total_requested}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        {row.total_reserved}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-card-foreground">{row.free_stock}</td>
                    <td className="px-4 py-3 text-right">
                      {row.total_shortage > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          <AlertTriangle size={12} />
                          {row.total_shortage}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Add AlertTriangle import**

Add `AlertTriangle` to the lucide-react import at the top of the file.

- [ ] **Step 6: Verify production dashboard**

Navigate to `/production`. Expected: existing pipeline + new "Openstaande verzoeken" section (only shows when there are pending/ready requests).

- [ ] **Step 7: Commit**

```bash
git add src/app/production/page.tsx
git commit -m "feat: add demand overview to production dashboard"
```

---

## Task 9: Seed data migration

**Files:**
- Create: `supabase/migrations/014_seed_request_layer.sql`

- [ ] **Step 1: Write updated seed data**

```sql
-- Update bundle config names (remove order numbers)
update public.bundle_configs set name = 'Headlam 30x50'
  where id = 'bc000000-0000-0000-0000-000000000001';
update public.bundle_configs set name = 'Headlam 30x50 uitgebreid'
  where id = 'bc000000-0000-0000-0000-000000000002';
update public.bundle_configs set name = 'Headlam 40x40'
  where id = 'bc000000-0000-0000-0000-000000000003';

-- Update GALA bundle config names (remove order references)
update public.bundle_configs set name = 'GALA — Klant 500009'
  where id = 'bc000000-0000-0000-0000-000000000009';
update public.bundle_configs set name = 'GALA — Klant 500010'
  where id = 'bc000000-0000-0000-0000-000000000010';
update public.bundle_configs set name = 'GALA — Klant 500011'
  where id = 'bc000000-0000-0000-0000-000000000011';
update public.bundle_configs set name = 'GALA — Klant 500012'
  where id = 'bc000000-0000-0000-0000-000000000012';
update public.bundle_configs set name = 'GALA — Klant 500013'
  where id = 'bc000000-0000-0000-0000-000000000013';
update public.bundle_configs set name = 'GALA — Klant 500014'
  where id = 'bc000000-0000-0000-0000-000000000014';
update public.bundle_configs set name = 'GALA — Klant 500015'
  where id = 'bc000000-0000-0000-0000-000000000015';

-- Example project for Headlam
insert into public.projects (id, client_id, name) values
  ('aa000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Stalenset Voorjaar 2026');

-- Example requests for Headlam
insert into public.bundle_requests (project_id, bundle_config_id, quantity) values
  ('aa000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', 10),
  ('aa000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000003', 5);

-- GALA projects per client
insert into public.projects (id, client_id, name) values
  ('aa000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000009', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000010', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000011', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0000-000000000012', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-000000000013', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000014', 'f0000000-0000-0000-0000-000000000014', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000015', 'f0000000-0000-0000-0000-000000000015', 'GALA Stalen 2026');

-- GALA requests (1 bundle each)
insert into public.bundle_requests (project_id, bundle_config_id, quantity) values
  ('aa000000-0000-0000-0000-000000000009', 'bc000000-0000-0000-0000-000000000009', 1),
  ('aa000000-0000-0000-0000-000000000010', 'bc000000-0000-0000-0000-000000000010', 1),
  ('aa000000-0000-0000-0000-000000000011', 'bc000000-0000-0000-0000-000000000011', 1),
  ('aa000000-0000-0000-0000-000000000012', 'bc000000-0000-0000-0000-000000000012', 1),
  ('aa000000-0000-0000-0000-000000000013', 'bc000000-0000-0000-0000-000000000013', 1),
  ('aa000000-0000-0000-0000-000000000014', 'bc000000-0000-0000-0000-000000000014', 1),
  ('aa000000-0000-0000-0000-000000000015', 'bc000000-0000-0000-0000-000000000015', 1);
```

- [ ] **Step 2: Apply seed data via Supabase dashboard**

Run the SQL in the Supabase SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/014_seed_request_layer.sql
git commit -m "feat: update seed data with projects and requests"
```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Verify full sales flow**

1. Go to `/sales/projects` — see Headlam + GALA projects
2. Click "Stalenset Voorjaar 2026" — see 2 requests with shortage indicators
3. Add a new request — verify it appears in the table
4. Go to `/sales/requests` — see all requests across projects

- [ ] **Step 2: Verify production dashboard**

1. Go to `/production` — see "Openstaande verzoeken" section with demand data
2. Verify totals make sense (requested, reserved, shortage)

- [ ] **Step 3: Verify auto-reservation**

1. Go to `/production/bundles` — assemble a bundle batch for one of the requested configs
2. Go back to `/sales/projects/{headlam-project-id}` — verify reservation count increased

- [ ] **Step 4: Verify cancellation**

1. On a request with "pending" status, click "Annuleren"
2. Verify status changes to "Geannuleerd" and reservations are released

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete sales request layer implementation"
```
