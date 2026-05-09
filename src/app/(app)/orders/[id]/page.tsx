"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { StickerPrint } from "@/components/sticker-print";
import { PackingSlip } from "@/components/packing-slip";
import { getOrderFulfillment, type Fulfillment, type FulfillmentLine } from "@/lib/order-fulfillment";
import { readVoorraadbeeld } from "@/lib/voorraadbeeld/snapshot";
import { buildFulfillability } from "@/lib/voorraadbeeld/fulfillability";
import Link from "next/link";

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
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;

  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);
  const [legacyLineCount, setLegacyLineCount] = useState(0);
  /** Per UI-regel sampleId → { needed, assigned } volgens FIFO-fulfillability. */
  const [assignedBySample, setAssignedBySample] = useState<
    Map<string, { needed: number; assigned: number }>
  >(new Map());
  /** finished stock per sampleId — voor over-de-hele-voorraad context (voorraad-totaal). */
  const [finishedBySample, setFinishedBySample] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [pakbonOpen, setPakbonOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editDeliveryDate, setEditDeliveryDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editShippingStreet, setEditShippingStreet] = useState("");
  const [editShippingPostalCode, setEditShippingPostalCode] = useState("");
  const [editShippingCity, setEditShippingCity] = useState("");
  const [editShippingCountry, setEditShippingCountry] = useState("");
  /** key = lineId → quantity */
  const [editQuantities, setEditQuantities] = useState<Map<string, number>>(new Map());
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    const ff = await getOrderFulfillment(supabase, orderId);
    setFulfillment(ff);

    // Eén Voorraadbeeld-snapshot voor zowel FIFO-toewijzing als legacyLineCount.
    const vb = await readVoorraadbeeld(supabase, new Date());
    const fulfillability = buildFulfillability(vb);
    const myFulfillment = fulfillability.get(orderId);

    // Per UI-regel: sommeer needed + assigned over alle order_lines met
    // dezelfde sample_id. Een sample kan meermaals voorkomen — totalen zijn
    // sample-breed, en de tabel cap't `assigned` later op de regel-eigen qty.
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

    // Voorraad-totaal per sample (over alle StockKey-rijen) — voor tooltips
    // en context. Pakt sample → (qualityId|colorCodeId|dimensionId) uit de
    // snapshot en zoekt het totaal op in `vb.finishedStock`.
    const finishedMap = new Map<string, number>();
    if (ff) {
      for (const sampleId of new Set(ff.lines.map((l) => l.sampleId))) {
        const sample = vb.samplesById.get(sampleId);
        if (sample) {
          finishedMap.set(
            sampleId,
            vb.finishedStock.get(
              `${sample.qualityId}|${sample.colorCodeId}|${sample.dimensionId}`,
            ) ?? 0,
          );
        }
      }
    }
    setFinishedBySample(finishedMap);

    // legacyLineCount uit Voorraadbeeld als de order daar staat (open).
    // Voor `completed` orders skipt readVoorraadbeeld ze, dus fallback-query.
    if (myFulfillment) {
      setLegacyLineCount(myFulfillment.legacyLineCount);
    } else {
      const { count: legacyCount } = await supabase
        .from("order_lines")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .is("sample_id", null);
      setLegacyLineCount(legacyCount ?? 0);
    }

    setLoading(false);
  }, [supabase, orderId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDelete() {
    if (!fulfillment) return;
    if (!confirm(`Order "${fulfillment.order.orderNumber}" definitief verwijderen?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/orders/${fulfillment.order.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/orders");
    } else {
      const body = await res.json().catch(() => null);
      alert(`Verwijderen mislukt: ${body?.error ?? "onbekende fout"}`);
      setDeleting(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!fulfillment) return;
    setUpdatingStatus(true);
    await supabase.from("orders").update({ status: newStatus }).eq("id", fulfillment.order.id);
    setFulfillment({ ...fulfillment, order: { ...fulfillment.order, status: newStatus } });
    setUpdatingStatus(false);
  }

  function startEditing() {
    if (!fulfillment) return;
    setEditDeliveryDate(fulfillment.order.deliveryDate);
    setEditNotes(fulfillment.order.notes ?? "");
    setEditShippingStreet(fulfillment.order.shippingStreet ?? "");
    setEditShippingPostalCode(fulfillment.order.shippingPostalCode ?? "");
    setEditShippingCity(fulfillment.order.shippingCity ?? "");
    setEditShippingCountry(fulfillment.order.shippingCountry ?? "Nederland");
    const qMap = new Map<string, number>();
    for (const line of fulfillment.lines) qMap.set(line.lineId, line.quantity);
    setEditQuantities(qMap);
    setEditing(true);
  }

  async function saveEdits() {
    if (!fulfillment) return;
    setSavingEdit(true);
    await supabase
      .from("orders")
      .update({
        delivery_date: editDeliveryDate,
        notes: editNotes.trim() || null,
        shipping_street: editShippingStreet.trim() || null,
        shipping_postal_code: editShippingPostalCode.trim() || null,
        shipping_city: editShippingCity.trim() || null,
        shipping_country: editShippingCountry.trim() || null,
      })
      .eq("id", fulfillment.order.id);

    for (const [lineId, qty] of editQuantities) {
      const original = fulfillment.lines.find((l) => l.lineId === lineId);
      if (original && original.quantity !== qty) {
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
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!fulfillment) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-sm text-muted-foreground">Order niet gevonden.</p>
      </div>
    );
  }

  const { order, client, lines, totals } = fulfillment;

  return (
    <div className="space-y-6 p-6">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Terug naar orders
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">{order.orderNumber}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.name}
            {client.priceListNr && (
              <span className="ml-2 font-mono text-xs text-amber-700">{client.priceListNr}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={savingEdit}>
                <XCircle size={14} /> Annuleren
              </Button>
              <Button onClick={saveEdits} disabled={savingEdit}>
                <Save size={14} /> {savingEdit ? "Opslaan..." : "Opslaan"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={startEditing}>
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
              <Button variant="outline" onClick={() => setPakbonOpen(true)}>
                <Printer size={14} /> Pakbon
              </Button>
              <Button variant="outline" onClick={() => setStickerOpen(true)}>
                <Printer size={14} /> Stickers
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard icon={<Calendar size={18} />} color="bg-blue-100 text-blue-700" label="Levertijd">
          {editing ? (
            <input
              type="date"
              value={editDeliveryDate}
              onChange={(e) => setEditDeliveryDate(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            />
          ) : (
            <span className="text-sm font-semibold text-card-foreground">{formatDate(order.deliveryDate)}</span>
          )}
        </SummaryCard>
        <SummaryCard icon={<Layers size={18} />} color="bg-purple-100 text-purple-700" label="Stalen totaal">
          <span className="text-sm font-semibold text-card-foreground">{totals.totalQuantity}</span>
        </SummaryCard>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Status:</span>
        <select
          value={order.status}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={updatingStatus}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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

      {/* Adres */}
      {editing ? (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verzendadres</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input placeholder="Straat" value={editShippingStreet} onChange={(e) => setEditShippingStreet(e.target.value)} />
            <Input placeholder="Postcode" value={editShippingPostalCode} onChange={(e) => setEditShippingPostalCode(e.target.value)} />
            <Input placeholder="Stad" value={editShippingCity} onChange={(e) => setEditShippingCity(e.target.value)} />
            <Input placeholder="Land" value={editShippingCountry} onChange={(e) => setEditShippingCountry(e.target.value)} />
          </div>
        </div>
      ) : (
        (order.shippingStreet || order.shippingCity) && (
          <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Verzendadres</span>
              <span className="text-sm text-card-foreground text-right max-w-[60%]">
                {[order.shippingStreet, order.shippingPostalCode, order.shippingCity, order.shippingCountry]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </div>
          </div>
        )
      )}

      {/* Legacy banner */}
      {legacyLineCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Legacy bundle-orderregels gedetecteerd ({legacyLineCount})</p>
            <p className="mt-1 text-xs">
              Deze regels zijn nog niet uitgesplitst naar artikel-niveau. Run de migratie{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">20260503_order_lines_sample_id.sql</code> om
              ze om te zetten.
            </p>
          </div>
        </div>
      )}

      {/* Order lines — gegroepeerd per bundel */}
      {lines.length === 0 && legacyLineCount === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Geen orderregels.</p>
        </div>
      ) : lines.length > 0 && <OrderLinesTable
          lines={lines}
          editing={editing}
          editQuantities={editQuantities}
          setEditQuantities={setEditQuantities}
          assignedBySample={assignedBySample}
          finishedBySample={finishedBySample}
        />}

      {/* Notes */}
      {editing ? (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opmerkingen</h3>
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      ) : order.notes ? (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opmerkingen</h3>
          <p className="text-sm text-card-foreground">{order.notes}</p>
        </div>
      ) : null}

      {/* Modals */}
      <PackingSlip orderId={order.id} clientId={client.id} open={pakbonOpen} onOpenChange={setPakbonOpen} />
      <StickerPrint orderId={order.id} clientId={client.id} open={stickerOpen} onOpenChange={setStickerOpen} />
    </div>
  );
}

function OrderLinesTable({
  lines,
  editing,
  editQuantities,
  setEditQuantities,
  assignedBySample,
  finishedBySample,
}: {
  lines: FulfillmentLine[];
  editing: boolean;
  editQuantities: Map<string, number>;
  setEditQuantities: React.Dispatch<React.SetStateAction<Map<string, number>>>;
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
  // Groepeer bundels per collectie
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
      </tr>
    </thead>
  );

  const renderRow = (line: FulfillmentLine) => {
    const meta = assignedBySample.get(line.sampleId);
    const finished = finishedBySample.get(line.sampleId) ?? 0;
    const lineQty = editing ? editQuantities.get(line.lineId) ?? line.quantity : line.quantity;
    const assigned = Math.min(meta?.assigned ?? 0, lineQty);
    const ok = assigned >= lineQty;
    return (
      <tr key={line.lineId} className="border-b border-border/30 transition-colors hover:bg-muted/30">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 shrink-0 rounded" style={{ backgroundColor: line.hexColor ?? "#e5e7eb" }} />
            <div className="min-w-0">
              <div className="font-mono text-[10px] text-muted-foreground">{line.articleNumber}</div>
              <div className="text-card-foreground">
                {line.qualityName} <span className="text-muted-foreground">{line.colorCode}</span>
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">{line.dimensionName || "—"}</td>
        <td className="px-4 py-2.5 text-right">
          {editing ? (
            <input type="number" min={1} value={lineQty}
              onChange={(e) => setEditQuantities((prev) => new Map(prev).set(line.lineId, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-16 rounded border border-border bg-background px-2 py-1 text-right" />
          ) : (
            <span className="text-card-foreground">{lineQty}</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-center">
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
            title={`Voorraad totaal: ${finished}`}
          >
            {assigned} / {lineQty}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* Niveau 1: Collecties */}
      {Array.from(collectionGroups.entries()).map(([collName, bundles]) => {
        const totalLines = Array.from(bundles.values()).flatMap(g => g.lines);
        const totalQty = totalLines.reduce((s, l) => s + (editing ? editQuantities.get(l.lineId) ?? l.quantity : l.quantity), 0);
        return (
          <div key={collName} className="rounded-2xl border-2 border-foreground/10 overflow-hidden">
            {/* Collectie-header */}
            <div className="bg-foreground/5 px-5 py-3 border-b border-foreground/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Collectie</p>
                <p className="text-base font-bold text-foreground">{collName}</p>
              </div>
              <span className="text-sm text-muted-foreground">{totalLines.length} stalen · {totalQty} stuks</span>
            </div>
            {/* Niveau 2: Bundels binnen deze collectie */}
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
                    <table className="w-full text-sm">
                      {thead}
                      <tbody>{group.lines.map(renderRow)}</tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {/* Losse stalen (geen bundel) */}
      {looseLines.length > 0 && (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          {bundleGroups.size > 0 && (
            <div className="border-b border-border bg-muted/30 px-4 py-2.5">
              <span className="text-sm font-semibold text-card-foreground">Losse stalen</span>
            </div>
          )}
          <table className="w-full text-sm">
            {thead}
            <tbody>{looseLines.map(renderRow)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  color,
  label,
  children,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  children: React.ReactNode;
}) {
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
