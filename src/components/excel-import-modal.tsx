"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Upload, Download, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

/* ─── Types ──────────────────────────────────────────── */

interface ImportRow {
  kwaliteit: string;
  kleurcode: string;
  kleurnaam: string;
  afmeting: string;
  voorraad: number;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

interface ExcelImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

/* ─── Helpers ────────────────────────────────────────── */

/** Capitalize first letter of each word */
function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Component ──────────────────────────────────────── */

export function ExcelImportModal({ open, onOpenChange, onImported }: ExcelImportModalProps) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  /* ─── Export template ─── */

  async function handleExport() {
    // Fetch current samples + stock
    const [{ data: samples }, { data: stockData }] = await Promise.all([
      supabase
        .from("samples")
        .select("*, qualities(name, code), color_codes(name, code), sample_dimensions(name)")
        .eq("active", true)
        .order("quality_id"),
      supabase
        .from("finished_stock")
        .select("quality_id, color_code_id, dimension_id, quantity"),
    ]);

    // Aggregate stock per sample key
    const stockMap = new Map<string, number>();
    for (const s of stockData ?? []) {
      const k = `${s.quality_id}|${s.color_code_id}|${s.dimension_id}`;
      stockMap.set(k, (stockMap.get(k) ?? 0) + s.quantity);
    }

    const rows = (samples ?? []).map((s: any) => {
      const k = `${s.quality_id}|${s.color_code_id}|${s.dimension_id}`;
      return {
        Kwaliteit: s.qualities?.name ?? "",
        Kleurcode: s.color_codes?.code ?? "",
        Kleurnaam: s.color_codes?.name ?? "",
        Afmeting: s.sample_dimensions?.name ?? "",
        Voorraad: stockMap.get(k) ?? 0,
      };
    });

    if (rows.length === 0) {
      rows.push({
        Kwaliteit: "",
        Kleurcode: "",
        Kleurnaam: "",
        Afmeting: "",
        Voorraad: 0,
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 20 }, // Kwaliteit
      { wch: 12 }, // Kleurcode
      { wch: 20 }, // Kleurnaam
      { wch: 12 }, // Afmeting
      { wch: 10 }, // Voorraad
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stalen");
    XLSX.writeFile(wb, "karpi-stalen-export.xlsx");
  }

  /* ─── Parse uploaded file ─── */

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);
    setResult(null);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

        const parsed: ImportRow[] = [];
        const errors: string[] = [];

        // Helper: case-insensitive column lookup
        function getCol(row: Record<string, any>, name: string): any {
          // Try exact match first
          if (row[name] !== undefined) return row[name];
          // Try case-insensitive match
          const lower = name.toLowerCase();
          for (const key of Object.keys(row)) {
            if (key.toLowerCase() === lower) return row[key];
          }
          return undefined;
        }

        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          const rowNum = i + 2; // Excel row number (1-based + header)

          const kwaliteit = String(getCol(row, "Kwaliteit") ?? "").trim();
          const kleurcode = String(getCol(row, "Kleurcode") ?? "").trim();
          const kleurnaam = String(getCol(row, "Kleurnaam") ?? "").trim();
          const afmeting = String(getCol(row, "Afmeting") ?? "").trim();
          const voorraad = Number(getCol(row, "Voorraad") ?? 0);

          if (!kwaliteit) {
            errors.push(`Rij ${rowNum}: Kwaliteit is verplicht`);
            continue;
          }
          if (!kleurcode) {
            errors.push(`Rij ${rowNum}: Kleurcode is verplicht`);
            continue;
          }
          if (!afmeting) {
            errors.push(`Rij ${rowNum}: Afmeting is verplicht`);
            continue;
          }

          parsed.push({
            kwaliteit: kwaliteit.toUpperCase(),
            kleurcode,
            kleurnaam: capitalize(kleurnaam || kleurcode),
            afmeting,
            voorraad: isNaN(voorraad) ? 0 : voorraad,
          });
        }

