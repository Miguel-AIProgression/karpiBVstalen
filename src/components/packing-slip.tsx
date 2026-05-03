"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Printer } from "lucide-react";
import { getOrderFulfillment, type Fulfillment } from "@/lib/order-fulfillment";

/* ─── Types ──────────────────────────────────────────── */

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

export function PackingSlip({ orderId, open, onOpenChange }: PackingSlipProps) {
  const supabase = createClient();
  const [data, setData] = useState<Fulfillment | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const fulfillment = await getOrderFulfillment(supabase, orderId);
    setData(fulfillment);
    setLoading(false);
  }, [supabase, orderId]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  function handlePrint() {
    window.print();
  }

  if (!open) return null;

  function SlipContent() {
    if (!data) return null;
    return (
      <div className="packing-slip-content text-black bg-white text-[11px] leading-tight">
        <div className="flex items-start justify-between border-b border-black pb-2 mb-3">
          <div>
            <h1 className="text-base font-bold leading-none">Pakbon</h1>
            <p className="text-sm font-semibold">{data.order.orderNumber}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-sm">{data.client.name}</p>
            {data.client.priceListNr && (
              <p className="text-gray-600">Prijslijst {data.client.priceListNr}</p>
            )}
            <p className="text-gray-500">{formatDate(data.order.deliveryDate)}</p>
          </div>
        </div>

        <div className="mb-2 text-[10px] text-gray-500">
          {data.totals.lineCount} artikel{data.totals.lineCount === 1 ? "" : "en"} ·{" "}
          {data.totals.totalQuantity} stalen
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-[10px] uppercase tracking-wide text-gray-500">
              <th className="py-1 text-left font-semibold w-[140px]">Artikelnr</th>
              <th className="py-1 text-left font-semibold w-[110px]">Kwaliteit</th>
              <th className="py-1 text-left font-semibold">Kleur</th>
              <th className="py-1 text-left font-semibold w-[60px]">Afm.</th>
              <th className="py-1 text-right font-semibold w-[40px]">Stuks</th>
              <th className="py-1 text-right font-semibold w-[60px]">Locatie</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={line.lineId} className="border-b border-gray-200 align-top">
                <td className="py-0.5 font-mono text-[10px]">{line.articleNumber}</td>
                <td className="py-0.5 text-gray-700">{line.qualityName}</td>
                <td className="py-0.5 text-gray-600">
                  {line.colorCode}
                  {line.colorName && line.colorName !== line.colorCode ? ` — ${line.colorName}` : ""}
                </td>
                <td className="py-0.5 text-gray-600">{line.dimensionName}</td>
                <td className="py-0.5 text-right font-medium">{line.quantity}</td>
                <td className="py-0.5 text-right text-gray-500">{line.location ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-black">
              <td className="py-1 font-semibold" colSpan={4}>
                Totaal
              </td>
              <td className="py-1 text-right font-semibold">{data.totals.totalQuantity}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        {data.order.notes && (
          <div className="mt-3 border-t border-gray-300 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Opmerkingen
            </p>
            <p>{data.order.notes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
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

      <div className="packing-slip-print-root" ref={printRef}>
        <SlipContent />
      </div>

      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-background ring-1 ring-border shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">
              Pakbon — {data?.order.orderNumber ?? ""}
            </h2>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handlePrint} disabled={loading || !data}>
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

          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <p className="text-center text-sm text-muted-foreground">Laden...</p>
            ) : !data ? (
              <p className="text-center text-sm text-muted-foreground">Geen data gevonden.</p>
            ) : data.lines.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Geen orderregels — heeft deze order alleen legacy bundle-regels?
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
