"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Wand2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─── Types ─────────────────────────────────────────── */

interface ParsedLine {
  kwaliteit: string;
  kleur: string;
  afmeting: string;
  afwerking: string;
  karpi_naam: string;
  bundel: string;
  collectie: string;
  locatie: string;
  min_voorraad: number;
  voorraad: number;
}

interface ResultLine { article: string; ok: boolean; msg: string }

interface SampleQuickCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

/* ─── Helpers ────────────────────────────────────────── */

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanDimension(s: string) {
  return s.replace(/\s*cm\s*$/i, "").replace(/\s+[xX×]\s+/g, "x").replace(/\s+bij\s+/i, "x").trim();
}

const COL_ALIASES: Record<string, string[]> = {
  kwaliteit:    ["kwaliteit", "kwal", "quality"],
  kleur:        ["kleur", "kleurcode", "color", "colour"],
  afmeting:     ["afmeting", "maat", "size", "formaat"],
  afwerking:    ["afwerking", "afwerk", "finishing"],
  karpi_naam:   ["karpi naam", "karpinaam", "naam", "karpi", "description", "omschrijving"],
  bundel:       ["bundel", "bundle", "doos"],
  collectie:    ["collectie", "collection"],
  locatie:      ["locatie", "location"],
  min_voorraad: ["min voorraad", "minvoorraad", "minimum", "min stock", "minstock", "min."],
  voorraad:     ["voorraad", "aantal", "stock", "actueel"],
};

function detectColMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const hn = normalize(h);
    for (const [key, aliases] of Object.entries(COL_ALIASES)) {
      if (!(key in map) && aliases.some(a => hn.includes(normalize(a)))) map[key] = i;
    }
  });
  return map;
}

function parseText(input: string): ParsedLine[] {
  const rawLines = input.split("\n");
  const hasTabs = rawLines.some(l => l.includes("\t"));

  if (hasTabs) {
    // TSV modus — detecteer header
    let colMap: Record<string, number> = {
      kwaliteit: 0, kleur: 1, afmeting: 2, afwerking: 3,
      karpi_naam: 4, bundel: 5, collectie: 6, locatie: 7, min_voorraad: 8, voorraad: 9,
    };
    let dataStart = 0;

    for (let i = 0; i < Math.min(5, rawLines.length); i++) {
      const cells = rawLines[i].split("\t").map(c => c.trim());
      const detected = detectColMap(cells);
      if (Object.keys(detected).length >= 2) { colMap = detected; dataStart = i + 1; break; }
    }

    return rawLines.slice(dataStart)
      .map(l => l.split("\t").map(c => c.trim()))
      .filter(cols => cols.filter(c => c).length >= 2)
      .map(cols => {
        const get = (k: string) => cols[colMap[k] ?? -1]?.trim() ?? "";
        return {
          kwaliteit:    get("kwaliteit"),
          kleur:        get("kleur"),
          afmeting:     cleanDimension(get("afmeting")),
          afwerking:    get("afwerking"),
          karpi_naam:   get("karpi_naam"),
          bundel:       get("bundel"),
          collectie:    get("collectie"),
          locatie:      get("locatie"),
          min_voorraad: parseInt(get("min_voorraad")) || 0,
          voorraad:     parseInt(get("voorraad")) || 0,
        };
      })
      .filter(l => l.kwaliteit || l.kleur);
  }

  // Vrije tekst modus — één staal per regel
  return rawLines
    .map(l => l.trim()).filter(Boolean)
    .map(raw => {
      let r = raw;
      const get = (pattern: RegExp) => { const m = r.match(pattern); if (m) { r = r.replace(m[0], " "); return m[1]?.trim() ?? ""; } return ""; };
      const bundel       = get(/bundel\s*:\s*([^,\n]+?)(?=,|collectie:|$)/i);
      const collectie    = get(/collectie\s*:\s*([^,\n]+?)(?=,|bundel:|$)/i);
      const locatie      = get(/\b([A-Z]-\d{1,2}-\d{1,2})\b/i);
      const afmeting     = cleanDimension(get(/\b(\d{2,3}[xX×]\d{2,3})\b/) || "");
      const voorraad     = parseInt(get(/\b(\d+)\s*(?:stuks?|st\.?)?\s*$/i)) || 0;
      const kwaliteit    = r.replace(/[,\s]+/g, " ").trim().split(/,/)[0]?.trim() ?? "";
      const kleur        = r.match(/\b(\d{1,3})\b/)?.[1] ?? "";
      return { kwaliteit, kleur, afmeting, afwerking: "", karpi_naam: "", bundel, collectie, locatie, min_voorraad: 0, voorraad };
    });
}

