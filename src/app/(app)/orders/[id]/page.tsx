"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Printer,
  Calendar,
  Layers,
  Pencil,
  Save,
  XCircle,
  Trash2,
  AlertTriangle,
  X,
  Plus,
  Minus,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { StickerPrint } from "@/components/sticker-print";
import { PackingSlip } from "@/components/packing-slip";
import { getOrderFulfillment, type Fulfillment, type FulfillmentLine } from "@/lib/order-fulfillment";
import { readVoorraadbeeld } from "@/lib/voorraadbeeld/snapshot";
import { buildFulfillability } from "@/lib/voorraadbeeld/fulfillability";
import Link from "next/link";

/* ─── Types ──────────────────────────────────────────── */

interface ClientOption { id: string; name: string; price_list_nr: string | null; }
interface SampleArticle {
  id: string; article_number: string; quality_id: string; color_code_id: string; dimension_id: string;
  quality_name: string; quality_code: string; color_code: string; color_name: string; hex_color: string | null; dimension_name: string;
}
interface BundleOption {
  id: string; name: string; quality_name: string; dimension_name: string;
  colors: { code: string; name: string; hex_color: string | null }[];
}
interface CollectionOption { id: string; name: string; bundle_ids: string[]; }

/* ─── Helpers ──────────────────────────────────────────── */

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
}

function statusLabel(status: string) {
  switch (status) {
    case "picking_ready": return "Klaar om te picken";
    case "restock_needed": return "Voorraad aanvullen";
    case "completed": return "Gereed";
    default: return status;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "picking_ready": return "bg-green-100 text-green-800";
    case "restock_needed": return "bg-amber-100 text-amber-800";
    case "completed": return "bg-green-600 text-white";
    default: return "bg-gray-100 text-gray-600";
  }
}

function generateWeekOptions(count: number) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() + 3 * 7);
  const options: { label: string; value: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    const jan4 = new Date(Date.UTC(d.getFullYear(), 0, 4));
    const dow = jan4.getUTCDay() || 7;
    const mon = new Date(jan4);
    mon.setUTCDate(jan4.getUTCDate() - dow + 1);
    const w = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + dow) / 7);
    const dateStr = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() || 7) + 1)).toISOString().slice(0, 10);
    if (options.length > 0 && options[options.length - 1].value === dateStr) continue;
    options.push({ label: `Week ${w} (${d.getFullYear()})`, value: dateStr });
  }
  return options;
}

/* ─── Component ──────────────────────────────────────── */

