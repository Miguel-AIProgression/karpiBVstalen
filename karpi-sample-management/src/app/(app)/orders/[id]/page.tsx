"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Calendar, Package, Layers } from "lucide-react";
import { StickerPrint } from "@/components/sticker-print";
import Link from "next/link";

/* ─── Types ──────────────────────────────────────────── */

interface OrderDetail {
  id: string;
  order_number: string;
  client_id: string;
  collection_id: string;
  delivery_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  clients: {
    id: string;
    name: string;
    logo_url: string | null;
  } | null;
  collections: {
    id: string;
    name: string;
  } | null;
  order_lines: OrderLine[];
}

interface OrderLine {
  id: string;
  order_id: string;
  bundle_id: string;
  quantity: number;
  bundles: {
    id: string;
    name: string;
    quality_id: string;
    dimension_id: string;
    qualities: { id: string; name: string; code: string } | null;
    sample_dimensions: { id: string; name: string } | null;
    bundle_colors: {
      id: string;
      color_code_id: string;
      color_codes: { id: string; code: string; name: string } | null;
    }[];
  } | null;
}

/* ─── Helpers ──────────────────────────────────────────── */

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
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

export default function OrderDetailPage() {
  const supabase = createClient();
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Stock status per bundle
  const [bundleStockStatus, setBundleStockStatus] = useState<Map<string, boolean>>(new Map());
  // Client custom quality names: quality_id → custom_name
  const [clientQualityNames, setClientQualityNames] = useState<Map<string, string>>(new Map());

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select(
        "*, clients(*), collections(*), order_lines(*, bundles(*, qualities(*), sample_dimensions(*), bundle_colors(*, color_codes(*))))"
      )
      .eq("id", orderId)
      .single();

    if (!data) {
      setLoading(false);
      return;
    }

    setOrder(data as any);

    // Calculate stock status per bundle
    const { data: finStock } = await supabase
      .from("finished_stock")
      .select("quality_id, color_code_id, dimension_id, quantity");

    const finMap = new Map<string, number>();
    for (const f of finStock ?? []) {
      const k = `${f.quality_id}|${f.color_code_id}|${f.dimension_id}`;
      finMap.set(k, (finMap.get(k) ?? 0) + f.quantity);
    }

    const statusMap = new Map<string, boolean>();
    for (const line of (data as any).order_lines ?? []) {
      const bundle = line.bundles;
      if (!bundle) continue;
      let allOk = true;
      for (const bc of bundle.bundle_colors ?? []) {
        const k = `${bundle.quality_id}|${bc.color_code_id}|${bundle.dimension_id}`;
        const available = finMap.get(k) ?? 0;
        if (available < (line.quantity ?? 0)) {
          allOk = false;
          break;
        }
      }
      statusMap.set(bundle.id, allOk);
    }
    setBundleStockStatus(statusMap);

    // Fetch client custom quality names
    if ((data as any).client_id) {
      const qualityIds = [
        ...new Set(
          ((data as any).order_lines ?? [])
            .map((l: any) => l.bundles?.quality_id)
            .filter(Boolean)
        ),
      ];
      if (qualityIds.length > 0) {
        const { data: customNames } = await supabase
          .from("client_quality_names")
          .select("quality_id, custom_name")
          .eq("client_id", (data as any).client_id)
          .in("quality_id", qualityIds as string[]);
        const nameMap = new Map<string, string>();
        for (const cn of customNames ?? []) {
          nameMap.set(cn.quality_id, cn.custom_name);
        }
        setClientQualityNames(nameMap);
      }
    }

    setLoading(false);
  }, [supabase, orderId]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStatusChange(newStatus: string) {
    if (!order) return;
    setUpdatingStatus(true);
    await supabase.from("orders").update({ status: newStatus }).eq("id", order.id);
    setOrder({ ...order, status: newStatus });
    setUpdatingStatus(false);
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Order niet gevonden.</p>
        </div>
      </div>
    );
  }

  const totalBundels = order.order_lines.length;
  const totalStalen = order.order_lines.reduce((sum, line) => {
    const colorCount = (line.bundles?.bundle_colors?.length ?? 0);
    return sum + colorCount * (line.quantity ?? 0);
  }, 0);

  return (
    <div className="space-y-6 p-6">
      {/* Back link */}
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> Terug naar orders
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">
            {order.order_number}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.clients?.name ?? "Onbekend"} &mdash; {order.collections?.name ?? "Onbekend"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setStickerOpen(true)}
          >
            <Printer size={14} /> Print alle stickers
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Calendar size={18} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Levertijd</p>
              <p className="text-sm font-semibold text-card-foreground">
                {formatDate(order.delivery_date)}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <Package size={18} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bundels</p>
              <p className="text-sm font-semibold text-card-foreground">{totalBundels}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <Layers size={18} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Totaal stalen</p>
              <p className="text-sm font-semibold text-card-foreground">{totalStalen}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status dropdown */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Status:</span>
        <select
          value={order.status}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={updatingStatus}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="picking_ready">Klaar om te picken</option>
          <option value="restock_needed">Voorraad aanvullen</option>
          <option value="completed">Voltooid</option>
        </select>
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}
        >
          {statusLabel(order.status)}
        </span>
      </div>

      {/* Bundle table */}
      {order.order_lines.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Geen orderregels gevonden.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bundel</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kwaliteit</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Kleuren</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Aantal</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Voorraad</th>
                </tr>
              </thead>
              <tbody>
                {order.order_lines.map((line) => {
                  const bundle = line.bundles;
                  if (!bundle) return null;
                  const colorCount = bundle.bundle_colors?.length ?? 0;
                  const hasStock = bundleStockStatus.get(bundle.id) ?? false;

                  return (
                    <tr
                      key={line.id}
                      className="border-b border-border/50 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-medium text-card-foreground">
                        {bundle.name}
                      </td>
                      <td className="px-4 py-3 text-card-foreground">
                        {(() => {
                          const karpiName = bundle.qualities?.name ?? "";
                          const karpiCode = bundle.qualities?.code ?? "";
                          const clientName = clientQualityNames.get(bundle.quality_id);
                          const hasCustomName = clientName && clientName.toLowerCase() !== karpiName.toLowerCase();

                          return (
                            <div className="flex flex-col">
                              <span>
                                {karpiName}
                                {karpiCode ? (
                                  <span className="ml-1.5 text-xs text-muted-foreground">
                                    ({karpiCode})
                                  </span>
                                ) : null}
                              </span>
                              {hasCustomName && (
                                <span className="text-xs text-muted-foreground">
                                  Klant: {clientName}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right text-card-foreground">
                        {colorCount}
                      </td>
                      <td className="px-4 py-3 text-right text-card-foreground">
                        {line.quantity}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasStock ? (
                          <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                            Op voorraad
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Tekort
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Opmerkingen
          </h3>
          <p className="text-sm text-card-foreground">{order.notes}</p>
        </div>
      )}

      {/* Sticker print modal */}
      <StickerPrint
        orderId={order.id}
        clientId={order.client_id}
        open={stickerOpen}
        onOpenChange={setStickerOpen}
      />
    </div>
  );
}
