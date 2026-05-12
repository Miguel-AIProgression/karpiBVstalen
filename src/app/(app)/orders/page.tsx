"use client";

import { useEffect, useState, useCallback, Fragment, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, ClipboardList, Printer, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, Layers, Trash2 } from "lucide-react";
import { OrderCreateModal } from "@/components/order-create-modal";
import { StickerPrint } from "@/components/sticker-print";
import { WerkbonModal } from "@/components/werkbon-modal";
import { isoWeekParts } from "@/lib/dates/iso-week";
import { readVoorraadbeeld } from "@/lib/voorraadbeeld/snapshot";
import { buildFulfillability } from "@/lib/voorraadbeeld/fulfillability";
import Image from "next/image";

/* ─── Types ──────────────────────────────────────────── */

interface OrderData {
  id: string;
  order_number: string;
  client_id: string;
  delivery_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  clients: { name: string; logo_url: string | null; price_list_nr: string | null } | null;
  line_count: number;
  total_quantity: number;
}

/* ─── Helpers ──────────────────────────────────────────── */

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatWeek(dateStr: string) {
  const { week, year } = isoWeekParts(new Date(dateStr));
  return `Week ${week} (${year})`;
}

function statusLabel(status: string) {
  switch (status) {
    case "picking_ready":
      return "Klaar om te picken";
    case "restock_needed":
      return "Voorraad aanvullen";
    case "completed":
      return "Voltooid";
    default:
      return status;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "picking_ready":
      return "bg-green-100 text-green-800";
    case "restock_needed":
      return "bg-amber-100 text-amber-800";
    case "completed":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

/* ─── Sort / Group types ──────────────────────────────── */

type SortField = "delivery_date" | "created_at" | null;
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = {
  restock_needed: 0,
  picking_ready: 1,
  completed: 2,
};

function sortOrders(orders: OrderData[], field: SortField, dir: SortDir): OrderData[] {
  if (!field) return orders;
  return [...orders].sort((a, b) => {
    let cmp = 0;
    if (field === "delivery_date") {
      cmp = a.delivery_date.localeCompare(b.delivery_date);
    } else if (field === "created_at") {
      cmp = a.created_at.localeCompare(b.created_at);
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function groupByStatus(orders: OrderData[]): { status: string; orders: OrderData[] }[] {
  const groups = new Map<string, OrderData[]>();
  for (const o of orders) {
    const arr = groups.get(o.status) ?? [];
    arr.push(o);
    groups.set(o.status, arr);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (STATUS_ORDER[a] ?? 99) - (STATUS_ORDER[b] ?? 99))
    .map(([status, items]) => ({ status, orders: items }));
}

/* ─── Werkbonnen List ────────────────────────────────── */

function WerkbonnenList({ router }: { router: any }) {
  const supabase = createClient();
  const [werkbonnen, setWerkbonnen] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: wbs } = await (supabase as any).from("werkbonnen").select("id, created_at, status").order("created_at", { ascending: false });
    if (!wbs?.length) { setWerkbonnen([]); setLoading(false); return; }
    const { data: orders } = await (supabase as any).from("werkbon_orders").select("werkbon_id, order_number").in("werkbon_id", wbs.map((w: any) => w.id));
    const { data: lines } = await (supabase as any).from("werkbon_lines").select("werkbon_id, status").in("werkbon_id", wbs.map((w: any) => w.id));
    setWerkbonnen(wbs.map((w: any) => ({
      ...w,
      order_numbers: (orders ?? []).filter((o: any) => o.werkbon_id === w.id).map((o: any) => o.order_number).sort().join(", "),
      total: (lines ?? []).filter((l: any) => l.werkbon_id === w.id).length,
      open: (lines ?? []).filter((l: any) => l.werkbon_id === w.id && l.status === "open").length,
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function deleteWerkbon(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Werkbon verwijderen? Alle regels verdwijnen ook van de productielijst.")) return;
    await (supabase as any).from("werkbonnen").delete().eq("id", id);
    load();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Laden...</p>;
  if (!werkbonnen.length) return <p className="text-sm text-muted-foreground">Nog geen werkbonnen aangemaakt.</p>;

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Datum</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Orders</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Regels</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {werkbonnen.map((w) => (
            <tr key={w.id} className="cursor-pointer border-b border-border/50 hover:bg-muted/30" onClick={() => router.push(`/werkbonnen/${w.id}`)}>
              <td className="px-4 py-3 text-muted-foreground">{new Date(w.created_at).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
              <td className="px-4 py-3 font-mono font-medium">{w.order_numbers}</td>
              <td className="px-4 py-3">
                <span className="text-muted-foreground">{w.open} open</span>
                {w.total > w.open && <span className="ml-2 text-green-600">· {w.total - w.open} gereed</span>}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${w.status === "completed" ? "bg-gray-100 text-gray-600" : "bg-amber-100 text-amber-800"}`}>
                  {w.status === "completed" ? "Voltooid" : "Open"}
                </span>
              </td>
              <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                <button
                  onClick={e => deleteWerkbon(e, w.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Verwijderen"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Order Row ──────────────────────────────────────── */

function OrderRow({ o, router, onSticker, selected, onSelect, hasWerkbon }: {
  o: OrderData;
  router: any;
  onSticker: (orderId: string, clientId: string) => void;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  hasWerkbon: boolean;
}) {
  return (
    <tr
      className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30 ${selected ? "bg-primary/5" : ""}`}
      onClick={() => router.push(`/orders/${o.id}`)}
    >
      <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(o.id, e.target.checked)}
          className="rounded border-border"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium text-card-foreground">{o.order_number}</span>
          {hasWerkbon && (
            <span className="inline-flex items-center rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
              Werkbon
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {o.clients?.logo_url ? (
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg">
              <Image src={o.clients.logo_url} alt="" fill className="object-cover" />
            </div>
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
              {getInitials(o.clients?.name ?? "?")}
            </div>
          )}
          <span className="font-medium text-card-foreground">
            {o.clients?.name ?? "Onbekend"}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-card-foreground">
        {o.line_count > 0 ? (
          <>
            <span className="font-medium">{o.line_count}</span>
            <span className="ml-1 text-xs text-muted-foreground">
              artikel{o.line_count === 1 ? "" : "en"} ({o.total_quantity} stuks)
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-card-foreground">
        {formatDate(o.created_at)}
      </td>
      <td className="px-4 py-3 text-card-foreground">
        {formatWeek(o.delivery_date)}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusBadgeClass(o.status)}`}
        >
          {statusLabel(o.status)}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSticker(o.id, o.client_id);
          }}
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Print stickers"
        >
          <Printer size={16} />
        </button>
      </td>
    </tr>
  );
}

/* ─── Component ──────────────────────────────────────── */

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Laden…</div>}>
      <OrdersPageContent />
    </Suspense>
  );
}

function OrdersPageContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "orders";

  const [orders, setOrders] = useState<OrderData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Sort & group state
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [groupStatus, setGroupStatus] = useState(false);

  // Selectie voor werkbon
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [werkbonOrderIds, setWerkbonOrderIds] = useState<Set<string>>(new Set());
  const [werkbonOpen, setWerkbonOpen] = useState(false);

  function handleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id); else n.delete(id);
      return n;
    });
  }

  // Sticker print state
  const [stickerOrderId, setStickerOrderId] = useState<string | null>(null);
  const [stickerClientId, setStickerClientId] = useState<string | null>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [legacyTotal, setLegacyTotal] = useState(0);

  /* ─── Data loading ─── */

  const loadData = useCallback(async () => {
    const [{ data: ordersData }, { data: linesData }, vb] = await Promise.all([
      supabase
        .from("orders")
        .select("*, clients(name, logo_url, price_list_nr)")
        .order("created_at", { ascending: false }),
      supabase.from("order_lines").select("order_id, quantity"),
      readVoorraadbeeld(supabase, new Date()).catch(() => null),
    ]);

    const lineStats = new Map<string, { count: number; total: number }>();
    for (const l of (linesData ?? []) as { order_id: string; quantity: number }[]) {
      const cur = lineStats.get(l.order_id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += l.quantity ?? 0;
      lineStats.set(l.order_id, cur);
    }

    const mapped: OrderData[] = ((ordersData ?? []) as Array<{
      id: string;
      order_number: string;
      client_id: string;
      delivery_date: string;
      status: string;
      notes: string | null;
      created_at: string;
      clients: { name: string; logo_url: string | null; price_list_nr: string | null } | null;
    }>).map((o) => ({
      id: o.id,
      order_number: o.order_number,
      client_id: o.client_id,
      delivery_date: o.delivery_date,
      status: o.status,
      notes: o.notes,
      created_at: o.created_at,
      clients: o.clients,
      line_count: lineStats.get(o.id)?.count ?? 0,
      total_quantity: lineStats.get(o.id)?.total ?? 0,
    }));

    setOrders(mapped);

    // Haal op welke orders een werkbon hebben
    const { data: wbOrders } = await (supabase as any).from("werkbon_orders").select("order_id");
    setWerkbonOrderIds(new Set((wbOrders ?? []).map((w: any) => w.order_id)));

    if (vb) {
      const fulfillment = buildFulfillability(vb);
      let total = 0;
      for (const f of fulfillment.values()) total += f.legacyLineCount;
      setLegacyTotal(total);
    }

    setLoading(false);
  }, [supabase]);

  /* ─── On-demand status recalculation ─── */

  const recalculateStatuses = useCallback(async () => {
    setRecalculating(true);
    try {
      const vb = await readVoorraadbeeld(supabase, new Date());
      const fulfillment = buildFulfillability(vb);

      // Synchroniseer DB-status: compleet → picking_ready, onvolledig → restock_needed.
      // Skip completed orders.
      const updates: { id: string; newStatus: string }[] = [];
      for (const order of orders) {
        if (order.status === "completed") continue;
        const f = fulfillment.get(order.id);
        // Geen fulfillment-entry betekent dat de read-laag de order niet zag
        // (bv. omdat hij geen open status heeft of geen sample-lines). Sla over.
        if (!f) continue;
        const newStatus = f.status === "compleet" ? "picking_ready" : "restock_needed";
        if (newStatus !== order.status) {
          updates.push({ id: order.id, newStatus });
        }
      }

      if (updates.length > 0) {
        await Promise.all(
          updates.map((u) => supabase.from("orders").update({ status: u.newStatus }).eq("id", u.id)),
        );
        setOrders((prev) =>
          prev.map((o) => {
            const upd = updates.find((u) => u.id === o.id);
            return upd ? { ...o, status: upd.newStatus } : o;
          }),
        );
      }

      // Update legacy banner-totaal terwijl we toch een vers Voorraadbeeld hebben
      let total = 0;
      for (const f of fulfillment.values()) total += f.legacyLineCount;
      setLegacyTotal(total);
    } finally {
      setRecalculating(false);
    }
  }, [supabase, orders]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Sorting helper ─── */

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  /* ─── Filtering & sorting ─── */

  const filtered = sortOrders(
    orders.filter((o) => {
      if (filterStatus && o.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !o.order_number.toLowerCase().includes(q) &&
          !(o.clients?.name ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    }),
    sortField,
    sortDir
  );

  const grouped = groupStatus ? groupByStatus(filtered) : null;

  return (
    <div className="space-y-6 p-6">
      {/* Header + tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">
            Orders
          </h2>
          <div className="mt-3 flex gap-1">
            {["orders", "werkbonnen"].map((tab) => (
              <button
                key={tab}
                onClick={() => router.push(tab === "orders" ? "/orders" : "/orders?tab=werkbonnen")}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${activeTab === tab ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
              >
                {tab === "orders" ? "Orders" : "Werkbonnen"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={() => setWerkbonOpen(true)}>
              <ClipboardList size={14} /> Werkbon ({selectedIds.size})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={recalculateStatuses}
            disabled={recalculating || loading}
            title="Herbereken statussen op basis van huidige voorraad"
          >
            <RefreshCw size={14} className={recalculating ? "animate-spin" : ""} />
            {recalculating ? "Berekenen..." : "Herbereken"}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Nieuwe order
          </Button>
        </div>
      </div>

      {/* Werkbonnen tab */}
      {activeTab === "werkbonnen" && <WerkbonnenList router={router} />}

      {/* Orders tab inhoud */}
      {activeTab !== "werkbonnen" && <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op ordernummer of klant..."
            className="pl-8"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Alle statussen</option>
          <option value="picking_ready">Klaar om te picken</option>
          <option value="restock_needed">Voorraad aanvullen</option>
          <option value="completed">Voltooid</option>
        </select>
        <Button
          variant={groupStatus ? "default" : "outline"}
          size="sm"
          onClick={() => setGroupStatus(!groupStatus)}
          title="Groepeer op status"
        >
          <Layers size={14} />
          Groepeer op status
        </Button>
      </div>

      {/* Legacy bundle warning */}
      {legacyTotal > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ {legacyTotal} legacy bundle-regel(s) zonder sample_id worden niet meegenomen in de fulfillability-berekening. Migreer deze regels of negeer.
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <ClipboardList size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {orders.length === 0
              ? "Nog geen orders. Klik op '+ Nieuwe order' om te beginnen."
              : "Geen orders gevonden voor deze filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="pl-4 pr-2 py-3 w-8"></th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Order nr.</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Klant</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Artikelen
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("created_at")}
                  >
                    <span className="inline-flex items-center gap-1">Aanmaakdatum <SortIcon field="created_at" /></span>
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("delivery_date")}
                  >
                    <span className="inline-flex items-center gap-1">Levertijd <SortIcon field="delivery_date" /></span>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Stickers</th>
                </tr>
              </thead>
              <tbody>
                {grouped
                  ? grouped.map((g) => (
                      <Fragment key={g.status}>
                        <tr className="bg-muted/70">
                          <td colSpan={7} className="px-4 py-2 font-semibold text-sm text-foreground">
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium mr-2 ${statusBadgeClass(g.status)}`}>
                              {statusLabel(g.status)}
                            </span>
                            {g.orders.length} order{g.orders.length !== 1 ? "s" : ""}
                          </td>
                        </tr>
                        {g.orders.map((o) => (
                          <OrderRow key={o.id} o={o} router={router} onSticker={(orderId, clientId) => { setStickerOrderId(orderId); setStickerClientId(clientId); setStickerOpen(true); }} selected={selectedIds.has(o.id)} onSelect={handleSelect} hasWerkbon={werkbonOrderIds.has(o.id)} />
                        ))}
                      </Fragment>
                    ))
                  : filtered.map((o) => (
                      <OrderRow key={o.id} o={o} router={router} onSticker={(orderId, clientId) => { setStickerOrderId(orderId); setStickerClientId(clientId); setStickerOpen(true); }} selected={selectedIds.has(o.id)} onSelect={handleSelect} hasWerkbon={werkbonOrderIds.has(o.id)} />
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {filtered.length} order{filtered.length !== 1 ? "s" : ""} gevonden
        </div>
      )}

      </>}

      {/* Modals */}
      <OrderCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadData}
      />
      <WerkbonModal
        orderIds={Array.from(selectedIds)}
        open={werkbonOpen}
        onOpenChange={setWerkbonOpen}
      />
      {stickerOrderId && stickerClientId && (
        <StickerPrint
          orderId={stickerOrderId}
          clientId={stickerClientId}
          open={stickerOpen}
          onOpenChange={(open) => {
            setStickerOpen(open);
            if (!open) {
              setStickerOrderId(null);
              setStickerClientId(null);
            }
          }}
        />
      )}
    </div>
  );
}
