"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Printer } from "lucide-react";
import Image from "next/image";
import { getOrderFulfillment, type FulfillmentLine } from "@/lib/order-fulfillment";
import type { CarpetPrice } from "@/lib/pricing";

/* ─── Types ──────────────────────────────────────────── */

interface StickerData {
  qualityName: string;
  materialType: string;
  colorCode: string;
  colorName: string;
  clientLogoUrl: string | null;
  carpetPrices: CarpetPrice[];
  m2PriceCents: number | null;
  showPrice: boolean;
}

interface StickerPrintProps {
  orderId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ─── Helpers ──────────────────────────────────────────── */

function formatCents(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  if (rest === 0) return `${euros},-`;
  return `${euros},${rest.toString().padStart(2, "0")}`;
}

function formatCarpetDim(name: string): string {
  if (!name) return "";
  return `${name} cm`;
}

const DISCLAIMER =
  "Ook in het rond mogelijk. Er kan een geringe maatafwijking van +/- 3% alsmede kleine kleurafwijking optreden.";

/* ─── Component ──────────────────────────────────────── */

export function StickerPrint({ orderId, open, onOpenChange }: StickerPrintProps) {
  const supabase = createClient();
  const [stickers, setStickers] = useState<StickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const fulfillment = await getOrderFulfillment(supabase, orderId);
    if (!fulfillment) {
      setStickers([]);
      setLoading(false);
      return;
    }
    const stickerList: StickerData[] = fulfillment.lines.map((line: FulfillmentLine) => ({
      qualityName: line.qualityName,
      materialType: line.materialType ?? "",
      colorCode: line.colorCode,
      colorName: line.colorName,
      clientLogoUrl: fulfillment.client.logoUrl,
      carpetPrices: line.carpetPrices,
      m2PriceCents: line.m2PriceCents,
      showPrice: fulfillment.order.showPricesOnSticker,
    }));
    setStickers(stickerList);
    setLoading(false);
  }, [supabase, orderId]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  function handlePrint() {
    window.print();
  }

  if (!open) return null;

  function StickerCard({ sticker }: { sticker: StickerData }) {
    const showTable = sticker.showPrice && sticker.carpetPrices.length > 0;
    const showM2 = sticker.showPrice && sticker.m2PriceCents != null && sticker.m2PriceCents > 0;
    // Toon de naam alleen als die wezenlijk verschilt van de code (anders krijg je "Kleur 12 — 12").
    const showColorName =
      sticker.colorName &&
      sticker.colorName.trim().toLowerCase() !== sticker.colorCode.trim().toLowerCase();
    const colorLine = showColorName
      ? `Kleur ${sticker.colorCode} — ${sticker.colorName}`
      : `Kleur ${sticker.colorCode}`;

    return (
      <div className="flex h-full w-full flex-col">
        {/* Top: logo */}
        <div className="flex h-12 items-center justify-center">
          {sticker.clientLogoUrl && (
            <div className="relative h-12 w-32">
              <Image
                src={sticker.clientLogoUrl}
                alt=""
                fill
                className="object-contain"
              />
            </div>
          )}
        </div>

        {/* Middle: kwaliteit + kleur + materiaal, verticaal gecentreerd */}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-lg font-bold uppercase tracking-wide leading-tight">
            {sticker.qualityName}
          </div>
          <div className="mt-1 text-sm font-medium leading-tight">
            {colorLine}
          </div>
          {sticker.materialType && (
            <div className="mt-0.5 text-xs text-gray-700 italic leading-tight">
              {sticker.materialType}
            </div>
          )}
        </div>

        {/* Prijstabel */}
        {showTable && (
          <table className="mx-auto w-[88%] text-[11px] leading-snug">
            <tbody>
              {sticker.carpetPrices.map((p) => (
                <tr key={p.carpet_dimension_id}>
                  <td className="py-[1px] pr-3 text-left whitespace-nowrap">
                    {formatCarpetDim(p.carpet_dimension_name)}
                  </td>
                  <td className="py-[1px] pr-1 text-right">&euro;</td>
                  <td className="py-[1px] text-right font-semibold tabular-nums whitespace-nowrap">
                    {formatCents(p.price_cents)}
                  </td>
                </tr>
              ))}
              {showM2 && (
                <tr className="border-t border-gray-300">
                  <td className="pt-1 pr-3 text-left whitespace-nowrap">Maatwerk</td>
                  <td className="pt-1 pr-1 text-right">&euro;</td>
                  <td className="pt-1 text-right font-semibold tabular-nums whitespace-nowrap">
                    {formatCents(sticker.m2PriceCents!)}/m&sup2;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {!showTable && showM2 && (
          <div className="text-center text-xs font-semibold">
            Maatwerk &euro; {formatCents(sticker.m2PriceCents!)}/m&sup2;
          </div>
        )}

        {/* Bottom: disclaimer */}
        <div className="mt-3 text-center text-[9px] leading-tight text-gray-500 italic">
          {DISCLAIMER}
        </div>
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
          .sticker-print-root,
          .sticker-print-root * {
            visibility: visible !important;
          }
          .sticker-print-root {
            position: absolute !important;
            left: 0;
            top: 0;
            width: 100%;
          }
          .sticker-print-page {
            page-break-after: always;
            break-after: page;
            width: 98mm;
            height: 105mm;
            padding: 5mm;
            margin: 0 auto;
            box-sizing: border-box;
            display: flex !important;
            flex-direction: column;
            background: white;
            color: black;
            font-size: 10pt;
          }
          .sticker-print-page > * {
            flex: 1 1 auto;
          }
          .sticker-print-page:last-child {
            page-break-after: avoid;
          }
          @page {
            size: 98mm 105mm;
            margin: 0;
          }
        }
        @media screen {
          .sticker-print-root {
            display: none !important;
          }
        }
      `}</style>

      <div className="sticker-print-root" ref={printRef}>
        {stickers.map((sticker, i) => (
          <div key={i} className="sticker-print-page">
            <StickerCard sticker={sticker} />
          </div>
        ))}
      </div>

      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />

        <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-background ring-1 ring-border shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">
              Stickers afdrukken ({stickers.length})
            </h2>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handlePrint} disabled={loading || stickers.length === 0}>
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
            ) : stickers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Geen stickers om af te drukken.
              </p>
            ) : (
              <div className="space-y-4">
                {stickers.map((sticker, i) => (
                  <div
                    key={i}
                    className="mx-auto rounded-lg border border-border bg-white px-6 py-5 text-black"
                    style={{ width: "370px", aspectRatio: "98 / 105" }}
                  >
                    <StickerCard sticker={sticker} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
