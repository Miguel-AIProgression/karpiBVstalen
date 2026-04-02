"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Calendar, Package, Layers, FileText, X, Pencil, Save, XCircle, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StickerPrint } from "@/components/sticker-print";
import { PackingSlip } from "@/components/packing-slip";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  shipping_street: string | null;
  shipping_postal_code: string | null;
  shipping_city: string | null;
  shipping_country: string | null;
  collection_price_cents: number | null;
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

interface BundleItemSample {
  id: string;
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  qualities: { id: string; name: string; code: string } | null;
  color_codes: { id: string; code: string; name: string } | null;
  sample_dimensions: { id: string; name: string } | null;
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
    bundle_items: {
      id: string;
      position: number;
      samples: BundleItemSample;
    }[];
  } | null;
}

/* ─── Helpers ──────────────────────────────────────────── */

/** Check if bundle uses bundle_items (multi-quality) instead of bundle_colors */
function isMultiQualityBundle(bundle: OrderLine["bundles"]) {
  if (!bundle) return false;
  return !bundle.quality_id && (bundle.bundle_items?.length ?? 0) > 0;
}

/** Get unique quality names from bundle_items */
function getQualitiesFromItems(bundle: OrderLine["bundles"]): string {
  if (!bundle?.bundle_items?.length) return "";
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of bundle.bundle_items) {
    const name = item.samples?.qualities?.name ?? "";
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names.join(", ");
}

