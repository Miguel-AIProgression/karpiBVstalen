"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isoWeekParts, mondayOfIsoWeek } from "@/lib/dates/iso-week";
import { stockKey } from "@/lib/productie/planning";

interface WeekOption {
  year: number;
  week: number;
  label: string;
  orderCount: number;
}

interface PlanItem {
  sampleId: string;
  qualityId: string;
  colorCodeId: string;
  dimensionId: string;
  articleNumber: string;
  qualityName: string;
  description: string | null; // karpi_naam
  colorCode: string;
  dimensionName: string;
  afwerking: string | null;
  location: string | null;
  neededForWeek: number;
  inStock: number;
  onWerkbon: number;
  toProduce: number;
}

interface WeekplanningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

function endOfIsoWeek(year: number, week: number): string {
  const monday = mondayOfIsoWeek(year, week);
  const d = new Date(monday + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

export function WeekplanningModal({ open, onOpenChange, onSaved }: WeekplanningModalProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [relevantOrderIds, setRelevantOrderIds] = useState<{ id: string; order_number: string }[]>([]);

  // Ruwe data — één keer geladen bij openen
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [finishedStockMap, setFinishedStockMap] = useState<Map<string, number>>(new Map());
  const [werkbonMap, setWerkbonMap] = useState<Map<string, number>>(new Map());

  const loadRawData = useCallback(async () => {
    setLoading(true);
    setSaved(false);

    const [ordersRes, stockRes, werkbonRes] = await Promise.all([
      (supabase as any)
        .from("orders")
        .select(`
          id, order_number, delivery_date, status,
          order_lines(
            sample_id, quantity,
            samples(
              id, article_number, location, quality_id, color_code_id, dimension_id, karpi_naam,
              qualities(name),
              color_codes(code),
              sample_dimensions(name),
              finishing_types(name)
            )
          )
        `)
        .neq("status", "completed")
        .not("delivery_date", "is", null),
      supabase.from("finished_stock").select("quality_id, color_code_id, dimension_id, quantity"),
      (supabase as any)
        .from("werkbon_lines")
        .select("sample_id, to_produce")
        .in("status", ["open", "gesneden"]),
    ]);

    const orders = (ordersRes.data ?? []) as any[];
    const stockRows = (stockRes.data ?? []) as any[];
    const werkbonRows = (werkbonRes.data ?? []) as any[];

    // Finished stock per stockKey
    const fsMap = new Map<string, number>();
    for (const row of stockRows) {
      const key = stockKey(row.quality_id, row.color_code_id, row.dimension_id);
      fsMap.set(key, (fsMap.get(key) ?? 0) + row.quantity);
    }

    // Open werkbon per sampleId
    const wbMap = new Map<string, number>();
    for (const row of werkbonRows) {
      if (!row.sample_id) continue;
      wbMap.set(row.sample_id, (wbMap.get(row.sample_id) ?? 0) + row.to_produce);
    }

    // Bepaal weekopties
    const weekMap = new Map<string, { year: number; week: number; orderCount: number }>();
    for (const order of orders) {
      if (!order.delivery_date) continue;
      const d = new Date(order.delivery_date + "T00:00:00Z");
      const { week, year } = isoWeekParts(d);
      const key = `${year}-${String(week).padStart(2, "0")}`;
      const existing = weekMap.get(key);
      weekMap.set(key, { year, week, orderCount: (existing?.orderCount ?? 0) + 1 });
    }

    const options: WeekOption[] = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        ...v,
        label: `t/m week ${v.week} (${v.year})`,
      }));

    setRawOrders(orders);
    setFinishedStockMap(fsMap);
    setWerkbonMap(wbMap);
    setWeekOptions(options);

    const defaultKey = options[0] ? `${options[0].year}-${String(options[0].week).padStart(2, "0")}` : "";
    setSelectedKey(defaultKey);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (open) loadRawData();
  }, [open, loadRawData]);

  // Herbereken planItems als weekkeuze verandert
  useEffect(() => {
    if (!selectedKey || rawOrders.length === 0) { setPlanItems([]); return; }

    const [yearStr, weekStr] = selectedKey.split("-");
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);
    const cutoff = endOfIsoWeek(year, week); // exclusief: orders met delivery_date < cutoff

    // Filter orders op levertijd
    const relevantOrders = rawOrders.filter(
      (o) => o.delivery_date && o.delivery_date < cutoff
    );
    setRelevantOrderIds(relevantOrders.map((o) => ({ id: o.id, order_number: o.order_number })));

    // Aggregeer vraag per sample
    const demandMap = new Map<string, { qty: number; sample: any }>();
    for (const order of relevantOrders) {
      for (const line of order.order_lines ?? []) {
        if (!line.sample_id || !line.samples) continue;
        const existing = demandMap.get(line.sample_id);
        demandMap.set(line.sample_id, {
          qty: (existing?.qty ?? 0) + (line.quantity ?? 1),
          sample: line.samples,
        });
      }
    }

    // Bereken toProduce per sample
    const items: PlanItem[] = [];
    for (const [sampleId, { qty, sample }] of demandMap) {
      const key = stockKey(sample.quality_id, sample.color_code_id, sample.dimension_id);
      const inStock = finishedStockMap.get(key) ?? 0;
      const onWerkbon = werkbonMap.get(sampleId) ?? 0;
      const toProduce = Math.max(0, qty - inStock - onWerkbon);
      if (toProduce === 0) continue;

      items.push({
        sampleId,
        qualityId: sample.quality_id,
        colorCodeId: sample.color_code_id,
        dimensionId: sample.dimension_id,
        articleNumber: sample.article_number,
        qualityName: sample.qualities?.name ?? "?",
        description: sample.karpi_naam ?? null,
        colorCode: sample.color_codes?.code ?? "?",
        dimensionName: sample.sample_dimensions?.name ?? "?",
        afwerking: sample.finishing_types?.name ?? null,
        location: sample.location ?? null,
        neededForWeek: qty,
        inStock,
        onWerkbon,
        toProduce,
      });
    }

    items.sort((a, b) => {
      const ak = (a.afwerking ?? "—") + a.qualityName + a.colorCode;
      const bk = (b.afwerking ?? "—") + b.qualityName + b.colorCode;
      return ak.localeCompare(bk);
    });

    setPlanItems(items);
  }, [selectedKey, rawOrders, finishedStockMap, werkbonMap]);

  async function handleSave() {
    if (!planItems.length) return;
    setSaving(true);
    try {
      const { data: wb, error: wbErr } = await (supabase as any)
        .from("werkbonnen").insert({ status: "open" }).select("id").single();
      if (wbErr || !wb) throw wbErr;

      // Koppel orders aan werkbon
      if (relevantOrderIds.length > 0) {
        await (supabase as any).from("werkbon_orders").insert(
          relevantOrderIds.map((o) => ({
            werkbon_id: wb.id,
            order_id: o.id,
            order_number: o.order_number,
          }))
        );
      }

      await (supabase as any).from("werkbon_lines").insert(
        planItems.map((item) => ({
          werkbon_id: wb.id,
          sample_id: item.sampleId,
          quality_id: item.qualityId,
          color_code_id: item.colorCodeId,
          dimension_id: item.dimensionId,
          article_number: item.articleNumber,
          quality_name: item.qualityName,
          color_code: item.colorCode,
          dimension_name: item.dimensionName,
          afwerking: item.afwerking,
          location: item.location,
          to_produce: item.toProduce,
          status: "open",
        }))
      );

      setSaved(true);
      onSaved?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  // Groepeer op afwerking
  const groups = new Map<string, PlanItem[]>();
  for (const item of planItems) {
    const key = item.afwerking ?? "Geen afwerking";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const totalToProduce = planItems.reduce((s, i) => s + i.toProduce, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-background shadow-xl ring-1 ring-border">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Weekplanning — Wat moet er bijgemaakt worden?</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Berekend op basis van orders, voorraad en openstaande werkbonnen
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!loading && planItems.length > 0 && !saved && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Opslaan..." : "Werkbon aanmaken"}
              </Button>
            )}
            {saved && (
              <span className="text-sm font-medium text-green-700">✓ Werkbon aangemaakt</span>
            )}
            <button onClick={() => onOpenChange(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Weekkiezer */}
        <div className="border-b border-border px-6 py-3 flex items-center gap-3">
          <span className="text-sm font-medium">Plannen voor:</span>
          {loading ? (
            <span className="text-sm text-muted-foreground">Laden...</span>
          ) : weekOptions.length === 0 ? (
            <span className="text-sm text-muted-foreground italic">Geen orders met levertijd gevonden</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {weekOptions.map((opt) => {
                const key = `${opt.year}-${String(opt.week).padStart(2, "0")}`;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                      selectedKey === key
                        ? "bg-blue-600 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                  >
                    t/m week {opt.week}
                    <span className="ml-1 opacity-60 text-xs">({opt.orderCount} orders)</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Berekenen...</p>
          ) : !selectedKey || weekOptions.length === 0 ? null
          : planItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-4xl mb-3">✓</div>
              <p className="text-lg font-semibold text-green-700">Niets extra te maken</p>
              <p className="text-sm text-muted-foreground mt-1">
                Voorraad en openstaande werkbonnen dekken alle orders voor deze periode.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Samenvatting */}
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex flex-wrap gap-6 text-sm">
                <div><span className="text-muted-foreground">Te maken:</span> <strong className="text-amber-700">{totalToProduce} stuks</strong></div>
                <div><span className="text-muted-foreground">Artikelen:</span> <strong>{planItems.length}</strong></div>
                <div><span className="text-muted-foreground">Afwerkingen:</span> <strong>{groups.size}</strong></div>
              </div>

              {/* Groepen per afwerking */}
              {Array.from(groups.entries()).map(([afwerking, items]) => (
                <div key={afwerking} className="overflow-hidden rounded-xl ring-1 ring-border">
                  <div className="flex items-center justify-between bg-foreground px-4 py-2.5">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-white/50">Afwerking</p>
                      <p className="font-bold text-white">{afwerking}</p>
                    </div>
                    <span className="text-sm font-semibold text-white/70">
                      {items.reduce((s, i) => s + i.toProduce, 0)} stuks
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 px-4 text-left font-semibold">Kwaliteit</th>
                        <th className="py-2 px-4 text-left font-semibold">Naam</th>
                        <th className="py-2 px-4 text-left font-semibold">Kleur</th>
                        <th className="py-2 px-4 text-left font-semibold">Afmeting</th>
                        <th className="py-2 px-3 text-right font-semibold text-muted-foreground/70">Nodig</th>
                        <th className="py-2 px-3 text-right font-semibold text-muted-foreground/70">Voorraad</th>
                        <th className="py-2 px-3 text-right font-semibold text-muted-foreground/70">Werkbon</th>
                        <th className="py-2 px-4 text-right font-semibold text-amber-700">Te maken</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={item.sampleId} className={`border-b border-border/30 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                          <td className="py-2 px-4 font-medium">{item.qualityName}</td>
                          <td className="py-2 px-4 text-muted-foreground">{item.description ?? <span className="italic opacity-40">—</span>}</td>
                          <td className="py-2 px-4 text-muted-foreground">{item.colorCode}</td>
                          <td className="py-2 px-4 text-muted-foreground">{item.dimensionName}</td>
                          <td className="py-2 px-3 text-right text-muted-foreground">{item.neededForWeek}</td>
                          <td className="py-2 px-3 text-right text-muted-foreground">{item.inStock}</td>
                          <td className="py-2 px-3 text-right text-muted-foreground">{item.onWerkbon > 0 ? item.onWerkbon : <span className="opacity-30">—</span>}</td>
                          <td className="py-2 px-4 text-right text-lg font-bold text-amber-700">{item.toProduce}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
