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

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .sticker-print-area,
          .sticker-print-area * {
            visibility: visible !important;
          }
          .sticker-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }
          .sticker-container {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 8mm !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Modal overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center no-print">
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

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <p className="text-center text-sm text-muted-foreground">Laden...</p>
            ) : stickers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Geen stickers om af te drukken.
              </p>
            ) : (
              <div ref={printRef} className="sticker-print-area space-y-4">
                {stickers.map((sticker, i) => (
                  <div
                    key={i}
                    className="sticker-container rounded-lg border border-border bg-white p-5 text-black"
                  >
                    {/* Client logo */}
                    {sticker.clientLogoUrl && (
                      <div className="mb-3">
                        <div className="relative h-12 w-32">
                          <Image
                            src={sticker.clientLogoUrl}
                            alt=""
                            fill
                            className="object-contain object-left"
                          />
                        </div>
                      </div>
                    )}

                    {/* Quality name */}
                    <div className="mb-1 text-lg font-bold uppercase tracking-wide">
                      {sticker.qualityName}
                    </div>

                    {/* Color */}
                    <div className="mb-0.5 text-sm font-medium">
                      Kleur {sticker.colorCode}
                      {sticker.colorName && sticker.colorName !== sticker.colorCode && (
                        <span className="ml-1 text-gray-600">({sticker.colorName})</span>
                      )}
                    </div>

                    {/* Material */}
                    {sticker.materialType && (
                      <div className="mb-3 text-sm text-gray-600">
                        {sticker.materialType}
                      </div>
                    )}

                    {/* Prices */}
                    {sticker.prices.length > 0 && (
                      <div className="mb-3 space-y-0.5 text-sm">
                        {sticker.prices
                          .filter((p) => p.dimensionName !== "Afwijkende maten")
                          .map((p, pi) => (
                            <div key={pi} className="flex justify-between">
                              <span>{p.dimensionName}</span>
                              <span className="font-medium">
                                &euro; {formatCents(p.priceCents)}/{formatUnit(p.unit)}
                              </span>
                            </div>
                          ))}
                        {sticker.prices
                          .filter((p) => p.dimensionName === "Afwijkende maten")
                          .map((p, pi) => (
                            <div key={`afw-${pi}`} className="flex justify-between">
                              <span>Afwijkende maten</span>
                              <span className="font-medium">
                                &euro; {formatCents(p.priceCents)}/{formatUnit(p.unit)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Disclaimer */}
                    <div className="text-[10px] leading-tight text-gray-500 italic">
                      {DISCLAIMER}
                    </div>
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