/** Get color count from bundle_items */
function getColorCountFromItems(bundle: OrderLine["bundles"]): number {
  return bundle?.bundle_items?.length ?? 0;
}

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
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [pakbonOpen, setPakbonOpen] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [orderAccessories, setOrderAccessories] = useState<{ name: string; quantity: number; price_cents: number }[]>([]);

  // Stock status per bundle
  const [bundleStockStatus, setBundleStockStatus] = useState<Map<string, boolean>>(new Map());
  // Client custom quality names: quality_id → custom_name
  const [clientQualityNames, setClientQualityNames] = useState<Map<string, string>>(new Map());

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editDeliveryDate, setEditDeliveryDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editShippingStreet, setEditShippingStreet] = useState("");
  const [editShippingPostalCode, setEditShippingPostalCode] = useState("");
  const [editShippingCity, setEditShippingCity] = useState("");
  const [editShippingCountry, setEditShippingCountry] = useState("");
  const [editCollectionPrice, setEditCollectionPrice] = useState("");
  const [editQuantities, setEditQuantities] = useState<Map<string, number>>(new Map());
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select(
        "*, clients(*), collections(*), order_lines(*, bundles(*, qualities(*), sample_dimensions(*), bundle_colors(*, color_codes(*)), bundle_items(*, samples(*, qualities(*), color_codes(*), sample_dimensions(*)))))"
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

    // statusMap key: "quality_id|color_code_id|dimension_id|line_quantity" → boolean
    const statusMap = new Map<string, boolean>();
    for (const line of (data as any).order_lines ?? []) {
      const bundle = line.bundles;
      if (!bundle) continue;
      const qty = line.quantity ?? 0;

      if (bundle.quality_id && (bundle.bundle_colors?.length ?? 0) > 0) {
        for (const bc of bundle.bundle_colors ?? []) {
          const k = `${bundle.quality_id}|${bc.color_code_id}|${bundle.dimension_id}`;
          statusMap.set(`${line.id}|${k}`, (finMap.get(k) ?? 0) >= qty);
        }
      } else if ((bundle.bundle_items?.length ?? 0) > 0) {
        for (const item of bundle.bundle_items ?? []) {
          const s = item.samples;
          if (!s) continue;
          const k = `${s.quality_id}|${s.color_code_id}|${s.dimension_id}`;
          statusMap.set(`${line.id}|${k}`, (finMap.get(k) ?? 0) >= qty);
        }
      }
    }
    setBundleStockStatus(statusMap);

    // Fetch client custom quality names
    if ((data as any).client_id) {
      const qualityIds = [
        ...new Set([
          // From old-style bundles
          ...((data as any).order_lines ?? [])
            .map((l: any) => l.bundles?.quality_id)
            .filter(Boolean),
          // From new-style bundle_items
          ...((data as any).order_lines ?? [])
            .flatMap((l: any) => (l.bundles?.bundle_items ?? []).map((bi: any) => bi.samples?.quality_id))
            .filter(Boolean),
        ]),
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

    // Fetch order accessories
    const { data: accData } = await supabase
      .from("order_accessories")
      .select("quantity, price_cents, accessories(name)")
      .eq("order_id", orderId);

    setOrderAccessories(
      (accData ?? []).map((a: any) => ({
        name: a.accessories?.name ?? "?",
        quantity: a.quantity,
        price_cents: a.price_cents,
      }))
    );

    setLoading(false);
  }, [supabase, orderId]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete() {
    if (!order) return;
    if (!confirm(`Order "${order.order_number}" definitief verwijderen? Dit kan niet ongedaan worden.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/orders");
    } else {
      const body = await res.json().catch(() => null);
      alert(`Verwijderen mislukt: ${body?.error ?? "onbekende fout"}`);
      setDeleting(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!order) return;
    setUpdatingStatus(true);
    await supabase.from("orders").update({ status: newStatus }).eq("id", order.id);
    setOrder({ ...order, status: newStatus });
    setUpdatingStatus(false);
  }

  function startEditing() {
    if (!order) return;
    setEditDeliveryDate(order.delivery_date);
    setEditNotes(order.notes ?? "");
    setEditShippingStreet(order.shipping_street ?? "");
    setEditShippingPostalCode(order.shipping_postal_code ?? "");
    setEditShippingCity(order.shipping_city ?? "");
    setEditShippingCountry(order.shipping_country ?? "Nederland");
    setEditCollectionPrice(
      order.collection_price_cents != null && order.collection_price_cents > 0
        ? (order.collection_price_cents / 100).toFixed(2)
        : ""
    );
    const qMap = new Map<string, number>();
    for (const line of order.order_lines) {
      qMap.set(line.id, line.quantity);
    }
    setEditQuantities(qMap);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  async function saveEdits() {
    if (!order) return;
    setSavingEdit(true);

    const priceCents = Math.round(parseFloat(editCollectionPrice || "0") * 100);

    // Update order fields
    await supabase.from("orders").update({
      delivery_date: editDeliveryDate,
      notes: editNotes.trim() || null,
      shipping_street: editShippingStreet.trim() || null,
      shipping_postal_code: editShippingPostalCode.trim() || null,
      shipping_city: editShippingCity.trim() || null,
      shipping_country: editShippingCountry.trim() || null,
      collection_price_cents: priceCents > 0 ? priceCents : null,
    }).eq("id", order.id);

    // Update order_line quantities
    for (const [lineId, qty] of editQuantities) {
      const originalLine = order.order_lines.find((l) => l.id === lineId);
      if (originalLine && originalLine.quantity !== qty) {
        await supabase.from("order_lines").update({ quantity: qty }).eq("id", lineId);
      }
    }

    setSavingEdit(false);
    setEditing(false);
    await loadData();
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
    const bundle = line.bundles;
    const colorCount = isMultiQualityBundle(bundle)
      ? getColorCountFromItems(bundle)
      : (bundle?.bundle_colors?.length ?? 0);
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
          {editing ? (
            <>
              <Button
                variant="outline"
                onClick={cancelEditing}
                disabled={savingEdit}
              >
                <XCircle size={14} /> Annuleren
              </Button>
              <Button
                onClick={saveEdits}
                disabled={savingEdit}
              >
                <Save size={14} /> {savingEdit ? "Opslaan..." : "Opslaan"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={startEditing}
              >
                <Pencil size={14} /> Bewerken
              </Button>
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 size={14} /> {deleting ? "Verwijderen..." : "Verwijderen"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowInvoice(true)}
              >
                <FileText size={14} /> Kostenoverzicht
              </Button>
              <Button
                variant="outline"
                onClick={() => setPakbonOpen(true)}
              >
                <Printer size={14} /> Pakbon
              </Button>
              <Button
                variant="outline"
                onClick={() => setStickerOpen(true)}
              >
                <Printer size={14} /> Print alle stickers
              </Button>
            </>
          )}
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
              {editing ? (
                <input
                  type="date"
                  value={editDeliveryDate}
                  onChange={(e) => setEditDeliveryDate(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1 text-sm text-card-foreground"
                />
              ) : (
                <p className="text-sm font-semibold text-card-foreground">
                  {formatDate(order.delivery_date)}
                </p>
              )}
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

      {/* Verzendadres & Collectieprijs */}
      {editing ? (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verzendadres</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input placeholder="Straat" value={editShippingStreet} onChange={(e) => setEditShippingStreet(e.target.value)} />
            <Input placeholder="Postcode" value={editShippingPostalCode} onChange={(e) => setEditShippingPostalCode(e.target.value)} />
            <Input placeholder="Stad" value={editShippingCity} onChange={(e) => setEditShippingCity(e.target.value)} />
            <Input placeholder="Land" value={editShippingCountry} onChange={(e) => setEditShippingCountry(e.target.value)} />
          </div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Collectieprijs (ex BTW)</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">&euro;</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={editCollectionPrice}
              onChange={(e) => setEditCollectionPrice(e.target.value)}
              className="w-32"
            />
          </div>
        </div>
      ) : (
        ((order.shipping_street || order.shipping_city) || (order.collection_price_cents != null && order.collection_price_cents > 0)) && (
          <div className="rounded-2xl bg-card p-4 ring-1 ring-border space-y-2">
            {(order.shipping_street || order.shipping_city) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Verzendadres</span>
                <span className="font-medium text-card-foreground text-sm text-right max-w-[60%]">
                  {[order.shipping_street, order.shipping_postal_code, order.shipping_city, order.shipping_country]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            )}
            {order.collection_price_cents != null && order.collection_price_cents > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Collectieprijs</span>
                <span className="font-medium text-card-foreground text-sm">
                  &euro;{(order.collection_price_cents / 100).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )
      )}

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
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kleur</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Aantal</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Voorraad</th>
                </tr>
              </thead>
              <tbody>
                {order.order_lines.map((line) => {
                  const bundle = line.bundles;
                  if (!bundle) return null;
                  const multiQ = isMultiQualityBundle(bundle);

                  // Build per-item rows
                  type ItemRow = { qualityName: string; colorCode: string; colorName: string; stockKey: string };
                  let items: ItemRow[] = [];

                  if (multiQ) {
                    items = [...(bundle.bundle_items ?? [])]
                      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                      .map((bi) => {
                        const qId = bi.samples?.quality_id ?? "";
                        const cId = bi.samples?.color_code_id ?? "";
                        const dId = bi.samples?.dimension_id ?? "";
                        const qName = clientQualityNames.get(qId) ?? bi.samples?.qualities?.name ?? "Onbekend";
                        return {
                          qualityName: qName,
                          colorCode: bi.samples?.color_codes?.code ?? "",
                          colorName: bi.samples?.color_codes?.name ?? "",
                          stockKey: `${line.id}|${qId}|${cId}|${dId}`,
                        };
                      });
                  } else {
                    const karpiName = bundle.qualities?.name ?? "Onbekend";
                    const qualityName = clientQualityNames.get(bundle.quality_id) ?? karpiName;
                    items = [...(bundle.bundle_colors ?? [])]
                      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                      .map((bc) => ({
                        qualityName,
                        colorCode: bc.color_codes?.code ?? "",
                        colorName: bc.color_codes?.name ?? "",
                        stockKey: `${line.id}|${bundle.quality_id}|${bc.color_code_id}|${bundle.dimension_id}`,
                      }));
                  }

                  return items.map((item, j) => {
                    const itemHasStock = bundleStockStatus.get(item.stockKey) ?? false;
                    return (
                      <tr
                        key={`${line.id}-${j}`}
                        className={`transition-colors hover:bg-muted/30 ${j === items.length - 1 ? "border-b border-border/50" : "border-b border-border/20"}`}
                      >
                        <td className="px-4 py-2 font-medium text-card-foreground">
                          {j === 0 ? bundle.name : ""}
                        </td>
                        <td className="px-4 py-2 text-card-foreground">
                          {item.qualityName}
                        </td>
                        <td className="px-4 py-2 text-card-foreground">
                          {item.colorCode}
                          {item.colorName && item.colorName !== item.colorCode
                            ? <span className="ml-1.5 text-muted-foreground">— {item.colorName}</span>
                            : null}
                        </td>
                        <td className="px-4 py-2 text-right text-card-foreground">
                          {editing && j === 0 ? (
                            <input
                              type="number"
                              min="1"
                              value={editQuantities.get(line.id) ?? line.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1;
                                setEditQuantities((prev) => new Map(prev).set(line.id, val));
                              }}
                              className="w-16 rounded border border-border bg-background px-2 py-1 text-right text-sm"
                            />
                          ) : (
                            line.quantity
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {itemHasStock ? (
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
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Accessoires */}
      {orderAccessories.length > 0 && (
        <div className="rounded-2xl bg-card ring-1 ring-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h3 className="text-sm font-semibold text-card-foreground">Accessoires</h3>
          </div>
          <div className="divide-y divide-border/50">
            {orderAccessories.map((acc, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-card-foreground">{acc.quantity}&times; {acc.name}</span>
                <span className="text-muted-foreground">€{((acc.quantity * acc.price_cents) / 100).toFixed(2)} ex BTW</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {editing ? (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Opmerkingen
          </h3>
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={3}
            placeholder="Opmerkingen bij deze order..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      ) : order.notes ? (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Opmerkingen
          </h3>
          <p className="text-sm text-card-foreground">{order.notes}</p>
        </div>
      ) : null}

      {/* Factuur / Kostenoverzicht overlay */}
      {showInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowInvoice(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-background p-6 ring-1 ring-border shadow-xl max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setShowInvoice(false)}
              className="absolute top-3 right-3 rounded-lg p-1 text-muted-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>

            <div className="text-center mb-5">
              <h3 className="text-lg font-bold text-card-foreground">Kostenoverzicht</h3>
              <p className="text-xs text-muted-foreground">{order.order_number} — {order.clients?.name}</p>
            </div>

            {/* Klantgegevens */}
            <div className="rounded-lg bg-muted/30 p-3 mb-4 text-xs space-y-1">
              <div className="font-semibold text-card-foreground">{order.clients?.name}</div>
              {(order.shipping_street || order.shipping_city) && (
                <div className="text-muted-foreground">
                  {[order.shipping_street, order.shipping_postal_code, order.shipping_city, order.shipping_country]
                    .filter(Boolean).join(", ")}
                </div>
              )}
            </div>

            {/* Ordergegevens */}
            <div className="text-xs space-y-1.5 mb-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collectie</span>
                <span className="text-card-foreground">{order.collections?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Leverdatum</span>
                <span className="text-card-foreground">{formatDate(order.delivery_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bundels</span>
                <span className="text-card-foreground">{totalBundels}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stalen</span>
                <span className="text-card-foreground">{totalStalen}</span>
              </div>
            </div>

            {/* Kostenregels */}
            <div className="rounded-lg ring-1 ring-border overflow-hidden text-xs mb-4">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Omschrijving</th>
                    <th className="px-3 py-2 text-right font-medium">Bedrag ex BTW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {order.collection_price_cents != null && order.collection_price_cents > 0 && (
                    <tr>
                      <td className="px-3 py-2 text-card-foreground">Collectie {order.collections?.name}</td>
                      <td className="px-3 py-2 text-right text-card-foreground">
                        €{(order.collection_price_cents / 100).toFixed(2)}
                      </td>
                    </tr>
                  )}
                  {orderAccessories.map((acc, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-card-foreground">
                        {acc.quantity}&times; {acc.name}
                        <span className="text-muted-foreground ml-1">(€{(acc.price_cents / 100).toFixed(2)}/st)</span>
                      </td>
                      <td className="px-3 py-2 text-right text-card-foreground">
                        €{((acc.quantity * acc.price_cents) / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {(order.collection_price_cents == null || order.collection_price_cents === 0) && orderAccessories.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-3 text-center text-muted-foreground">Geen prijzen beschikbaar</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Totalen */}
              {(() => {
                const collPrice = (order.collection_price_cents ?? 0) / 100;
                const accTotal = orderAccessories.reduce((s, a) => s + (a.quantity * a.price_cents) / 100, 0);
                const subtotal = collPrice + accTotal;
                if (subtotal === 0) return null;
                const btw = subtotal * 0.21;
                const total = subtotal * 1.21;
                return (
                  <div className="bg-muted/30">
                    <div className="flex justify-between px-3 py-1.5 text-xs text-muted-foreground border-t border-border">
                      <span>Subtotaal ex BTW</span>
                      <span className="font-medium text-card-foreground">€{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 text-xs text-muted-foreground border-t border-border">
                      <span>BTW 21%</span>
                      <span className="text-card-foreground">€{btw.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2.5 text-xs border-t-2 border-border">
                      <span className="font-bold text-card-foreground">Totaal incl BTW</span>
                      <span className="font-bold text-card-foreground text-sm">€{total.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {order.notes && (
              <div className="text-xs mb-4">
                <span className="text-muted-foreground">Opmerkingen: </span>
                <span className="text-card-foreground">{order.notes}</span>
              </div>
            )}

            <Button size="sm" variant="outline" className="w-full" onClick={() => setShowInvoice(false)}>
              Sluiten
            </Button>
          </div>
        </div>
      )}

      {/* Pakbon modal */}
      <PackingSlip
        orderId={order.id}
        clientId={order.client_id}
        open={pakbonOpen}
        onOpenChange={setPakbonOpen}
      />

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
