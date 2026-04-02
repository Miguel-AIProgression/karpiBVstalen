"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Printer } from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface PackingSlipLineItem {
  qualityName: string;
  colorCode: string;
  colorName: string;
}

interface PackingSlipLine {
  bundleName: string;
  items: PackingSlipLineItem[];
  quantity: number;
  location: string | null;
}

interface PackingSlipAccessory {
  name: string;
  quantity: number;
}

interface PackingSlipOrder {
  orderNumber: string;
  clientName: string;
  collectionName: string;
  deliveryDate: string;
  notes: string | null;
  lines: PackingSlipLine[];
  accessories: PackingSlipAccessory[];
}

interface PackingSlipProps {
  orderId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ─── Helpers ──────────────────────────────────────────── */

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* ─── Component ──────────────────────────────────────── */

export function PackingSlip({
  orderId,
  clientId,
  open,
  onOpenChange,
}: PackingSlipProps) {
  const supabase = createClient();
  const [data, setData] = useState<PackingSlipOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: order } = await supabase
      .from("orders")
      .select(
        "*, clients(name), collections(name), order_lines(*, bundles(id, name, quality_id, dimension_id, qualities(id, name, code), sample_dimensions(name), bundle_colors(*, color_codes(code, name)), bundle_items(position, samples(quality_id, color_code_id, dimension_id, location, qualities(id, name, code), color_codes(code, name)))))"
      )
      .eq("id", orderId)
      .single();

    if (!order) {
      setLoading(false);
      return;
    }

    // Get client custom quality names
    const qualityIds = [
      ...new Set([
        ...((order as any).order_lines ?? [])
          .map((l: any) => l.bundles?.quality_id)
          .filter(Boolean),
        ...((order as any).order_lines ?? [])
          .flatMap((l: any) => (l.bundles?.bundle_items ?? []).map((bi: any) => bi.samples?.quality_id))
          .filter(Boolean),
      ]),
    ] as string[];

    const customNameMap = new Map<string, string>();
    if (qualityIds.length > 0) {
      const { data: customNames } = await supabase
        .from("client_quality_names")
        .select("quality_id, custom_name")
        .eq("client_id", clientId)
        .in("quality_id", qualityIds);

      for (const cn of customNames ?? []) {
        customNameMap.set(cn.quality_id, cn.custom_name);
      }
    }

    // Build location map from samples.location
    const locationMap = new Map<string, string>();
    const oldStyleBundles: { bundleId: string; quality_id: string; dimension_id: string; color_code_ids: string[] }[] = [];

    for (const line of (order as any).order_lines ?? []) {
      const bundle = line.bundles;
      if (!bundle) continue;

      if (!bundle.quality_id && (bundle.bundle_items?.length ?? 0) > 0) {
        // Multi-quality: samples already loaded with location field
        for (const item of bundle.bundle_items ?? []) {
          const loc = item.samples?.location;
          if (loc && !locationMap.has(bundle.id)) {
            locationMap.set(bundle.id, loc);
            break;
          }
        }
      } else if (bundle.quality_id) {
        const colorIds = (bundle.bundle_colors ?? []).map((bc: any) => bc.color_code_id).filter(Boolean);
        if (colorIds.length > 0 && bundle.dimension_id) {
          oldStyleBundles.push({
            bundleId: bundle.id,
            quality_id: bundle.quality_id,
            dimension_id: bundle.dimension_id,
            color_code_ids: colorIds,
          });
        }
      }
    }

    // Query samples for old-style bundles
    if (oldStyleBundles.length > 0) {
      const allQIds = [...new Set(oldStyleBundles.map((b) => b.quality_id))];
      const allCIds = [...new Set(oldStyleBundles.flatMap((b) => b.color_code_ids))];
      const { data: sampleData } = await supabase
        .from("samples")
        .select("quality_id, color_code_id, dimension_id, location")
        .in("quality_id", allQIds)
        .in("color_code_id", allCIds)
        .not("location", "is", null);

      const sampleLocMap = new Map<string, string>();
      for (const s of (sampleData ?? []) as any[]) {
        if (s.location) {
          sampleLocMap.set(`${s.quality_id}|${s.color_code_id}|${s.dimension_id}`, s.location);
        }
      }

      for (const b of oldStyleBundles) {
        if (locationMap.has(b.bundleId)) continue;
        for (const cid of b.color_code_ids) {
          const loc = sampleLocMap.get(`${b.quality_id}|${cid}|${b.dimension_id}`);
          if (loc) {
            locationMap.set(b.bundleId, loc);
            break;
          }
        }
      }
    }

    // Fetch order accessories
    const { data: accData } = await supabase
      .from("order_accessories")
      .select("quantity, accessories(name)")
      .eq("order_id", orderId);

    const accessories: PackingSlipAccessory[] = (accData ?? []).map((a: any) => ({
      name: a.accessories?.name ?? "?",
      quantity: a.quantity,
    }));

