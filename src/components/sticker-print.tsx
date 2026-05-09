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

    const sortedPrices = [
      ...sticker.carpetPrices
        .filter((p) => p.carpet_dimension_name !== "Afwijkende maten")
        .sort((a, b) => a.carpet_dimension_name.localeCompare(b.carpet_dimension_name)),
      ...sticker.carpetPrices.filter((p) => p.carpet_dimension_name === "Afwijkende maten"),
    ];

    const totalRows = sortedPrices.length + (showM2 ? 1 : 0);
    const priceFont = totalRows > 8 ? "text-[9px]" : totalRows > 5 ? "text-[10px]" : "text-[11px]";

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

        {/* ── Inhoud: logo + naam + kleur + materiaal + prijzen als één blok ── */}
        <div>
          {/* Logo — vaste ruimte 100% breed × 60px hoog, zo groot mogelijk zonder vervorming */}
          {sticker.clientLogoUrl ? (
            <div style={{ position: "relative", width: "100%", height: "60px", marginBottom: "10px" }}>
              <Image src={sticker.clientLogoUrl} alt="" fill style={{ objectFit: "contain", objectPosition: "center" }} />
            </div>
          ) : (
            <div style={{ height: "10px" }} />
          )}

          {/* Naam + kleur + materiaal — LINKS uitgelijnd */}
          <div style={{ textAlign: "left", marginBottom: "10px" }}>
            <div style={{ fontWeight: 700, fontSize: "15px", textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1.2 }}>
              {sticker.qualityName}
            </div>
            <div style={{ fontSize: "12px", fontWeight: 400, marginTop: "3px" }}>
              Kleur {sticker.colorCode}
            </div>
            {sticker.materialType && (
              <div style={{ fontSize: "11px", marginTop: "2px" }}>
                {sticker.materialType}
              </div>
            )}
          </div>

          {/* Prijstabel direct onder naam/kleur */}
          {showTable && (
            <table className={`w-full ${priceFont}`} style={{ borderCollapse: "collapse" }}>
              <tbody>
                {sortedPrices.map((p, pi) => (
                  <tr key={pi}>
                    <td style={{ padding: "1.5px 0", textAlign: "left", width: "55%" }}>{formatCarpetDim(p.carpet_dimension_name)}</td>
                    <td style={{ padding: "1.5px 4px", textAlign: "center", width: "10%" }}>&euro;</td>
                    <td style={{ padding: "1.5px 0", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", width: "35%" }}>
                      {formatCents(p.price_cents)}
                    </td>
                  </tr>
                ))}
                {showM2 && (
                  <tr>
                    <td style={{ padding: "1.5px 0", textAlign: "left" }}>Afwijkende maten</td>
                    <td style={{ padding: "1.5px 4px", textAlign: "center" }}>&euro;</td>
                    <td style={{ padding: "1.5px 0", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {formatCents(sticker.m2PriceCents!)}/m&sup2;
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Lege ruimte tussen inhoud en disclaimer ── */}
        <div style={{ flex: 1 }} />

        {/* ── Disclaimer altijd onderaan, gecentreerd ── */}
        <div style={{ textAlign: "center", fontSize: "8px", lineHeight: 1.3, color: "#666", fontStyle: "italic" }}>
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
            width: 210mm;
            height: 297mm;
            margin: 0;
            box-sizing: border-box;
            display: flex !important;
            align-items: center;
            justify-content: center;
            background: white;
          }
          .sticker-print-page:last-child {
            page-break-after: avoid;
          }
          .sticker-inner {
            width: 98mm;
            height: 105mm;
            padding: 5mm 7mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            color: black;
            font-size: 10pt;
          }
          @page {
            size: A4;
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
            <div className="sticker-inner">
              <StickerCard sticker={sticker} />
            </div>
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
                    className="mx-auto overflow-hidden rounded-lg border border-border bg-white text-black shadow-sm"
                    style={{ width: "370px", height: `${Math.round(370 * 105 / 98)}px`, padding: "20px 28px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
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
