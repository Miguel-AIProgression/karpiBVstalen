"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArchiveRestore, FileText } from "lucide-react";
import Link from "next/link";
import { isoWeekParts } from "@/lib/dates/iso-week";

interface ArchivedOrder {
  id: string;
  order_number: string;
  delivery_date: string;
  reference: string | null;
  archived_at: string;
  clients: { name: string; logo_url: string | null } | null;
  invoice: { invoice_number: string; sent_at: string | null } | null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatWeek(dateStr: string) {
  const { week, year } = isoWeekParts(new Date(dateStr));
  return `Week ${week} (${year})`;
}

export default function OrderArchiefPage() {
  const supabase = createClient();
  const router = useRouter();
  const [orders, setOrders] = useState<ArchivedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [unarchiving, setUnarchiving] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, order_number, delivery_date, reference, archived_at, clients(name, logo_url)")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });

    if (!ordersData?.length) { setOrders([]); setLoading(false); return; }

    const orderIds = ordersData.map((o: any) => o.id);
    const { data: invoicesData } = await supabase
      .from("invoices")
      .select("order_id, invoice_number, sent_at")
      .in("order_id", orderIds);

    const invoiceMap = new Map(
      ((invoicesData ?? []) as { order_id: string; invoice_number: string; sent_at: string | null }[])
        .map((inv) => [inv.order_id, inv])
    );

    setOrders((ordersData as any[]).map((o) => ({
      id: o.id,
      order_number: o.order_number,
      delivery_date: o.delivery_date,
      reference: o.reference ?? null,
      archived_at: o.archived_at,
      clients: o.clients ?? null,
      invoice: invoiceMap.get(o.id) ? {
        invoice_number: invoiceMap.get(o.id)!.invoice_number,
        sent_at: invoiceMap.get(o.id)!.sent_at,
      } : null,
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  async function handleUnarchive(orderId: string) {
    setUnarchiving(orderId);
    await supabase.from("orders").update({ archived_at: null } as any).eq("id", orderId);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setUnarchiving(null);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/orders")}
            className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> Terug naar orders
          </button>
          <h2 className="font-display text-3xl tracking-tight text-foreground">Archief</h2>
          <p className="mt-1 text-sm text-muted-foreground">Gefactureerde en gearchiveerde orders</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 ring-1 ring-border text-center">
          <p className="text-sm text-muted-foreground">Geen gearchiveerde orders.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-card ring-1 ring-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Klant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leverweek</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Factuur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gearchiveerd</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`} className="font-mono font-semibold text-foreground hover:text-primary hover:underline">
                      #{o.order_number}
                    </Link>
                    {o.reference && (
                      <div className="text-xs text-muted-foreground">{o.reference}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {o.clients?.logo_url && (
                        <img src={o.clients.logo_url} alt="" className="h-5 w-5 rounded-full object-contain" />
                      )}
                      <span className="font-medium">{o.clients?.name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatWeek(o.delivery_date)}</td>
                  <td className="px-4 py-3">
                    {o.invoice ? (
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${o.invoice.sent_at ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                        <FileText size={10} />
                        {o.invoice.invoice_number}
                        {o.invoice.sent_at ? " · Verstuurd" : " · Aangemaakt"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(o.archived_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnarchive(o.id)}
                      disabled={unarchiving === o.id}
                      className="text-xs"
                    >
                      <ArchiveRestore size={12} />
                      {unarchiving === o.id ? "Bezig..." : "Terugzetten"}
                    </Button>
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