    // Build lines
    const lines: PackingSlipLine[] = [];
    for (const line of (order as any).order_lines ?? []) {
      const bundle = line.bundles;
      if (!bundle) continue;

      const isMultiQ = !bundle.quality_id && (bundle.bundle_items?.length ?? 0) > 0;

      if (isMultiQ) {
        // New-style: bundle_items with samples from different qualities
        const sortedItems = [...(bundle.bundle_items ?? [])].sort(
          (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)
        );
        const items: PackingSlipLineItem[] = sortedItems.map((item: any) => {
          const qId = item.samples?.quality_id;
          const qName = customNameMap.get(qId) ?? item.samples?.qualities?.name ?? "Onbekend";
          return {
            qualityName: qName,
            colorCode: item.samples?.color_codes?.code ?? "",
            colorName: item.samples?.color_codes?.name ?? "",
          };
        });

        lines.push({
          bundleName: bundle.name,
          items,
          quantity: line.quantity,
          location: locationMap.get(bundle.id) ?? null,
        });
      } else {
        // Old-style: single quality with bundle_colors
        const karpiName = bundle.qualities?.name ?? "Onbekend";
        const qualityName = customNameMap.get(bundle.quality_id) ?? karpiName;

        const items: PackingSlipLineItem[] = (bundle.bundle_colors ?? [])
          .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
          .map((bc: any) => ({
            qualityName,
            colorCode: bc.color_codes?.code ?? "",
            colorName: bc.color_codes?.name ?? "",
          }));

        lines.push({
          bundleName: bundle.name,
          items,
          quantity: line.quantity,
          location: locationMap.get(bundle.id) ?? null,
        });
      }
    }

    setData({
      orderNumber: (order as any).order_number,
      clientName: (order as any).clients?.name ?? "Onbekend",
      collectionName: (order as any).collections?.name ?? "Onbekend",
      deliveryDate: (order as any).delivery_date,
      notes: (order as any).notes,
      lines,
      accessories,
    });
    setLoading(false);
  }, [supabase, orderId, clientId]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  function handlePrint() {
    window.print();
  }

  if (!open) return null;

  const totalStalen = (data?.lines ?? []).reduce(
    (sum, l) => sum + l.items.length * l.quantity,
    0
  );

  /* Shared content for screen preview and print — designed to fit 1 A4 page */
  function SlipContent() {
    if (!data) return null;
    return (
      <div className="packing-slip-content text-black bg-white text-[11px] leading-tight">
        {/* Header row: compact */}
        <div className="flex items-start justify-between border-b border-black pb-2 mb-3">
          <div>
            <h1 className="text-base font-bold leading-none">Pakbon</h1>
            <p className="text-sm font-semibold">{data.orderNumber}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-sm">{data.clientName}</p>
            <p className="text-gray-600">{data.collectionName}</p>
            <p className="text-gray-500">{formatDate(data.deliveryDate)}</p>
          </div>
        </div>

        {/* Accessories if any — single line */}
        {data.accessories.length > 0 && (
          <div className="mb-2 text-[10px] text-gray-600">
            <span className="font-semibold uppercase tracking-wide">Accessoires: </span>
            {data.accessories.map((acc, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {acc.quantity}× {acc.name}
              </span>
            ))}
          </div>
        )}

        {/* Summary line */}
        <div className="mb-2 text-[10px] text-gray-500">
          {data.lines.length} bundels · {totalStalen} stalen
        </div>

        {/* Bundle table — one row per quality+color */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-[10px] uppercase tracking-wide text-gray-500">
              <th className="py-1 text-left font-semibold w-[110px]">Bundel</th>
              <th className="py-1 text-left font-semibold w-[100px]">Kwaliteit</th>
              <th className="py-1 text-left font-semibold">Kleur</th>
              <th className="py-1 text-right font-semibold w-[40px]">Stuks</th>
              <th className="py-1 text-right font-semibold w-[60px]">Locatie</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, i) =>
              line.items.map((item, j) => (
                <tr
                  key={`${i}-${j}`}
                  className={`align-top ${j === line.items.length - 1 ? "border-b border-gray-300" : "border-b border-gray-100"}`}
                >
                  <td className="py-0.5 font-medium">{j === 0 ? line.bundleName : ""}</td>
                  <td className="py-0.5 text-gray-700">{item.qualityName}</td>
                  <td className="py-0.5 text-gray-600">
                    {item.colorCode}
                    {item.colorName && item.colorName !== item.colorCode ? ` — ${item.colorName}` : ""}
                  </td>
                  <td className="py-0.5 text-right font-medium">{line.quantity}</td>
                  <td className="py-0.5 text-right text-gray-500">{j === 0 ? (line.location ?? "—") : ""}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-black">
              <td className="py-1 font-semibold" colSpan={3}>Totaal</td>
              <td className="py-1 text-right font-semibold">{totalStalen}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        {/* Notes */}
        {data.notes && (
          <div className="mt-3 border-t border-gray-300 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Opmerkingen</p>
            <p>{data.notes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .packing-slip-print-root,
          .packing-slip-print-root * {
            visibility: visible !important;
          }
          .packing-slip-print-root {
            position: absolute !important;
            left: 0;
            top: 0;
            width: 100%;
            padding: 12mm 15mm;
            box-sizing: border-box;
            font-size: 11px !important;
          }
          @page {
            size: A4;
            margin: 8mm;
          }
        }
        @media screen {
          .packing-slip-print-root {
            display: none !important;
          }
        }
      `}</style>

      {/* Hidden print area */}
      <div className="packing-slip-print-root" ref={printRef}>
        <SlipContent />
      </div>

      {/* Modal overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-background ring-1 ring-border shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">
              Pakbon — {data?.orderNumber}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handlePrint}
                disabled={loading || !data}
              >
                <Printer size={14} /> Afdrukken
              </Button>
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <p className="text-center text-sm text-muted-foreground">
                Laden...
              </p>
            ) : !data ? (
              <p className="text-center text-sm text-muted-foreground">
                Geen data gevonden.
              </p>
            ) : (
              <div className="mx-auto rounded-lg border border-border bg-white p-8 shadow-sm">
                <SlipContent />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
