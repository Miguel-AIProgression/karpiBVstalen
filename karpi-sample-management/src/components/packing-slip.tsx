"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Printer } from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface PackingSlipLine {
  bundleName: string;
  karpiQualityName: string;
  karpiQualityCode: string;
  clientQualityName: string | null;
  dimensionName: string | null;
  colors: { code: string; name: string }[];
  quantity: number;
}

interface PackingSlipOrder {
  orderNumber: string;
  clientName: string;
  collectionName: string;
  deliveryDate: string;
  notes: string | null;
  shippingStreet: string | null;
  shippingPostalCode: string | null;
  shippingCity: string | null;
  shippingCountry: string | null;
  lines: PackingSlipLine[];
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
        "*, clients(name), collections(name), order_lines(*, bundles(*, qualities(id, name, code), sample_dimensions(name), bundle_colors(*, color_codes(code, name))))"
      )
      .eq("id", orderId)
      .single();

    if (!order) {
      setLoading(false);
      return;
    }

    // Get client custom quality names
    const qualityIds = [
      ...new Set(
        ((order as any).order_lines ?? [])
          .map((l: any) => l.bundles?.quality_id)
          .filter(Boolean)
      ),
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

    // Build lines
    const lines: PackingSlipLine[] = [];
    for (const line of (order as any).order_lines ?? []) {
      const bundle = line.bundles;
      if (!bundle) continue;

      const karpiName = bundle.qualities?.name ?? "Onbekend";
      const karpiCode = bundle.qualities?.code ?? "";
      const clientName = customNameMap.get(bundle.quality_id) ?? null;

      const colors = (bundle.bundle_colors ?? [])
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((bc: any) => ({
          code: bc.color_codes?.code ?? "",
          name: bc.color_codes?.name ?? "",
        }));

      lines.push({
        bundleName: bundle.name,
        karpiQualityName: karpiName,
        karpiQualityCode: karpiCode,
        clientQualityName:
          clientName && clientName.toLowerCase() !== karpiName.toLowerCase()
            ? clientName
            : null,
        dimensionName: bundle.sample_dimensions?.name ?? null,
        colors,
        quantity: line.quantity,
      });
    }

    setData({
      orderNumber: (order as any).order_number,
      clientName: (order as any).clients?.name ?? "Onbekend",
      collectionName: (order as any).collections?.name ?? "Onbekend",
      deliveryDate: (order as any).delivery_date,
      notes: (order as any).notes,
      shippingStreet: (order as any).shipping_street,
      shippingPostalCode: (order as any).shipping_postal_code,
      shippingCity: (order as any).shipping_city,
      shippingCountry: (order as any).shipping_country,
      lines,
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

  const totalBundels = data?.lines.length ?? 0;
  const totalStalen = (data?.lines ?? []).reduce(
    (sum, l) => sum + l.colors.length * l.quantity,
    0
  );

  const shippingParts = [
    data?.shippingStreet,
    [data?.shippingPostalCode, data?.shippingCity].filter(Boolean).join(" "),
    data?.shippingCountry,
  ].filter(Boolean);

  /* Shared content for screen preview and print */
  function SlipContent() {
    if (!data) return null;
    return (
      <div className="packing-slip-content text-black bg-white">
        {/* Header */}
        <div className="mb-6 border-b-2 border-black pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">Pakbon</h1>
              <p className="text-lg font-semibold mt-1">{data.orderNumber}</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">Karpi BV</p>
              <p className="text-gray-600">
                {formatDate(data.deliveryDate)}
              </p>
            </div>
          </div>
        </div>

        {/* Client & Shipping */}
        <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Klant
            </p>
            <p className="font-semibold text-base">{data.clientName}</p>
            <p className="text-gray-600">{data.collectionName}</p>
          </div>
          {shippingParts.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Verzendadres
              </p>
              {shippingParts.map((part, i) => (
                <p key={i} className={i === 0 ? "font-medium" : "text-gray-700"}>
                  {part}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="mb-4 flex gap-6 text-sm">
          <span>
            <strong>{totalBundels}</strong> bundels
          </span>
          <span>
            <strong>{totalStalen}</strong> stalen
          </span>
        </div>

        {/* Naamvertaling legenda */}
        {data.lines.some((l) => l.clientQualityName) && (
          <div className="mb-4 rounded border border-gray-300 bg-gray-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Naamvertaling — Karpi → Sticker (klantnaam)
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="py-1 text-left font-medium text-gray-600">
                    Karpi kwaliteit
                  </th>
                  <th className="py-1 text-left font-medium text-gray-600">
                    Naam op sticker
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...new Map(
                    data.lines
                      .filter((l) => l.clientQualityName)
                      .map((l) => [
                        l.karpiQualityCode,
                        {
                          karpiName: l.karpiQualityName,
                          karpiCode: l.karpiQualityCode,
                          clientName: l.clientQualityName!,
                        },
                      ])
                  ).values(),
                ].map((q) => (
                  <tr
                    key={q.karpiCode}
                    className="border-b border-gray-200"
                  >
                    <td className="py-1">
                      {q.karpiName}{" "}
                      <span className="text-gray-400">({q.karpiCode})</span>
                    </td>
                    <td className="py-1 font-semibold">{q.clientName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bundle lines table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="py-2 text-left font-semibold">Bundel</th>
              <th className="py-2 text-left font-semibold">Kwaliteit (Karpi)</th>
              <th className="py-2 text-left font-semibold">Op sticker</th>
              <th className="py-2 text-right font-semibold">Kleuren</th>
              <th className="py-2 text-right font-semibold">Aantal</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="py-2 font-medium">{line.bundleName}</td>
                <td className="py-2">
                  {line.karpiQualityName}{" "}
                  <span className="text-gray-400">({line.karpiQualityCode})</span>
                </td>
                <td className="py-2 font-semibold">
                  {line.clientQualityName ?? line.karpiQualityName}
                </td>
                <td className="py-2 text-right">{line.colors.length}</td>
                <td className="py-2 text-right">{line.quantity}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black">
              <td className="py-2 font-semibold" colSpan={3}>
                Totaal
              </td>
              <td className="py-2 text-right font-semibold">
                {totalStalen}
              </td>
              <td className="py-2 text-right font-semibold">
                {totalBundels}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Color details per bundle */}
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Kleurdetails per bundel
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {data.lines.map((line, i) => (
              <div key={i} className="border border-gray-200 rounded p-2">
                <p className="font-semibold mb-1">{line.bundleName}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-gray-600">
                  {line.colors.map((c, ci) => (
                    <span key={ci}>
                      {c.code} {c.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        {data.notes && (
          <div className="mt-6 border-t border-gray-300 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Opmerkingen
            </p>
            <p className="text-sm">{data.notes}</p>
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
            padding: 15mm;
            box-sizing: border-box;
          }
          @page {
            size: A4;
            margin: 10mm;
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
