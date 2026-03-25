"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Printer } from "lucide-react";
import Image from "next/image";

/* ─── Types ──────────────────────────────────────────── */

interface StickerData {
  bundleName: string;
  qualityName: string;
  materialType: string;
  colorCode: string;
  colorName: string;
  clientLogoUrl: string | null;
  prices: { dimensionName: string; priceCents: number; unit: string }[];
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
  return `${euros},${rest.toString().padStart(2, "0")}`;
}

function formatUnit(unit: string): string {
  switch (unit) {
    case "piece":
      return "St.";
    case "m2":
      return "m\u00B2";
    default:
      return unit;
  }
}

const DISCLAIMER =
  "Ook in het rond mogelijk. Er kan een geringe maatafwijking van +/- 3% alsmede kleine kleurafwijking optreden.";

/* ─── Component ──────────────────────────────────────── */

export function StickerPrint({ orderId, clientId, open, onOpenChange }: StickerPrintProps) {
  const supabase = createClient();
  const [stickers, setStickers] = useState<StickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Get order lines with bundles and colors
    const { data: orderLines } = await supabase
      .from("order_lines")
      .select(
        "*, bundles(*, qualities(id, name, material_type), bundle_colors(*, color_codes(id, code, name)))"
      )
      .eq("order_id", orderId);

    // Get client info
    const { data: client } = await supabase
      .from("clients")
      .select("logo_url")
      .eq("id", clientId)
      .single();

    const clientLogoUrl = client?.logo_url ?? null;

    // Get all quality IDs from bundles
    const qualityIds = new Set<string>();
    for (const line of orderLines ?? []) {
      const bundle = (line as any).bundles;
      if (bundle?.quality_id) qualityIds.add(bundle.quality_id);
    }

    // Get custom quality names for this client
    const { data: customNames } = await supabase
      .from("client_quality_names")
      .select("quality_id, custom_name")
      .eq("client_id", clientId)
      .in("quality_id", Array.from(qualityIds));

    const customNameMap = new Map<string, string>();
    for (const cn of customNames ?? []) {
      customNameMap.set(cn.quality_id, cn.custom_name);
    }

    // Get client carpet prices
    const { data: pricesData } = await supabase
      .from("client_carpet_prices")
      .select("*, carpet_dimensions(name)")
      .eq("client_id", clientId)
      .in("quality_id", Array.from(qualityIds));

    // Group prices by quality_id
    const pricesByQuality = new Map<
      string,
      { dimensionName: string; priceCents: number; unit: string }[]
    >();
    for (const p of (pricesData ?? []) as any[]) {
      const arr = pricesByQuality.get(p.quality_id) ?? [];
      arr.push({
        dimensionName: p.carpet_dimensions?.name ?? "Onbekend",
        priceCents: p.price_cents,
        unit: p.unit,
      });
      pricesByQuality.set(p.quality_id, arr);
    }

    // Build stickers: one per bundle per color
    const stickerList: StickerData[] = [];
    for (const line of orderLines ?? []) {
      const bundle = (line as any).bundles;
      if (!bundle) continue;

      const qualityId = bundle.quality_id;
      const qualityName =
        customNameMap.get(qualityId) ?? bundle.qualities?.name ?? "Onbekend";
      const materialType = bundle.qualities?.material_type ?? "";

      const prices = pricesByQuality.get(qualityId) ?? [];

      for (const bc of bundle.bundle_colors ?? []) {
        const colorCode = bc.color_codes?.code ?? "";
        const colorName = bc.color_codes?.name ?? "";

        stickerList.push({
          bundleName: bundle.name,
          qualityName,
          materialType,
          colorCode,
          colorName,
          clientLogoUrl,
          prices,
        });
      }
    }

    setStickers(stickerList);
    setLoading(false);
  }, [supabase, orderId, clientId]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  function handlePrint() {
    window.print();
  }

  if (!open) return null;

  /* Shared sticker markup used in both preview and print */
  function StickerCard({ sticker }: { sticker: StickerData }) {
    return (
      <>
        {/* Client logo */}
        {sticker.clientLogoUrl && (
          <div className="mb-4">
            <div className="relative mx-auto h-10 w-28">
              <Image
                src={sticker.clientLogoUrl}
                alt=""
                fill
                className="object-contain"
              />
            </div>
          </div>
        )}

        {/* Quality name */}
        <div className="mb-0.5 text-base font-bold uppercase tracking-wide">
          {sticker.qualityName}
        </div>

        {/* Color */}
        <div className="text-sm font-medium">
          Kleur {sticker.colorCode}
        </div>

        {/* Material */}
        {sticker.materialType && (
          <div className="mb-4 text-sm text-black">
            {sticker.materialType}
          </div>
        )}
        {!sticker.materialType && <div className="mb-4" />}

        {/* Prices — 3-column table: dimension | € | price/unit */}
        {sticker.prices.length > 0 && (
          <table className="mb-4 w-full text-sm">
            <tbody>
              {[
                ...sticker.prices
                  .filter((p) => p.dimensionName !== "Afwijkende maten")
                  .sort((a, b) => a.dimensionName.localeCompare(b.dimensionName)),
                ...sticker.prices.filter((p) => p.dimensionName === "Afwijkende maten"),
              ].map((p, pi) => (
                <tr key={pi}>
                  <td className="py-0 pr-4 text-left">{p.dimensionName}</td>
                  <td className="py-0 pr-1 text-right">&euro;</td>
                  <td className="py-0 text-right font-medium whitespace-nowrap">
                    {formatCents(p.priceCents)}/{formatUnit(p.unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Disclaimer */}
        <div className="text-[10px] leading-tight text-gray-500 italic text-center">
          {DISCLAIMER}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          /* Hide everything via visibility so layout is preserved */
          body * {
            visibility: hidden !important;
          }
          /* Show only the print area and its children */
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
            width: 100mm;
            min-height: 60mm;
            padding: 5mm;
            margin: 0 auto;
            display: flex !important;
            flex-direction: column;
            justify-content: center;
            background: white;
            color: black;
            font-size: 11pt;
          }
          .sticker-print-page:last-child {
            page-break-after: avoid;
          }
          @page {
            size: auto;
            margin: 10mm;
          }
        }
        @media screen {
          .sticker-print-root {
            display: none !important;
          }
        }
      `}</style>

      {/* Hidden print-only area — rendered OUTSIDE the modal at body level via portal-like positioning */}
      <div className="sticker-print-root" ref={printRef}>
        {stickers.map((sticker, i) => (
          <div key={i} className="sticker-print-page">
            <StickerCard sticker={sticker} />
          </div>
        ))}
      </div>

      {/* Modal overlay — screen only */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />

        {/* Modal */}
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-background ring-1 ring-border shadow-xl">
          {/* Header */}
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

          {/* Preview content */}
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
                    style={{ maxWidth: "360px" }}
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
