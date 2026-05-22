"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Printer, Pencil, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { getOrderFulfillment, type FulfillmentLine } from "@/lib/order-fulfillment";
import type { CarpetPrice } from "@/lib/pricing";
import { applySalesPrice } from "@/lib/pricing";

/* ─── Types ──────────────────────────────────────────── */

interface StickerData {
  qualityKarpiName: string;
  qualityClientName: string;
  materialType: string;
  colorCode: string;
  colorName: string;
  clientLogoUrl: string | null;
  carpetPrices: CarpetPrice[];
  m2InkoopCents: number | null;
}

interface EditRow {
  id: string;
  dimension: string;
  priceStr: string; // bewerkbare prijs als string (leeg = geen prijs)
}

interface StickerEdit {
  qualityName: string;
  colorCode: string;
  rows: EditRow[];
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

const FACTOR_OPTIONS = [2.3, 2.4, 2.5, 2.6, 3.0];

export function StickerPrint({ orderId, open, onOpenChange }: StickerPrintProps) {
  const supabase = createClient();
  const [stickers, setStickers] = useState<StickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Sticker-instellingen — initieel vanuit order, bewerkbaar in modal
  const [showPrices, setShowPrices] = useState(true);
  const [nameType, setNameType] = useState<"karpi" | "client">("karpi");
  const [activeFactor, setActiveFactor] = useState<number>(2.5);
  // Per-sticker bewerkingen (index → StickerEdit)
  const [stickerEdits, setStickerEdits] = useState<Record<number, StickerEdit>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const [portalMounted, setPortalMounted] = useState(false);
  useEffect(() => { setPortalMounted(true); }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const fulfillment = await getOrderFulfillment(supabase, orderId);
    if (!fulfillment) {
      setStickers([]);
      setLoading(false);
      return;
    }
    setShowPrices(fulfillment.order.showPricesOnSticker);
    setNameType(fulfillment.order.stickerNameType);
    setActiveFactor(fulfillment.order.priceFactor ?? 2.5);
    const stickerList: StickerData[] = fulfillment.lines.map((line: FulfillmentLine) => ({
      qualityKarpiName: line.qualityKarpiName,
      qualityClientName: line.qualityName,
      materialType: line.materialType ?? "",
      colorCode: line.colorCode,
      colorName: line.colorName,
      clientLogoUrl: fulfillment.client.logoUrl,
      carpetPrices: line.carpetPrices,
      m2InkoopCents: line.m2InkoopCents,
    }));
    setStickers(stickerList);
    setLoading(false);
  }, [supabase, orderId]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  function initEdit(index: number) {
    const s = stickers[index];
    if (!s) return;
    const qualityName = nameType === "client" ? s.qualityClientName : s.qualityKarpiName;
    const rows: EditRow[] = [
      ...s.carpetPrices
        .filter((p) => p.carpet_dimension_name !== "Afwijkende maten")
        .sort((a, b) => a.carpet_dimension_name.localeCompare(b.carpet_dimension_name)),
      ...s.carpetPrices.filter((p) => p.carpet_dimension_name === "Afwijkende maten"),
    ].map((p, i) => ({
      id: `p-${i}`,
      dimension: p.carpet_dimension_name,
      priceStr: showPrices ? String(applySalesPrice(p.inkoop_cents, activeFactor) / 100) : "",
    }));
    if (s.m2InkoopCents && s.m2InkoopCents > 0) {
      rows.push({
        id: "m2",
        dimension: "Afwijkende maten",
        priceStr: showPrices ? String(applySalesPrice(s.m2InkoopCents, activeFactor) / 100) : "",
      });
    }
    setStickerEdits((prev) => ({ ...prev, [index]: { qualityName, colorCode: s.colorCode, rows } }));
    setEditingIndex(index);
  }

  function updateEdit(index: number, patch: Partial<StickerEdit>) {
    setStickerEdits((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  }

  function updateRow(index: number, rowId: string, patch: Partial<EditRow>) {
    setStickerEdits((prev) => {
      const edit = prev[index];
      if (!edit) return prev;
      return { ...prev, [index]: { ...edit, rows: edit.rows.map((r) => r.id === rowId ? { ...r, ...patch } : r) } };
    });
  }

  function addRow(index: number) {
    setStickerEdits((prev) => {
      const edit = prev[index];
      if (!edit) return prev;
      const newRow: EditRow = { id: `new-${Date.now()}`, dimension: "", priceStr: "" };
      return { ...prev, [index]: { ...edit, rows: [...edit.rows, newRow] } };
    });
  }

  function removeRow(index: number, rowId: string) {
    setStickerEdits((prev) => {
      const edit = prev[index];
      if (!edit) return prev;
      return { ...prev, [index]: { ...edit, rows: edit.rows.filter((r) => r.id !== rowId) } };
    });
  }

  async function saveSettings() {
    setSaving(true);
    await (supabase as any).from("orders").update({
      show_prices_on_sticker: showPrices,
      sticker_name_type: nameType,
      price_factor: activeFactor,
    }).eq("id", orderId);
    setSaving(false);
  }

  async function handlePrint() {
    await saveSettings();
    window.print();
  }

  if (!open) return null;

  function StickerCard({ sticker, edit }: { sticker: StickerData; edit?: StickerEdit }) {
    const qualityName = edit?.qualityName ?? (nameType === "client" ? sticker.qualityClientName : sticker.qualityKarpiName);
    const colorCode = edit?.colorCode ?? sticker.colorCode;

    // Rijen: vanuit edit als aanwezig, anders vanuit sticker data
    type Row = { id: string; dimension: string; retail_cents: number | null; isM2: boolean };
    let rows: Row[];
    if (edit) {
      rows = edit.rows.map((r) => {
        const parsed = parseFloat(r.priceStr.replace(",", "."));
        return { id: r.id, dimension: r.dimension, retail_cents: r.priceStr && !isNaN(parsed) ? Math.round(parsed * 100) : null, isM2: r.dimension === "Afwijkende maten" };
      });
    } else {
      const sorted = [
        ...sticker.carpetPrices.filter((p) => p.carpet_dimension_name !== "Afwijkende maten").sort((a, b) => a.carpet_dimension_name.localeCompare(b.carpet_dimension_name)),
        ...sticker.carpetPrices.filter((p) => p.carpet_dimension_name === "Afwijkende maten"),
      ];
      rows = sorted.map((p, i) => ({ id: `p-${i}`, dimension: p.carpet_dimension_name, retail_cents: applySalesPrice(p.inkoop_cents, activeFactor), isM2: false }));
      if (sticker.m2InkoopCents && sticker.m2InkoopCents > 0) {
        rows.push({ id: "m2", dimension: "Afwijkende maten", retail_cents: applySalesPrice(sticker.m2InkoopCents, activeFactor), isM2: true });
      }
    }

    const showTable = rows.length > 0;
    const totalRows = rows.length;
    const priceFont = totalRows > 8 ? "text-[9px]" : totalRows > 5 ? "text-[10px]" : "text-[11px]";

    return (
      <div style={{ position: "relative", height: "100%" }}>

        {sticker.clientLogoUrl ? (
          <div style={{ textAlign: "center", marginBottom: "8px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sticker.clientLogoUrl} alt="" loading="eager"
              style={{ maxWidth: "100%", maxHeight: "55px", objectFit: "contain", display: "inline-block" }} />
          </div>
        ) : null}

        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 700, fontSize: "15px", textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1.2 }}>
            {qualityName}
          </div>
          <div style={{ fontSize: "12px", fontWeight: 400, marginTop: "3px" }}>
            Kleur {colorCode}
          </div>
          {sticker.materialType && (
            <div style={{ fontSize: "11px", marginTop: "2px" }}>
              {sticker.materialType}
            </div>
          )}
          {showTable && (
            <table className={`w-full ${priceFont}`} style={{ borderCollapse: "collapse", marginTop: "4px" }}>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: "1.5px 0", textAlign: "left", width: showPrices ? "55%" : "100%" }}>{formatCarpetDim(row.dimension)}</td>
                    {showPrices && row.retail_cents != null && <>
                      <td style={{ padding: "1.5px 4px", textAlign: "center", width: "10%" }}>&euro;</td>
                      <td style={{ padding: "1.5px 0", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", width: "35%" }}>
                        {formatCents(row.retail_cents)}{row.isM2 ? "/m²" : ""}
                      </td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center", fontSize: "10px", lineHeight: 1.4, color: "#444", fontStyle: "italic" }}>
          {DISCLAIMER}
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media screen {
          .sticker-print-root { display: none !important; }
        }
        @media print {
          body > *:not(.sticker-print-root) { display: none !important; }
          .sticker-print-root {
            display: block !important;
            width: 108mm;
          }
          .sticker-print-page {
            width: 108mm;
            height: 108mm;
            margin: 0; padding: 0;
            box-sizing: border-box;
            background: white;
            position: relative;
          }
          .sticker-print-page:not(:last-child) {
            page-break-after: always;
            break-after: page;
          }
          .sticker-inner {
            width: 108mm;
            height: 108mm;
            padding: 15mm 15mm 10mm 15mm;
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
            color: black;
            font-size: 10pt;
            transform: rotate(90deg);
            transform-origin: center center;
          }
          @page { size: 108mm 108mm; margin: 0; }
        }
      `}</style>

      {portalMounted && createPortal(
        <div className="sticker-print-root" ref={printRef}>
          {stickers.map((sticker, i) => (
            <div key={i} className="sticker-print-page">
              <div className="sticker-inner">
                <StickerCard sticker={sticker} edit={stickerEdits[i]} />
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}

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
            <div className="flex items-center gap-4 flex-wrap">
            {/* Namen */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Naam:</span>
              {(["karpi", "client"] as const).map((t) => (
                <button key={t} onClick={() => setNameType(t)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${nameType === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                  {t === "karpi" ? "Karpi" : "Klant"}
                </button>
              ))}
            </div>
            {/* Prijzen aan/uit */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Prijzen:</span>
              <button onClick={() => setShowPrices(true)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${showPrices ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                Ja
              </button>
              <button onClick={() => setShowPrices(false)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${!showPrices ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                Nee
              </button>
            </div>
            {/* Factor */}
            {showPrices && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1">Factor:</span>
                {FACTOR_OPTIONS.map((f) => (
                  <button key={f} onClick={() => setActiveFactor(f)}
                    className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${activeFactor === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                    ×{f}
                  </button>
                ))}
              </div>
            )}
            <Button size="sm" onClick={handlePrint} disabled={loading || stickers.length === 0 || saving}>
              <Printer size={14} /> {saving ? "Opslaan..." : "Afdrukken"}
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
            <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Printvenster: papierformaat <strong>Karpi sticker 108x108</strong>, schaal <strong>100%</strong>, marges <strong>Geen</strong>, kop-/voetteksten <strong>uit</strong>. Eén sticker per label.
            </div>
            {loading ? (
              <p className="text-center text-sm text-muted-foreground">Laden...</p>
            ) : stickers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Geen stickers om af te drukken.
              </p>
            ) : (
              <div className="space-y-4">
                {stickers.map((sticker, i) => {
                  const edit = stickerEdits[i];
                  const isEditing = editingIndex === i;
                  return (
                    <div key={i} className="mx-auto" style={{ width: "370px" }}>
                      {/* Sticker preview — 108×108mm vierkant label, ~3.43px per mm */}
                      <div className="relative overflow-hidden rounded-lg border border-border bg-white text-black shadow-sm"
                        style={{ height: "370px", padding: "51px 51px 34px 51px", boxSizing: "border-box" }}>
                        <StickerCard sticker={sticker} edit={edit} />
                        <button
                          onClick={() => isEditing ? setEditingIndex(null) : initEdit(i)}
                          className="absolute top-2 right-2 rounded-md bg-white/80 p-1.5 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground border border-border"
                          title="Sticker bewerken"
                        >
                          <Pencil size={13} />
                        </button>
                      </div>

                      {/* Edit panel */}
                      {isEditing && edit && (
                        <div className="mt-2 rounded-lg border border-border bg-card p-3 space-y-3 text-sm">
                          {/* Naam + kleur */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Kwaliteit naam</label>
                              <input value={edit.qualityName} onChange={(e) => updateEdit(i, { qualityName: e.target.value })}
                                className="w-full rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Kleur</label>
                              <input value={edit.colorCode} onChange={(e) => updateEdit(i, { colorCode: e.target.value })}
                                className="w-full rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                            </div>
                          </div>

                          {/* Rijen */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Afmetingen &amp; prijzen</span>
                              <button onClick={() => addRow(i)}
                                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground border border-border">
                                <Plus size={11} /> Rij toevoegen
                              </button>
                            </div>
                            {edit.rows.map((row) => (
                              <div key={row.id} className="flex items-center gap-1.5">
                                <input value={row.dimension} onChange={(e) => updateRow(i, row.id, { dimension: e.target.value })}
                                  placeholder="Afmeting (bijv. 160x230)"
                                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                                <span className="text-muted-foreground text-xs">€</span>
                                <input value={row.priceStr} onChange={(e) => updateRow(i, row.id, { priceStr: e.target.value })}
                                  placeholder="prijs"
                                  className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring" />
                                <button onClick={() => removeRow(i, row.id)}
                                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>

                          <button onClick={() => setEditingIndex(null)}
                            className="w-full rounded-md bg-primary text-primary-foreground py-1 text-xs font-medium hover:opacity-90">
                            Klaar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
