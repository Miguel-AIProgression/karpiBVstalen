"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, ClipboardList, Printer } from "lucide-react";
import { OrderCreateModal } from "@/components/order-create-modal";
import { StickerPrint } from "@/components/sticker-print";
import Image from "next/image";

/* ─── Types ──────────────────────────────────────────── */

interface OrderData {
  id: string;
  order_number: string;
  client_id: string;
  collection_id: string;
  delivery_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  clients: { name: string; logo_url: string | null } | null;
  collections: { name: string } | null;
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

/* ─── Component ──────────────────────────────────────── */

export default function OrdersPage() {
  const supabase = createClient();
  const router = useRouter();

  const [orders, setOrders] = useState<OrderData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Sticker print state
  const [stickerOrderId, setStickerOrderId] = useState<string | null>(null);
  const [stickerClientId, setStickerClientId] = useState<string | null>(null);
  const [stickerOpen, setStickerOpen] = useState(false);

  /* ─── Stock recalculation ─── */

  const recalculateStatuses = useCallback(
    async (orderList: OrderData[]) => {
      const nonCompleted = orderList.filter((o) => o.status !== "completed");
      if (nonCompleted.length === 0) return orderList;

      // Get all order lines for non-completed orders
      const orderIds = nonCompleted.map((o) => o.id);
      const { data: allLines } = await supabase
        .from("order_lines")
        .select("*, bundles(quality_id, dimension_id, bundle_colors(color_code_id))")
        .in("order_id", orderIds);

      // Get all finished stock
      const { data: finStock } = await supabase
        .from("finished_stock")
        .select("quality_id, color_code_id, dimension_id, quantity");

      // Build finished stock map
      const finMap = new Map<string, number>();
      for (const f of finStock ?? []) {
        const k = `${f.quality_id}|${f.color_code_id}|${f.dimension_id}`;
        finMap.set(k, (finMap.get(k) ?? 0) + f.quantity);
      }

      // Group lines by order
      const allLinesAny = (allLines ?? []) as any[];
      const linesByOrder = new Map<string, any[]>();
      for (const line of allLinesAny) {
        const arr = linesByOrder.get(line.order_id) ?? [];
        arr.push(line);
        linesByOrder.set(line.order_id, arr);
      }

      const updates: { id: string; newStatus: string }[] = [];

      for (const order of nonCompleted) {
        const lines = linesByOrder.get(order.id) ?? [];
        let allSufficient = true;

        for (const line of lines) {
          const bundle = line.bundles;
          if (!bundle) continue;
          for (const bc of bundle.bundle_colors ?? []) {
            const k = `${bundle.quality_id}|${bc.color_code_id}|${bundle.dimension_id}`;
            const available = finMap.get(k) ?? 0;
            const needed = line.quantity ?? 0;
            if (available < needed) {
              allSufficient = false;
              break;
            }
          }
          if (!allSufficient) break;
        }

        const newStatus = allSufficient ? "picking_ready" : "restock_needed";
        if (newStatus !== order.status) {
          updates.push({ id: order.id, newStatus });
        }
      }

      // Apply updates
      if (updates.length > 0) {
        for (const u of updates) {
          await supabase.from("orders").update({ status: u.newStatus }).eq("id", u.id);
        }
        // Return updated order list
        return orderList.map((o) => {
          const upd = updates.find((u) => u.id === o.id);
          return upd ? { ...o, status: upd.newStatus } : o;
        });
      }

      return orderList;
    },
    [supabase]
  );

  /* ─── Data loading ─── */

  const loadData = useCallback(async () => {
    const { data: ordersData } = await supabase
      .from("orders")
      .select("*, clients(name, logo_url), collections(name)")
      .order("created_at", { ascending: false });

    let mapped: OrderData[] = (ordersData ?? []).map((o: any) => ({
      id: o.id,
      order_number: o.order_number,
      client_id: o.client_id,
      collection_id: o.collection_id,
      delivery_date: o.delivery_date,
      status: o.status,
      notes: o.notes,
      created_at: o.created_at,
      clients: o.clients,
      collections: o.collections,
    }));

    // Recalculate statuses for non-completed orders
    mapped = await recalculateStatuses(mapped);

    setOrders(mapped);
    setLoading(false);
  }, [supabase, recalculateStatuses]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Filtering ─── */

  const filtered = orders.filter((o) => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !o.order_number.toLowerCase().includes(q) &&
        !(o.clients?.name ?? "").toLowerCase().includes(q) &&
        !(o.collections?.name ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">
            Orders
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Overzicht van alle orders
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> Nieuwe order
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op ordernummer, klant of collectie..."
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
      </div>

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
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Order nr.</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Klant</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Collectie</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Levertijd</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Stickers</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30"
                    onClick={() => router.push(`/orders/${o.id}`)}
                  >
                    <td className="px-4 py-3 font-mono font-medium text-card-foreground">
                      {o.order_number}
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
                      {o.collections?.name ?? "Onbekend"}
                    </td>
                    <td className="px-4 py-3 text-card-foreground">
                      {formatDate(o.delivery_date)}
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
                          setStickerOrderId(o.id);
                          setStickerClientId(o.client_id);
                          setStickerOpen(true);
                        }}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Print stickers"
                      >
                        <Printer size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
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

      {/* Modals */}
      <OrderCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadData}
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