export default function OrderDetailPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;

  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);
  const [legacyLineCount, setLegacyLineCount] = useState(0);
  const [assignedBySample, setAssignedBySample] = useState<Map<string, { needed: number; assigned: number }>>(new Map());
  const [finishedBySample, setFinishedBySample] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [pakbonOpen, setPakbonOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPakbon, setUpdatingPakbon] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [werkbonnen, setWerkbonnen] = useState<{ id: string; created_at: string; status: string }[]>([]);

  // Edit mode — basis
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editDeliveryDate, setEditDeliveryDate] = useState("");
  const [editReference, setEditReference] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editShippingStreet, setEditShippingStreet] = useState("");
  const [editShippingPostalCode, setEditShippingPostalCode] = useState("");
  const [editShippingCity, setEditShippingCity] = useState("");
  const [editShippingCountry, setEditShippingCountry] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [editQuantities, setEditQuantities] = useState<Map<string, number>>(new Map());
  const [linesToDelete, setLinesToDelete] = useState<Set<string>>(new Set());

  // Edit mode — artikelen toevoegen
  const [showAddArticles, setShowAddArticles] = useState(false);
  const [addTab, setAddTab] = useState<"staaltjes" | "bundels" | "collecties">("staaltjes");
  const [addSearch, setAddSearch] = useState("");
  const [newSampleQtys, setNewSampleQtys] = useState<Map<string, number>>(new Map());
  const [newBundleQtys, setNewBundleQtys] = useState<Map<string, number>>(new Map());
  const [newBundleCollectionMap, setNewBundleCollectionMap] = useState<Map<string, string>>(new Map());
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [availableSamples, setAvailableSamples] = useState<SampleArticle[]>([]);
  const [availableBundles, setAvailableBundles] = useState<BundleOption[]>([]);
  const [availableCollections, setAvailableCollections] = useState<CollectionOption[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  const weekOptions = generateWeekOptions(26);

  const loadData = useCallback(async () => {
    const ff = await getOrderFulfillment(supabase, orderId);
    setFulfillment(ff);

    const vb = await readVoorraadbeeld(supabase, new Date());
    const fulfillability = buildFulfillability(vb);
    const myFulfillment = fulfillability.get(orderId);

    const assignedMap = new Map<string, { needed: number; assigned: number }>();
    if (myFulfillment) {
      for (const line of myFulfillment.lines) {
        const cur = assignedMap.get(line.sampleId) ?? { needed: 0, assigned: 0 };
        cur.needed += line.needed;
        cur.assigned += line.assigned;
        assignedMap.set(line.sampleId, cur);
      }
    }
    setAssignedBySample(assignedMap);

    const finishedMap = new Map<string, number>();
    if (ff) {
      for (const sampleId of new Set(ff.lines.map((l) => l.sampleId))) {
        const sample = vb.samplesById.get(sampleId);
        if (sample) {
          finishedMap.set(sampleId, vb.finishedStock.get(`${sample.qualityId}|${sample.colorCodeId}|${sample.dimensionId}`) ?? 0);
        }
      }
    }
    setFinishedBySample(finishedMap);

    if (myFulfillment) {
      setLegacyLineCount(myFulfillment.legacyLineCount);
    } else {
      const { count: legacyCount } = await supabase
        .from("order_lines").select("id", { count: "exact", head: true })
        .eq("order_id", orderId).is("sample_id", null);
      setLegacyLineCount(legacyCount ?? 0);
    }

    setLoading(false);
  }, [supabase, orderId]);

  useEffect(() => {
    loadData();
    (async () => {
      const { data: wbOrders } = await (supabase as any).from("werkbon_orders").select("werkbon_id").eq("order_id", orderId);
      if (!wbOrders?.length) return;
      const { data: wbs } = await (supabase as any).from("werkbonnen").select("id, created_at, status")
        .in("id", wbOrders.map((w: any) => w.werkbon_id)).order("created_at", { ascending: false });
      setWerkbonnen(wbs ?? []);
    })();
  }, [loadData, supabase, orderId]);

  async function loadEditData() {
    setLoadingArticles(true);
    const [{ data: clientsData }, { data: samplesData }, { data: bundlesData }, { data: collData }] = await Promise.all([
      supabase.from("clients").select("id, name, price_list_nr").eq("active", true).order("name"),
      supabase.from("samples").select("id, article_number, quality_id, color_code_id, dimension_id, qualities(name,code), color_codes(code,name,hex_color), sample_dimensions(name)").eq("active", true).order("article_number"),
      supabase.from("bundles").select("id, name, qualities(name,code), sample_dimensions(name), bundle_colors(color_codes(code,name,hex_color))").eq("active", true).order("name"),
      supabase.from("collections").select("id, name, collection_bundles(bundle_id)").eq("active", true).order("name"),
    ]);
    setClients((clientsData as ClientOption[]) ?? []);
    setAvailableSamples(((samplesData ?? []) as any[]).map((s) => ({
      id: s.id, article_number: s.article_number, quality_id: s.quality_id,
      color_code_id: s.color_code_id, dimension_id: s.dimension_id,
      quality_name: s.qualities?.name ?? "", quality_code: s.qualities?.code ?? "",
      color_code: s.color_codes?.code ?? "", color_name: s.color_codes?.name ?? "",
      hex_color: s.color_codes?.hex_color ?? null, dimension_name: s.sample_dimensions?.name ?? "",
    })));
    setAvailableBundles(((bundlesData ?? []) as any[]).map((b) => ({
      id: b.id, name: b.name, quality_name: b.qualities?.name ?? "", dimension_name: b.sample_dimensions?.name ?? "",
      colors: (b.bundle_colors ?? []).map((bc: any) => bc.color_codes).filter(Boolean),
    })));
    setAvailableCollections(((collData ?? []) as any[]).map((c) => ({
      id: c.id, name: c.name, bundle_ids: (c.collection_bundles ?? []).map((cb: any) => cb.bundle_id),
    })));
    setLoadingArticles(false);
  }

  function startEditing() {
    if (!fulfillment) return;
    setEditDeliveryDate(fulfillment.order.deliveryDate);
    setEditReference(fulfillment.order.reference ?? "");
    setEditNotes(fulfillment.order.notes ?? "");
    setEditShippingStreet(fulfillment.order.shippingStreet ?? "");
    setEditShippingPostalCode(fulfillment.order.shippingPostalCode ?? "");
    setEditShippingCity(fulfillment.order.shippingCity ?? "");
    setEditShippingCountry(fulfillment.order.shippingCountry ?? "Nederland");
    setEditClientId(fulfillment.client.id);
    const qMap = new Map<string, number>();
    for (const line of fulfillment.lines) qMap.set(line.lineId, line.quantity);
    setEditQuantities(qMap);
    setLinesToDelete(new Set());
    setNewSampleQtys(new Map());
    setNewBundleQtys(new Map());
    setNewBundleCollectionMap(new Map());
    setShowAddArticles(false);
    setAddSearch("");
    setEditing(true);
    if (availableSamples.length === 0) loadEditData();
    else if (clients.length === 0) supabase.from("clients").select("id, name, price_list_nr").eq("active", true).order("name").then(({ data }) => setClients((data as ClientOption[]) ?? []));
  }

  async function saveEdits() {
    if (!fulfillment) return;
    setSavingEdit(true);

    // 1. Order update
    await supabase.from("orders").update({
      client_id: editClientId || fulfillment.client.id,
      delivery_date: editDeliveryDate,
      reference: editReference.trim() || null,
      notes: editNotes.trim() || null,
      shipping_street: editShippingStreet.trim() || null,
      shipping_postal_code: editShippingPostalCode.trim() || null,
      shipping_city: editShippingCity.trim() || null,
      shipping_country: editShippingCountry.trim() || null,
    }).eq("id", fulfillment.order.id);

    // 2. Aantallen bijwerken
    for (const [lineId, qty] of editQuantities) {
      const original = fulfillment.lines.find((l) => l.lineId === lineId);
      if (original && original.quantity !== qty && !linesToDelete.has(lineId)) {
        await supabase.from("order_lines").update({ quantity: qty }).eq("id", lineId);
      }
    }

    // 3. Verwijderde regels
    if (linesToDelete.size > 0) {
      await supabase.from("order_lines").delete().in("id", [...linesToDelete]);
    }

    // 4. Nieuwe losse stalen
    const newLines: { order_id: string; sample_id: string; bundle_id?: string; collection_id?: string; quantity: number }[] = [];
    for (const [sampleId, qty] of newSampleQtys) {
      if (qty > 0) newLines.push({ order_id: fulfillment.order.id, sample_id: sampleId, quantity: qty });
    }

    // 5. Nieuwe bundels uitklappen
    if (newBundleQtys.size > 0) {
      const bundleIds = Array.from(newBundleQtys.keys());
      const { data: bundleData } = await supabase
        .from("bundles").select("id, quality_id, dimension_id, bundle_colors(color_code_id), bundle_items(sample_id)")
        .in("id", bundleIds);
      for (const bundle of (bundleData ?? []) as any[]) {
        const qty = newBundleQtys.get(bundle.id) ?? 1;
        const collectionId = newBundleCollectionMap.get(bundle.id);
        const hasItems = bundle.bundle_items?.length > 0;
        if (hasItems) {
          for (const bi of bundle.bundle_items) {
            if (bi.sample_id) newLines.push({ order_id: fulfillment.order.id, sample_id: bi.sample_id, bundle_id: bundle.id, collection_id: collectionId, quantity: qty });
          }
        } else if (bundle.bundle_colors?.length > 0) {
          const colorIds = bundle.bundle_colors.map((bc: any) => bc.color_code_id);
          const { data: matchedSamples } = await supabase.from("samples").select("id")
            .eq("quality_id", bundle.quality_id).eq("dimension_id", bundle.dimension_id).in("color_code_id", colorIds);
          for (const s of (matchedSamples ?? [])) {
            newLines.push({ order_id: fulfillment.order.id, sample_id: s.id, bundle_id: bundle.id, collection_id: collectionId, quantity: qty });
          }
        }
      }
    }

    if (newLines.length > 0) await supabase.from("order_lines").insert(newLines);

    setSavingEdit(false);
    setEditing(false);
    await loadData();
  }

  async function handleDelete() {
    if (!fulfillment) return;
    if (!confirm(`Order "${fulfillment.order.orderNumber}" definitief verwijderen?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/orders/${fulfillment.order.id}`, { method: "DELETE" });
    if (res.ok) { router.push("/orders"); }
    else {
      const body = await res.json().catch(() => null);
      alert(`Verwijderen mislukt: ${body?.error ?? "onbekende fout"}`);
      setDeleting(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!fulfillment) return;
    setUpdatingStatus(true);
    const completedAt = newStatus === "completed" ? new Date().toISOString() : null;
    await supabase.from("orders").update({ status: newStatus, completed_at: completedAt } as any).eq("id", fulfillment.order.id);
    setFulfillment({ ...fulfillment, order: { ...fulfillment.order, status: newStatus, completedAt } });
    setUpdatingStatus(false);
  }

  async function handleTogglePakbonPrinted() {
    if (!fulfillment) return;
    setUpdatingPakbon(true);
    const newVal = !fulfillment.order.pakbonPrinted;
    await supabase.from("orders").update({ pakbon_printed: newVal } as any).eq("id", fulfillment.order.id);
    setFulfillment({ ...fulfillment, order: { ...fulfillment.order, pakbonPrinted: newVal } });
    setUpdatingPakbon(false);
  }

  function toggleDeleteLine(lineId: string) {
    setLinesToDelete((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
      return next;
    });
  }

  function applyCollection(col: CollectionOption) {
    setNewBundleQtys((prev) => {
      const next = new Map(prev);
      for (const bid of col.bundle_ids) next.set(bid, (next.get(bid) ?? 0) + 1);
      return next;
    });
    setNewBundleCollectionMap((prev) => {
      const next = new Map(prev);
      for (const bid of col.bundle_ids) if (!next.has(bid)) next.set(bid, col.id);
      return next;
    });
  }

  if (loading) return <div className="space-y-6 p-6"><p className="text-sm text-muted-foreground">Laden...</p></div>;
  if (!fulfillment) return <div className="space-y-6 p-6"><p className="text-sm text-muted-foreground">Order niet gevonden.</p></div>;

  const { order, client, lines, totals } = fulfillment;

  const filteredSamples = availableSamples.filter((s) => {
    if (!addSearch) return true;
    const q = addSearch.toLowerCase();
    return s.article_number.toLowerCase().includes(q) || s.quality_name.toLowerCase().includes(q) || s.color_code.toLowerCase().includes(q) || s.color_name.toLowerCase().includes(q);
  });
  const filteredBundles = availableBundles.filter((b) => !addSearch || b.name.toLowerCase().includes(addSearch.toLowerCase()) || b.quality_name.toLowerCase().includes(addSearch.toLowerCase()));
  const filteredCollections = availableCollections.filter((c) => !addSearch || c.name.toLowerCase().includes(addSearch.toLowerCase()));

  const newSampleTotal = Array.from(newSampleQtys.values()).reduce((s, q) => s + q, 0);
  const newBundleTotal = Array.from(newBundleQtys.values()).reduce((s, q) => s + q, 0);

  return (
    <div className="space-y-6 p-6">
      <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Terug naar orders
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">{order.orderNumber}</h2>
          {editing ? (
            <select
              value={editClientId}
              onChange={(e) => setEditClientId(e.target.value)}
              className="mt-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.price_list_nr ? ` (${c.price_list_nr})` : ""}</option>
              ))}
            </select>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              <Link href={`/klanten/${client.id}`} className="hover:text-foreground hover:underline underline-offset-2 transition-colors">
                {client.name}
              </Link>
              {client.priceListNr && <span className="ml-2 font-mono text-xs text-amber-700">{client.priceListNr}</span>}
            </p>
          )}
          {!editing && order.reference && (
            <p className="mt-1 text-sm font-medium text-foreground">
              <span className="text-muted-foreground font-normal">Ref:</span> {order.reference}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={savingEdit}><XCircle size={14} /> Annuleren</Button>
              <Button onClick={saveEdits} disabled={savingEdit}><Save size={14} /> {savingEdit ? "Opslaan..." : "Opslaan"}</Button>
            </>
          ) : (
            <>
              {order.status === "completed" ? (
                <Button
                  variant="outline"
                  onClick={() => handleStatusChange("picking_ready")}
                  disabled={updatingStatus}
                  className="text-muted-foreground"
                >
                  <RotateCcw size={14} /> Ongedaan maken
                </Button>
              ) : (
                <Button
                  onClick={() => handleStatusChange("completed")}
                  disabled={updatingStatus}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  <CheckCircle2 size={14} /> Gereed melden
                </Button>
              )}
              <Button variant="outline" onClick={startEditing}><Pencil size={14} /> Bewerken</Button>
              <Button variant="outline" onClick={handleDelete} disabled={deleting} className="text-destructive hover:bg-destructive/10">
                <Trash2 size={14} /> {deleting ? "Verwijderen..." : "Verwijderen"}
              </Button>
              <Button variant="outline" onClick={() => setPakbonOpen(true)}><Printer size={14} /> Pakbon afdrukken</Button>
              <Button variant="outline" onClick={() => setStickerOpen(true)}><Printer size={14} /> Stickers</Button>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard icon={<Calendar size={18} />} color="bg-blue-100 text-blue-700" label="Levertijd">
          {editing ? (
            <select
              value={editDeliveryDate}
              onChange={(e) => setEditDeliveryDate(e.target.value)}
              className="mt-1 rounded-lg border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {/* Huidige datum als die niet in de weekopties staat */}
              {!weekOptions.find((w) => w.value === editDeliveryDate) && (
                <option value={editDeliveryDate}>{formatDate(editDeliveryDate)}</option>
              )}
              {weekOptions.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-semibold text-card-foreground">{formatDate(order.deliveryDate)}</span>
          )}
        </SummaryCard>
        <SummaryCard icon={<Layers size={18} />} color="bg-purple-100 text-purple-700" label="Stalen totaal">
          <span className="text-sm font-semibold text-card-foreground">{totals.totalQuantity}</span>
        </SummaryCard>
        {order.completedAt && (
          <SummaryCard icon={<CheckCircle2 size={18} />} color="bg-green-100 text-green-700" label="Gereed gemeld op">
            <span className="text-sm font-semibold text-card-foreground">
              {new Date(order.completedAt).toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
          </SummaryCard>
        )}
      </div>

      {/* Werkbonnen */}
      {werkbonnen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Werkbonnen:</span>
          {werkbonnen.map((wb) => (
            <a key={wb.id} href={`/werkbonnen/${wb.id}`}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 transition-colors hover:opacity-80 ${wb.status === "completed" ? "bg-green-50 text-green-700 ring-green-200" : "bg-blue-50 text-blue-700 ring-blue-200"}`}>
              <span>{wb.status === "completed" ? "✓" : "●"}</span>
              Werkbon {new Date(wb.created_at).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit" })}
              <span className="font-normal opacity-70">{wb.status === "completed" ? "voltooid" : "open"}</span>
            </a>
          ))}
        </div>
      )}

      {/* Status */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Status:</span>
        <select value={order.status} onChange={(e) => handleStatusChange(e.target.value)} disabled={updatingStatus}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="picking_ready">Klaar om te picken</option>
          <option value="restock_needed">Voorraad aanvullen</option>
          <option value="completed">Gereed</option>
        </select>
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}>
          {statusLabel(order.status)}
        </span>
        <div className="h-4 w-px bg-border" />
        <button
          onClick={handleTogglePakbonPrinted}
          disabled={updatingPakbon}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
            order.pakbonPrinted
              ? "bg-blue-100 text-blue-800 ring-blue-200 hover:bg-blue-200"
              : "bg-gray-100 text-gray-500 ring-gray-200 hover:bg-gray-200"
          }`}
        >
          <Printer size={12} />
          Pakbon geprint
        </button>
      </div>

      {/* Edit: referentie + adres */}
      {editing && (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border space-y-4">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Referentie</h3>
            <Input placeholder="Bijv. PO-12345" value={editReference} onChange={(e) => setEditReference(e.target.value)} />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verzendadres</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input placeholder="Straat" value={editShippingStreet} onChange={(e) => setEditShippingStreet(e.target.value)} />
              <Input placeholder="Postcode" value={editShippingPostalCode} onChange={(e) => setEditShippingPostalCode(e.target.value)} />
              <Input placeholder="Stad" value={editShippingCity} onChange={(e) => setEditShippingCity(e.target.value)} />
              <Input placeholder="Land" value={editShippingCountry} onChange={(e) => setEditShippingCountry(e.target.value)} />
            </div>
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opmerkingen</h3>
            <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
      )}

      {/* Adres (view mode) */}
      {!editing && (order.shippingStreet || order.shippingCity) && (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Verzendadres</span>
            <span className="text-sm text-card-foreground text-right max-w-[60%]">
              {[order.shippingStreet, order.shippingPostalCode, order.shippingCity, order.shippingCountry].filter(Boolean).join(", ")}
            </span>
          </div>
        </div>
      )}

      {/* Legacy banner */}
      {legacyLineCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Legacy bundle-orderregels gedetecteerd ({legacyLineCount})</p>
            <p className="mt-1 text-xs">
              Deze regels zijn nog niet uitgesplitst naar artikel-niveau. Run de migratie{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">20260503_order_lines_sample_id.sql</code> om ze om te zetten.
            </p>
          </div>
        </div>
      )}

      {/* Factuursamenvatting */}
      {!editing && lines.length > 0 && <InvoiceSummary lines={lines} orderId={orderId} onSaved={loadData} />}

      {/* Order lines */}
      {lines.length === 0 && legacyLineCount === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Geen orderregels.</p>
        </div>
      ) : lines.length > 0 && (
        <OrderLinesTable
          lines={lines}
          editing={editing}
          editQuantities={editQuantities}
          setEditQuantities={setEditQuantities}
          linesToDelete={linesToDelete}
          onToggleDelete={toggleDeleteLine}
          assignedBySample={assignedBySample}
          finishedBySample={finishedBySample}
        />
      )}

      {/* Artikelen toevoegen (edit mode) */}
      {editing && (
        <div className="rounded-2xl ring-1 ring-border overflow-hidden">
          <button
            onClick={() => setShowAddArticles((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium text-foreground"
          >
            <span className="flex items-center gap-2">
              <Plus size={16} />
              Artikelen toevoegen
              {(newSampleTotal + newBundleTotal) > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {newSampleTotal + newBundleTotal}
                </span>
              )}
            </span>
            {showAddArticles ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showAddArticles && (
            <div className="p-4 space-y-3 border-t border-border">
              {/* Tabs */}
              <div className="flex gap-1 border-b border-border">
                {(["staaltjes", "bundels", "collecties"] as const).map((tab) => {
                  const count = tab === "staaltjes" ? newSampleQtys.size : tab === "bundels" ? newBundleQtys.size : 0;
                  return (
                    <button key={tab} onClick={() => setAddTab(tab)}
                      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${addTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      {count > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground leading-none">{count}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Zoeken */}
              <div className="relative">
                <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
                <Input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder={`Zoek ${addTab}...`} className="pl-8" />
              </div>

              {loadingArticles ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Laden...</p>
              ) : (
                <>
                  {/* Tab: Staaltjes */}
                  {addTab === "staaltjes" && (
                    <div className="overflow-hidden rounded-xl ring-1 ring-border max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted/50">
                          <tr className="border-b border-border">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Artikel</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Afm.</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Aantal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSamples.slice(0, 200).map((s) => {
                            const qty = newSampleQtys.get(s.id) ?? 0;
                            return (
                              <tr key={s.id} className="border-b border-border/50">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="h-4 w-4 shrink-0 rounded" style={{ backgroundColor: s.hex_color || "#e5e7eb" }} />
                                    <div>
                                      <div className="font-mono text-[10px] text-muted-foreground">{s.article_number}</div>
                                      <div>{s.quality_name} <span className="text-muted-foreground">{s.color_code}</span></div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{s.dimension_name}</td>
                                <td className="px-3 py-2 text-right">
                                  <div className="ml-auto flex items-center justify-end gap-1">
                                    <button onClick={() => setNewSampleQtys((p) => { const n = new Map(p); const v = (n.get(s.id) ?? 0) - 1; if (v <= 0) n.delete(s.id); else n.set(s.id, v); return n; })} disabled={qty === 0} className="rounded border border-border p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><Minus size={10} /></button>
                                    <span className="w-8 text-center">{qty}</span>
                                    <button onClick={() => setNewSampleQtys((p) => new Map(p).set(s.id, (p.get(s.id) ?? 0) + 1))} className="rounded border border-border p-0.5 text-muted-foreground hover:bg-muted"><Plus size={10} /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tab: Bundels */}
                  {addTab === "bundels" && (
                    <div className="overflow-hidden rounded-xl ring-1 ring-border max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted/50">
                          <tr className="border-b border-border">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bundel</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Aantal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredBundles.map((b) => {
                            const qty = newBundleQtys.get(b.id) ?? 0;
                            return (
                              <tr key={b.id} className="border-b border-border/50">
                                <td className="px-3 py-2">
                                  <div className="font-medium">{b.name}</div>
                                  <div className="text-xs text-muted-foreground">{b.quality_name} · {b.colors.length} kleur{b.colors.length === 1 ? "" : "en"}</div>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="ml-auto flex items-center justify-end gap-1">
                                    <button onClick={() => setNewBundleQtys((p) => { const n = new Map(p); const v = (n.get(b.id) ?? 0) - 1; if (v <= 0) n.delete(b.id); else n.set(b.id, v); return n; })} disabled={qty === 0} className="rounded border border-border p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><Minus size={10} /></button>
                                    <span className="w-8 text-center">{qty}</span>
                                    <button onClick={() => setNewBundleQtys((p) => new Map(p).set(b.id, (p.get(b.id) ?? 0) + 1))} className="rounded border border-border p-0.5 text-muted-foreground hover:bg-muted"><Plus size={10} /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tab: Collecties */}
                  {addTab === "collecties" && (
                    <div className="overflow-hidden rounded-xl ring-1 ring-border max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted/50">
                          <tr className="border-b border-border">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Collectie</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Bundels</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCollections.map((c) => (
                            <tr key={c.id} className="border-b border-border/50">
                              <td className="px-3 py-2 font-medium">{c.name}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{c.bundle_ids.length}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => applyCollection(c)}
                                  className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90">
                                  + Toevoegen
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notes (view mode) */}
      {!editing && order.notes && (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opmerkingen</h3>
          <p className="text-sm text-card-foreground">{order.notes}</p>
        </div>
      )}

      <PackingSlip orderId={order.id} clientId={client.id} open={pakbonOpen} onOpenChange={setPakbonOpen} />
      <StickerPrint orderId={order.id} clientId={client.id} open={stickerOpen} onOpenChange={setStickerOpen} />
    </div>
  );
}

function OrderLinesTable({
  lines, editing, editQuantities, setEditQuantities, linesToDelete, onToggleDelete, assignedBySample, finishedBySample,
}: {
  lines: FulfillmentLine[];
  editing: boolean;
  editQuantities: Map<string, number>;
  setEditQuantities: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  linesToDelete: Set<string>;
  onToggleDelete: (lineId: string) => void;
  assignedBySample: Map<string, { needed: number; assigned: number }>;
  finishedBySample: Map<string, number>;
}) {
  const bundleGroups = new Map<string, { name: string; collectionName: string | null; lines: FulfillmentLine[] }>();
  const looseLines: FulfillmentLine[] = [];
  for (const line of lines) {
    if (line.bundleId) {
      if (!bundleGroups.has(line.bundleId)) bundleGroups.set(line.bundleId, { name: line.bundleName ?? "Bundel", collectionName: line.collectionName ?? null, lines: [] });
      bundleGroups.get(line.bundleId)!.lines.push(line);
    } else {
      looseLines.push(line);
    }
  }
  const collectionGroups = new Map<string, typeof bundleGroups>();
  for (const [bundleId, group] of bundleGroups.entries()) {
    const key = group.collectionName ?? "—";
    if (!collectionGroups.has(key)) collectionGroups.set(key, new Map());
    collectionGroups.get(key)!.set(bundleId, group);
  }

  const thead = (
    <thead>
      <tr className="border-b border-border bg-muted/50">
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Artikel</th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Afm.</th>
        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Aantal</th>
        <th className="px-4 py-3 text-center font-medium text-muted-foreground">Toegewezen / Nodig</th>
        {editing && <th className="px-4 py-3 w-8" />}
      </tr>
    </thead>
  );

  const renderRow = (line: FulfillmentLine) => {
    const meta = assignedBySample.get(line.sampleId);
    const finished = finishedBySample.get(line.sampleId) ?? 0;
    const lineQty = editing ? editQuantities.get(line.lineId) ?? line.quantity : line.quantity;
    const assigned = Math.min(meta?.assigned ?? 0, lineQty);
    const ok = assigned >= lineQty;
    const deleted = linesToDelete.has(line.lineId);
    return (
      <tr key={line.lineId} className={`border-b border-border/30 transition-colors hover:bg-muted/30 ${deleted ? "opacity-40" : ""}`}>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 shrink-0 rounded" style={{ backgroundColor: line.hexColor ?? "#e5e7eb" }} />
            <div className="min-w-0">
              <div className={`font-mono text-[10px] text-muted-foreground ${deleted ? "line-through" : ""}`}>{line.articleNumber}</div>
              <div className={`text-card-foreground ${deleted ? "line-through" : ""}`}>
                {line.qualityName} <span className="text-muted-foreground">{line.colorCode}</span>
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">{line.dimensionName || "—"}</td>
        <td className="px-4 py-2.5 text-right">
          {editing && !deleted ? (
            <input type="number" min={1} value={lineQty}
              onChange={(e) => setEditQuantities((prev) => new Map(prev).set(line.lineId, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-16 rounded border border-border bg-background px-2 py-1 text-right" />
          ) : (
            <span className="text-card-foreground">{lineQty}</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-center">
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
            title={`Voorraad totaal: ${finished}`}>
            {assigned} / {lineQty}
          </span>
        </td>
        {editing && (
          <td className="px-2 py-2.5">
            <button onClick={() => onToggleDelete(line.lineId)}
              className={`rounded p-1 transition-colors ${deleted ? "text-green-600 hover:bg-green-50" : "text-muted-foreground hover:text-red-500 hover:bg-red-50"}`}
              title={deleted ? "Herstellen" : "Verwijderen"}>
              {deleted ? <Plus size={14} /> : <X size={14} />}
            </button>
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {Array.from(collectionGroups.entries()).map(([collName, bundles]) => {
        const totalLines = Array.from(bundles.values()).flatMap(g => g.lines);
        const totalQty = totalLines.reduce((s, l) => s + (editing ? editQuantities.get(l.lineId) ?? l.quantity : l.quantity), 0);
        return (
          <div key={collName} className="rounded-2xl border-2 border-foreground/10 overflow-hidden">
            <div className="bg-foreground/5 px-5 py-3 border-b border-foreground/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Collectie</p>
                <p className="text-base font-bold text-foreground">{collName}</p>
              </div>
              <span className="text-sm text-muted-foreground">{totalLines.length} stalen · {totalQty} stuks</span>
            </div>
            <div className="divide-y divide-border/50 px-4 pb-4 space-y-3 pt-3">
              {Array.from(bundles.entries()).map(([bundleId, group]) => {
                const groupQty = group.lines.reduce((s, l) => s + (editing ? editQuantities.get(l.lineId) ?? l.quantity : l.quantity), 0);
                const allOk = group.lines.every((l) => {
                  const qty = editing ? editQuantities.get(l.lineId) ?? l.quantity : l.quantity;
                  return Math.min(assignedBySample.get(l.sampleId)?.assigned ?? 0, qty) >= qty;
                });
                return (
                  <div key={bundleId} className="overflow-hidden rounded-xl ring-1 ring-border">
                    <div className={`flex items-center justify-between px-4 py-2 ${allOk ? "bg-green-50" : "bg-amber-50"}`}>
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Bundel</p>
                        <p className="text-sm font-semibold text-card-foreground">{group.name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{group.lines.length} stalen · {groupQty} stuks</span>
                    </div>
                    <table className="w-full text-sm">{thead}<tbody>{group.lines.map(renderRow)}</tbody></table>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {looseLines.length > 0 && (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          {bundleGroups.size > 0 && (
            <div className="border-b border-border bg-muted/30 px-4 py-2.5">
              <span className="text-sm font-semibold text-card-foreground">Losse stalen</span>
            </div>
          )}
          <table className="w-full text-sm">{thead}<tbody>{looseLines.map(renderRow)}</tbody></table>
        </div>
      )}
    </div>
  );
}

function InvoiceSummary({ lines, orderId, onSaved }: { lines: FulfillmentLine[]; orderId: string; onSaved: () => void }) {
  const supabase = createClient();
  const fmt = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editInput, setEditInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [bulkInput, setBulkInput] = React.useState("");
  const [bulkEditing, setBulkEditing] = React.useState(false);

  type InvoiceRow = {
    key: string; label: string; tag: string; priceCents: number | null;
    collectionId: string | null; bundleId: string | null; lineIds: string[];
  };

  const collectionRows = new Map<string, InvoiceRow>();
  const bundleRows = new Map<string, InvoiceRow>();
  const looseRows: InvoiceRow[] = [];

  for (const line of lines) {
    if (line.collectionName && line.collectionId) {
      if (!collectionRows.has(line.collectionId))
        collectionRows.set(line.collectionId, { key: `c:${line.collectionId}`, label: line.collectionName, tag: "Collectie", priceCents: line.priceCents, collectionId: line.collectionId, bundleId: null, lineIds: [] });
      collectionRows.get(line.collectionId)!.lineIds.push(line.lineId);
    } else if (line.bundleId && line.bundleName) {
      if (!bundleRows.has(line.bundleId))
        bundleRows.set(line.bundleId, { key: `b:${line.bundleId}`, label: line.bundleName, tag: "Bundel", priceCents: line.priceCents, collectionId: null, bundleId: line.bundleId, lineIds: [] });
      bundleRows.get(line.bundleId)!.lineIds.push(line.lineId);
    } else {
      looseRows.push({ key: `l:${line.lineId}`, label: `${line.qualityName} ${line.colorCode}`, tag: "Staal", priceCents: line.priceCents, collectionId: null, bundleId: null, lineIds: [line.lineId] });
    }
  }

  const allRows: InvoiceRow[] = [...Array.from(collectionRows.values()), ...Array.from(bundleRows.values()), ...looseRows];
  const total = allRows.reduce((s, r) => s + (r.priceCents ?? 0), 0);
  if (!allRows.some(r => r.priceCents != null)) return null;

  async function savePrice(row: InvoiceRow) {
    setSaving(true);
    const cents = Math.round(parseFloat(editInput.replace(",", ".")) * 100);
    const newPrice = isNaN(cents) || cents < 0 ? null : cents;
    await supabase.from("order_lines").update({ price_cents: newPrice } as any).in("id", row.lineIds);
    setSaving(false);
    setEditingKey(null);
    onSaved();
  }

  const allLineIds = allRows.flatMap(r => r.lineIds);

  async function setAllToZero() {
    setSaving(true);
    await supabase.from("order_lines").update({ price_cents: 0 } as any).in("id", allLineIds);
    setSaving(false);
    onSaved();
  }

  async function applyBulkTotal() {
    const newTotal = Math.round(parseFloat(bulkInput.replace(",", ".")) * 100);
    if (isNaN(newTotal) || newTotal < 0) return;
    setSaving(true);
    // Eerste rij krijgt het hele bedrag, de rest €0
    const [first, ...rest] = allRows;
    if (first) await supabase.from("order_lines").update({ price_cents: newTotal } as any).in("id", first.lineIds);
    if (rest.length > 0) await supabase.from("order_lines").update({ price_cents: 0 } as any).in("id", rest.flatMap(r => r.lineIds));
    setSaving(false);
    setBulkEditing(false);
    setBulkInput("");
    onSaved();
  }

  return (
    <div className="rounded-2xl ring-1 ring-border overflow-hidden">
      <div className="bg-muted/30 px-5 py-3 border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground">Factuursamenvatting</h3>
        <div className="flex items-center gap-2">
          {bulkEditing ? (
            <>
              <span className="text-xs text-muted-foreground">Totaal (€)</span>
              <input
                type="number" step="0.01" min="0" value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyBulkTotal(); if (e.key === "Escape") setBulkEditing(false); }}
                className="w-28 rounded border border-border bg-background px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
                placeholder="0,00"
              />
              <button onClick={applyBulkTotal} disabled={saving} className="rounded px-2.5 py-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving ? "…" : "Toepassen"}
              </button>
              <button onClick={() => setBulkEditing(false)} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Annuleer</button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setBulkEditing(true); setBulkInput((total / 100).toFixed(2)); }}
                className="rounded px-2.5 py-1 text-xs font-medium border border-border bg-card text-card-foreground hover:bg-muted"
              >
                Totaal instellen
              </button>
              <button
                onClick={setAllToZero}
                disabled={saving}
                className="rounded px-2.5 py-1 text-xs font-medium border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Alles op €0
              </button>
            </>
          )}
        </div>
      </div>
      <div className="divide-y divide-border/50">
        {allRows.map((row) => {
          const isEditing = editingKey === row.key;
          return (
            <div key={row.key} className="flex items-center justify-between px-5 py-2.5 text-sm gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{row.tag}</span>
                <span className="truncate text-card-foreground">{row.label}</span>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-muted-foreground text-xs">€</span>
                  <input
                    type="number" step="0.01" min="0" value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") savePrice(row); if (e.key === "Escape") setEditingKey(null); }}
                    className="w-24 rounded border border-border bg-background px-2 py-0.5 text-right text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                  <button onClick={() => savePrice(row)} disabled={saving} className="rounded px-2 py-0.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? "…" : "OK"}
                  </button>
                  <button onClick={() => setEditingKey(null)} className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">✕</button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditInput(row.priceCents != null ? (row.priceCents / 100).toFixed(2) : ""); setEditingKey(row.key); }}
                  className="shrink-0 font-semibold text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors"
                >
                  {row.priceCents != null ? fmt(row.priceCents) : <span className="text-muted-foreground font-normal text-xs">+ prijs instellen</span>}
                </button>
              )}
            </div>
          );
        })}
        {allRows.length > 1 && (
          <div className="flex items-center justify-between px-5 py-3 bg-muted/20">
            <span className="text-sm font-bold text-foreground">Totaal</span>
            <span className="text-sm font-bold text-foreground">{fmt(total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, color, label, children }: { icon: React.ReactNode; color: string; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