/* ─── Component ──────────────────────────────────────── */

export function SampleQuickCreateModal({ open, onOpenChange, onCreated }: SampleQuickCreateModalProps) {
  const supabase = createClient();

  const [inputText, setInputText]       = useState("");
  const [lines, setLines]               = useState<ParsedLine[]>([]);
  const [step, setStep]                 = useState<"input" | "preview" | "done">("input");
  const [creating, setCreating]         = useState(false);
  const [results, setResults]           = useState<ResultLine[]>([]);
  const [overrideExisting, setOverride] = useState(false);

  useEffect(() => {
    if (open) { setStep("input"); setInputText(""); setLines([]); setResults([]); setOverride(false); }
  }, [open]);

  function handleParse() {
    setLines(parseText(inputText));
    setStep("preview");
  }

  function updateLine(i: number, field: keyof ParsedLine, value: string | number) {
    setLines(prev => prev.map((l, li) => li === i ? { ...l, [field]: value } : l));
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, li) => li !== i));
  }

  async function getOrCreateDefaultLocation() {
    const { data: rows } = await (supabase as any)
      .from("locations").select("id")
      .eq("aisle", "-").eq("rack", "-").eq("level", "-").limit(1);
    if (rows?.[0]) return rows[0].id as string;
    const { data: created } = await (supabase as any)
      .from("locations").insert({ aisle: "-", rack: "-", level: "-" }).select("id").single();
    return created?.id ?? null;
  }

  async function handleCreate(onlyFailed = false, forceOverride?: boolean) {
    const shouldOverride = forceOverride ?? overrideExisting;
    setCreating(true);
    const res: ResultLine[] = onlyFailed ? results.filter(r => r.msg !== "Bestaat al") : [];
    const linesToProcess = onlyFailed ? lines.filter((_, i) => results[i]?.msg === "Bestaat al") : lines;

    const qualityCache  = new Map<string, { id: string; code: string }>();
    const colorCache    = new Map<string, string>();
    const dimCache      = new Map<string, string>();
    const finishCache   = new Map<string, string | null>();
    const bundleCache   = new Map<string, string>();
    const collCache     = new Map<string, string>();

    async function getOrCreateQuality(name: string) {
      const key = normalize(name);
      if (qualityCache.has(key)) return qualityCache.get(key)!;
      const { data: ex } = await supabase.from("qualities").select("id,code").ilike("name", name).maybeSingle();
      if (ex) { qualityCache.set(key, { id: ex.id, code: ex.code }); return { id: ex.id, code: ex.code }; }
      const code = name.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6);
      const { data: cr } = await supabase.from("qualities").insert({ name: name.trim(), code, active: true }).select("id,code").single();
      const r = { id: cr!.id, code: cr!.code };
      qualityCache.set(key, r);
      return r;
    }

    async function getOrCreateColor(code: string, qualityId: string) {
      const key = `${qualityId}|${normalize(code)}`;
      if (colorCache.has(key)) return colorCache.get(key)!;
      const { data: ex } = await supabase.from("color_codes").select("id").eq("quality_id", qualityId).ilike("code", code).maybeSingle();
      if (ex) { colorCache.set(key, ex.id); return ex.id; }
      const { data: cr } = await supabase.from("color_codes").insert({ code: code.trim(), name: code.trim(), quality_id: qualityId, active: true }).select("id").single();
      colorCache.set(key, cr!.id);
      return cr!.id;
    }

    async function getOrCreateDim(name: string) {
      const key = normalize(name);
      if (dimCache.has(key)) return dimCache.get(key)!;
      const { data: ex } = await supabase.from("sample_dimensions").select("id").ilike("name", name).maybeSingle();
      if (ex) { dimCache.set(key, ex.id); return ex.id; }
      const { data: cr } = await supabase.from("sample_dimensions").insert({ name: name.trim(), width_cm: 0, height_cm: 0 }).select("id").single();
      dimCache.set(key, cr!.id);
      return cr!.id;
    }

    async function getOrCreateFinishing(name: string) {
      if (!name.trim()) return null;
      const key = normalize(name);
      if (finishCache.has(key)) return finishCache.get(key)!;
      const { data: ex } = await supabase.from("finishing_types").select("id").ilike("name", name).maybeSingle();
      if (ex) { finishCache.set(key, ex.id); return ex.id; }
      const { data: cr } = await supabase.from("finishing_types").insert({ name: name.trim(), active: true }).select("id").single();
      finishCache.set(key, cr!.id);
      return cr!.id;
    }

    async function getOrCreateBundle(name: string, qualityId: string) {
      if (!name.trim()) return null;
      const key = normalize(name);
      if (bundleCache.has(key)) return bundleCache.get(key)!;
      const { data: cr } = await (supabase as any).from("bundles")
        .upsert({ name: name.trim(), quality_id: qualityId, active: true }, { onConflict: "name" })
        .select("id").single();
      bundleCache.set(key, cr!.id);
      return cr!.id as string;
    }

    async function getOrCreateCollection(name: string) {
      if (!name.trim()) return null;
      const key = normalize(name);
      if (collCache.has(key)) return collCache.get(key)!;
      const { data: cr } = await (supabase as any).from("collections")
        .upsert({ name: name.trim(), active: true }, { onConflict: "name" })
        .select("id").single();
      collCache.set(key, cr!.id);
      return cr!.id as string;
    }

    // Zorg dat default locatie beschikbaar is voor voorraad-inserts
    let defaultLocationId: string | null = null;

    for (const line of linesToProcess) {
      if (!line.kwaliteit || !line.kleur || !line.afmeting) {
        res.push({ article: [line.kwaliteit, line.kleur, line.afmeting].join(" "), ok: false, msg: "Verplicht veld ontbreekt" });
        continue;
      }

      try {
        const quality    = await getOrCreateQuality(line.kwaliteit);
        const colorId    = await getOrCreateColor(line.kleur, quality.id);
        const dimId      = await getOrCreateDim(line.afmeting);
        const finishId   = await getOrCreateFinishing(line.afwerking);
        const articleNum = `${quality.code}-${line.kleur.padStart(2,"0")}-${line.afmeting.toUpperCase().replace(/\s/g,"")}`;

        const { data: dup } = await supabase.from("samples").select("id").eq("article_number", articleNum).maybeSingle();

        let newSample: { id: string } | null = null;

        if (dup) {
          if (!shouldOverride) {
            res.push({ article: articleNum, ok: false, msg: "Bestaat al" });
            continue;
          }
          await supabase.from("samples").update({
            quality_id: quality.id, color_code_id: colorId, dimension_id: dimId,
            finishing_type_id: finishId, location: line.locatie || null, active: true,
            description: line.karpi_naam || null,
            min_stock: line.min_voorraad,
          }).eq("id", dup.id);
          newSample = dup;
        } else {
          const { data: inserted, error } = await supabase.from("samples").insert({
            quality_id: quality.id, color_code_id: colorId, dimension_id: dimId,
            finishing_type_id: finishId, location: line.locatie || null,
            description: line.karpi_naam || null,
            min_stock: line.min_voorraad, active: true, article_number: articleNum,
          }).select("id").single();
          if (error) throw error;
          newSample = inserted;
        }

        const bundleId = await getOrCreateBundle(line.bundel, quality.id);
        if (bundleId && newSample) {
          const { data: exBi } = await supabase.from("bundle_items").select("id").eq("bundle_id", bundleId).eq("sample_id", newSample.id).maybeSingle();
          if (!exBi) {
            const { data: maxP } = await supabase.from("bundle_items").select("position").eq("bundle_id", bundleId).order("position", { ascending: false }).limit(1).maybeSingle();
            await supabase.from("bundle_items").insert({ bundle_id: bundleId, sample_id: newSample.id, position: ((maxP as any)?.position ?? 0) + 1 });
          }
          const collId = await getOrCreateCollection(line.collectie);
          if (collId) {
            const { data: exCb } = await supabase.from("collection_bundles").select("id").eq("collection_id", collId).eq("bundle_id", bundleId).maybeSingle();
            if (!exCb) {
              const { data: maxP } = await supabase.from("collection_bundles").select("position").eq("collection_id", collId).order("position", { ascending: false }).limit(1).maybeSingle();
              await supabase.from("collection_bundles").insert({ collection_id: collId, bundle_id: bundleId, position: ((maxP as any)?.position ?? 0) + 1 });
            }
          }
        }

        if (line.voorraad > 0 && finishId) {
          if (!defaultLocationId) defaultLocationId = await getOrCreateDefaultLocation();
          if (defaultLocationId) {
            await (supabase as any).from("finished_stock").upsert({
              quality_id: quality.id,
              color_code_id: colorId,
              dimension_id: dimId,
              finishing_type_id: finishId,
              location_id: defaultLocationId,
              quantity: line.voorraad,
            }, { onConflict: "quality_id,color_code_id,dimension_id,finishing_type_id,location_id" });
          }
        }

        res.push({ article: articleNum, ok: true, msg: dup ? "Bijgewerkt" : "Aangemaakt" });
      } catch (e: any) {
        res.push({ article: line.kwaliteit, ok: false, msg: e?.message ?? "Fout" });
      }
    }

    setResults(res);
    setCreating(false);
    setStep("done");
    onCreated();
  }

  function downloadExcel() {
    const headers = ["Kwaliteit", "Kleur", "Afmeting", "Afwerking", "Karpi naam", "Bundel", "Collectie", "Locatie", "Min. voorraad", "Voorraad"];
    const example = ["VELVET TOUCH", "15", "30x50", "Blindzoom", "Velvet Touch Natural", "Velvet Doos 1", "Design collectie", "A-01-02", "25", "5"];
    const toCell = (v: string) => `<Cell><Data ss:Type="String">${v.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</Data></Cell>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#D9E1F2" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="Stalen"><Table>
<Row>${headers.map(h=>`<Cell ss:StyleID="h"><Data ss:Type="String">${h}</Data></Cell>`).join("")}</Row>
<Row>${example.map(toCell).join("")}</Row>
</Table></Worksheet></Workbook>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/vnd.ms-excel" }));
    a.download = "karpi-stalen-sjabloon.xls"; a.click();
  }

  function downloadCsv() {
    const headers = ["Kwaliteit", "Kleur", "Afmeting", "Afwerking", "Karpi naam", "Bundel", "Collectie", "Locatie", "Min. voorraad", "Voorraad"];
    const example = ["VELVET TOUCH", "15", "30x50", "Blindzoom", "Velvet Touch Natural", "Velvet Doos 1", "Design collectie", "A-01-02", "25", "5"];
    const csv = [headers, example].map(r => r.join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = "karpi-stalen-sjabloon.csv"; a.click();
  }

  if (!open) return null;

  const validLines = lines.filter(l => l.kwaliteit && l.kleur && l.afmeting);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-background shadow-xl ring-1 ring-border">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Wand2 size={18} className="text-primary" /> Slim stalen aanmaken
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Plak een tabel vanuit Excel/Sheets, of typ vrije tekst</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadExcel} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">↓ Excel</button>
            <button onClick={downloadCsv}   className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">↓ CSV</button>
            <button onClick={() => onOpenChange(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X size={18} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Stap 1: invoer */}
          {step === "input" && (
            <>
              <div className="rounded-xl bg-muted/40 px-4 py-3 text-xs space-y-1">
                <p className="font-semibold text-foreground">Vaste kolomvolgorde (sjabloon):</p>
                <p className="font-mono text-muted-foreground">Kwaliteit · Kleur · Afmeting · Afwerking · Karpi naam · Bundel · Collectie · Locatie · Min. voorraad · Voorraad</p>
                <p className="text-muted-foreground">Kopieer direct vanuit Excel of Google Sheets en plak hieronder. Kolomvolgorde wordt automatisch herkend.</p>
              </div>
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={"Plak hier je Excel-tabel (met headerrij)\nOf vrije tekst: VELVET TOUCH, 15, 30x50, Blindzoom"}
                autoFocus rows={12}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </>
          )}

          {/* Stap 2: preview + bewerken */}
          {step === "preview" && (
            <>
              <div className="flex items-center gap-3 text-sm">
                <span className="rounded-md bg-green-100 px-2 py-0.5 text-green-800 font-medium">{validLines.length} te maken</span>
                {lines.length - validLines.length > 0 && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-800 font-medium">{lines.length - validLines.length} onvolledig</span>}
                <span className="text-xs text-muted-foreground">Klik op een veld om te bewerken · ✕ = rij verwijderen</span>
              </div>
              <div className="overflow-x-auto rounded-xl ring-1 ring-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                      <th className="px-2 py-2 w-5"></th>
                      <th className="px-2 py-2 text-left">Kwaliteit *</th>
                      <th className="px-2 py-2 text-left">Kleur *</th>
                      <th className="px-2 py-2 text-left">Afmeting *</th>
                      <th className="px-2 py-2 text-left">Afwerking</th>
                      <th className="px-2 py-2 text-left">Karpi naam</th>
                      <th className="px-2 py-2 text-left">Bundel</th>
                      <th className="px-2 py-2 text-left">Collectie</th>
                      <th className="px-2 py-2 text-left">Locatie</th>
                      <th className="px-2 py-2 text-right">Min.vrd.</th>
                      <th className="px-2 py-2 text-right">Vrd.</th>
                      <th className="px-2 py-2 w-5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => {
                      const ok = !!(line.kwaliteit && line.kleur && line.afmeting);
                      const inp = (field: keyof ParsedLine, w: string, placeholder = "") => (
                        <input
                          value={String(line[field])}
                          onChange={e => updateLine(i, field, (field === "voorraad" || field === "min_voorraad") ? parseInt(e.target.value)||0 : e.target.value)}
                          placeholder={placeholder}
                          className={`${w} rounded border px-1 py-0.5 text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-ring ${!line[field] && ["kwaliteit","kleur","afmeting"].includes(field) ? "border-amber-400" : "border-transparent hover:border-border"}`}
                        />
                      );
                      return (
                        <tr key={i} className={`border-b border-border/40 ${ok ? "hover:bg-muted/20" : "bg-amber-50/50"}`}>
                          <td className="px-2 py-1 text-center">{ok ? <Check size={12} className="text-green-500 mx-auto" /> : <AlertTriangle size={12} className="text-amber-500 mx-auto" />}</td>
                          <td className="px-1 py-1">{inp("kwaliteit","w-32","kwaliteit")}</td>
                          <td className="px-1 py-1">{inp("kleur","w-14","kleur")}</td>
                          <td className="px-1 py-1">{inp("afmeting","w-16","30x50")}</td>
                          <td className="px-1 py-1">{inp("afwerking","w-24","optioneel")}</td>
                          <td className="px-1 py-1">{inp("karpi_naam","w-28","optioneel")}</td>
                          <td className="px-1 py-1">{inp("bundel","w-28","optioneel")}</td>
                          <td className="px-1 py-1">{inp("collectie","w-28","optioneel")}</td>
                          <td className="px-1 py-1">{inp("locatie","w-20","A-01-02")}</td>
                          <td className="px-1 py-1">
                            <input type="number" min={0} value={line.min_voorraad||""} onChange={e => updateLine(i,"min_voorraad",parseInt(e.target.value)||0)} placeholder="0" className="w-12 rounded border border-transparent hover:border-border px-1 py-0.5 text-xs text-right bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                          </td>
                          <td className="px-1 py-1">
                            <input type="number" min={0} value={line.voorraad||""} onChange={e => updateLine(i,"voorraad",parseInt(e.target.value)||0)} placeholder="0" className="w-12 rounded border border-transparent hover:border-border px-1 py-0.5 text-xs text-right bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                          </td>
                          <td className="px-1 py-1 text-center"><button onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive"><X size={12} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Stap 3: resultaten */}
          {step === "done" && (() => {
            const bestaanAl = results.filter(r => r.msg === "Bestaat al");
            return (
              <div className="space-y-3">
                {bestaanAl.length > 0 && !overrideExisting && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
                    <p className="text-sm font-medium text-amber-900">
                      {bestaanAl.length} staal{bestaanAl.length === 1 ? "" : "s"} bestond{bestaanAl.length === 1 ? "" : "en"} al. Wat wil je doen?
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={creating} onClick={(e) => { e.preventDefault(); handleCreate(true, true); }}>
                        {creating ? "Bezig..." : "Overschrijf bestaande"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={creating} onClick={() => onOpenChange(false)}>
                        Sla over en sluit
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  {results.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${r.ok ? "bg-green-50 text-green-800" : r.msg === "Bestaat al" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}>
                      {r.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
                      <span className="font-mono text-xs">{r.article}</span>
                      <span>{r.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          {step === "input" && <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button onClick={handleParse} disabled={!inputText.trim()}><Wand2 size={14} /> Verwerken</Button>
          </>}
          {step === "preview" && <>
            <Button variant="outline" onClick={() => setStep("input")}>Aanpassen</Button>
            <Button onClick={() => handleCreate()} disabled={creating || validLines.length === 0}>
              {creating ? "Bezig..." : `${validLines.length} staal${validLines.length === 1 ? "" : "s"} aanmaken`}
            </Button>
          </>}
          {step === "done" && <>
            <Button variant="outline" onClick={() => { setStep("input"); setInputText(""); setLines([]); setResults([]); }}>Nieuwe invoer</Button>
            <Button onClick={() => onOpenChange(false)}>Klaar</Button>
          </>}
        </div>
      </div>
    </div>
  );
}