        if (errors.length > 0 && parsed.length === 0) {
          setParseError(errors.join("\n"));
          setPreview([]);
        } else {
          if (errors.length > 0) {
            setParseError(`${errors.length} rij(en) overgeslagen:\n${errors.join("\n")}`);
          }
          setPreview(parsed);
        }
      } catch {
        setParseError("Kan bestand niet lezen. Zorg dat het een geldig .xlsx of .xls bestand is.");
        setPreview([]);
      }
    };
    reader.readAsArrayBuffer(f);
  }

  /* ─── Import ─── */

  async function handleImport() {
    if (preview.length === 0) return;
    setImporting(true);

    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    try {
      // Load reference data
      const [{ data: qualities }, { data: colors }, { data: dims }] = await Promise.all([
        supabase.from("qualities").select("id, name, code").eq("active", true),
        supabase.from("color_codes").select("id, quality_id, code, name, hex_color").eq("active", true),
        supabase.from("sample_dimensions").select("id, name"),
      ]);

      const qualityMap = new Map<string, string>();
      for (const q of qualities ?? []) {
        qualityMap.set(q.name.toLowerCase(), q.id);
        qualityMap.set(q.code.toLowerCase(), q.id);
      }

      const dimMap = new Map<string, string>();
      for (const d of dims ?? []) {
        dimMap.set(d.name.toLowerCase(), d.id);
      }

      // Build color lookup: quality_id|code -> color
      const colorMap = new Map<string, { id: string; quality_id: string }>();
      for (const c of colors ?? []) {
        colorMap.set(`${c.quality_id}|${c.code.toLowerCase()}`, { id: c.id, quality_id: c.quality_id });
      }

      // Load current stock totals
      const { data: stockData } = await supabase
        .from("finished_stock")
        .select("quality_id, color_code_id, dimension_id, location_id, quantity");
      const currentStockMap = new Map<string, number>();
      for (const s of stockData ?? []) {
        const k = `${s.quality_id}|${s.color_code_id}|${s.dimension_id}`;
        currentStockMap.set(k, (currentStockMap.get(k) ?? 0) + s.quantity);
      }

      // Load default location + finishing type for stock inserts
      const { data: defaultLoc } = await supabase
        .from("locations")
        .select("id")
        .limit(1)
        .single();
      const { data: defaultFt } = await supabase
        .from("finishing_types")
        .select("id")
        .limit(1)
        .maybeSingle();

      for (let i = 0; i < preview.length; i++) {
        const row = preview[i];
        const rowNum = i + 2;

        // Resolve quality
        const qualityId = qualityMap.get(row.kwaliteit.toLowerCase());
        if (!qualityId) {
          errors.push(`Rij ${rowNum}: Kwaliteit "${row.kwaliteit}" niet gevonden`);
          continue;
        }

        // Resolve dimension
        const dimId = dimMap.get(row.afmeting.toLowerCase());
        if (!dimId) {
          errors.push(`Rij ${rowNum}: Afmeting "${row.afmeting}" niet gevonden`);
          continue;
        }

        // Resolve or create color
        const colorKey = `${qualityId}|${row.kleurcode.toLowerCase()}`;
        let colorId: string;
        const existing = colorMap.get(colorKey);

        if (existing) {
          colorId = existing.id;

          // Always update name with proper capitalization
          await supabase.from("color_codes").update({ name: row.kleurnaam }).eq("id", colorId);
        } else {
          // Create new color code
          const { data: newColor, error: colorErr } = await supabase
            .from("color_codes")
            .insert({
              quality_id: qualityId,
              code: row.kleurcode,
              name: row.kleurnaam,
              active: true,
            })
            .select("id")
            .single();

          if (colorErr || !newColor) {
            errors.push(`Rij ${rowNum}: Kleur aanmaken mislukt — ${colorErr?.message}`);
            continue;
          }
          colorId = newColor.id;
          colorMap.set(colorKey, { id: colorId, quality_id: qualityId });
        }

        // Upsert sample
        const { data: existingSample } = await supabase
          .from("samples")
          .select("id")
          .eq("quality_id", qualityId)
          .eq("color_code_id", colorId)
          .eq("dimension_id", dimId)
          .maybeSingle();

        if (existingSample) {
          const { error } = await supabase
            .from("samples")
            .update({ active: true })
            .eq("id", existingSample.id);

          if (error) {
            errors.push(`Rij ${rowNum}: Update mislukt — ${error.message}`);
          } else {
            updated++;
          }
        } else {
          const { error } = await supabase
            .from("samples")
            .insert({
              quality_id: qualityId,
              color_code_id: colorId,
              dimension_id: dimId,
              active: true,
            });

          if (error) {
            errors.push(`Rij ${rowNum}: Aanmaken mislukt — ${error.message}`);
          } else {
            created++;
          }
        }

        // Update stock if value changed
        const sKey = `${qualityId}|${colorId}|${dimId}`;
        const currentStock = currentStockMap.get(sKey) ?? 0;
        const desiredStock = row.voorraad;

        if (desiredStock !== currentStock && defaultLoc && defaultFt) {
          const diff = desiredStock - currentStock;

          // Find existing stock row at default location + finishing type
          const { data: existingRow } = await supabase
            .from("finished_stock")
            .select("quantity")
            .eq("quality_id", qualityId)
            .eq("color_code_id", colorId)
            .eq("dimension_id", dimId)
            .eq("location_id", defaultLoc.id)
            .eq("finishing_type_id", defaultFt.id)
            .maybeSingle();

          if (existingRow) {
            await supabase
              .from("finished_stock")
              .update({ quantity: existingRow.quantity + diff })
              .eq("quality_id", qualityId)
              .eq("color_code_id", colorId)
              .eq("dimension_id", dimId)
              .eq("location_id", defaultLoc.id)
              .eq("finishing_type_id", defaultFt.id);
          } else if (diff > 0) {
            await supabase
              .from("finished_stock")
              .insert({
                quality_id: qualityId,
                color_code_id: colorId,
                dimension_id: dimId,
                location_id: defaultLoc.id,
                finishing_type_id: defaultFt.id,
                quantity: diff,
              });
          }
        }
      }
    } catch (err: any) {
      errors.push(`Onverwachte fout: ${err.message}`);
    }

    setResult({ created, updated, errors });
    setImporting(false);

    if (created > 0 || updated > 0) {
      onImported();
    }
  }

  /* ─── Reset ─── */

  function handleClose() {
    setFile(null);
    setPreview([]);
    setResult(null);
    setParseError(null);
    onOpenChange(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-background p-6 ring-1 ring-border shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Excel Import
          </h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step 1: Download template */}
        {!result && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Stap 1: Download huidige stalen</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Download een Excel met alle stalen en hun actuele voorraad. Pas waarden aan of voeg rijen toe en importeer het bestand weer.
              </p>
              <Button variant="outline" onClick={handleExport}>
                <Download size={14} /> Download Excel
              </Button>
            </div>

            {/* Step 2: Upload */}
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Stap 2: Upload bestand</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Selecteer het ingevulde Excel bestand. Kolommen: Kwaliteit, Kleurcode, Kleurnaam, Afmeting, Voorraad.
              </p>

              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />

              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
              >
                <FileSpreadsheet size={14} />
                {file ? file.name : "Kies bestand..."}
              </Button>
            </div>

            {/* Parse errors */}
            {parseError && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  <pre className="text-sm text-amber-800 whitespace-pre-wrap">{parseError}</pre>
                </div>
              </div>
            )}

            {/* Preview */}
            {preview.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Voorbeeld ({preview.length} rijen)
                </h3>
                <div className="overflow-x-auto rounded-lg ring-1 ring-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Kwaliteit</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Naam</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Afmeting</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Voorraad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-3 py-1.5">{row.kwaliteit}</td>
                          <td className="px-3 py-1.5 font-mono">{row.kleurcode}</td>
                          <td className="px-3 py-1.5">{row.kleurnaam}</td>
                          <td className="px-3 py-1.5">{row.afmeting}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{row.voorraad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 10 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      ...en {preview.length - 10} meer rijen
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={handleClose}>
                    Annuleren
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={importing}
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    {importing ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Importeren...
                      </>
                    ) : (
                      <>
                        <Upload size={14} /> Importeer {preview.length} rijen
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-300 bg-green-50 p-4">
              <div className="flex items-start gap-2">
                <CheckCircle size={16} className="mt-0.5 shrink-0 text-green-600" />
                <div className="text-sm text-green-800">
                  <p className="font-semibold">Import voltooid</p>
                  <p className="mt-1">
                    {result.created > 0 && <>{result.created} nieuw aangemaakt</>}
                    {result.created > 0 && result.updated > 0 && ", "}
                    {result.updated > 0 && <>{result.updated} bijgewerkt</>}
                    {result.created === 0 && result.updated === 0 && "Geen wijzigingen"}
                  </p>
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold">{result.errors.length} fout(en)</p>
                    <ul className="mt-1 list-inside list-disc space-y-0.5">
                      {result.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleClose}>Sluiten</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
