"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2, Download, FileText } from "lucide-react";
import { WeekplanningModal } from "@/components/weekplanning-modal";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ProductieLijn {
  id: string;
  werkbon_id: string;
  sample_id: string | null;
  quality_id: string | null;
  color_code_id: string | null;
  dimension_id: string | null;
  article_number: string;
  quality_name: string | null;
  color_code: string | null;
  dimension_name: string | null;
  afwerking: string | null;
  to_produce: number;
  status: string; // open | gesneden | gereed
  samples?: { description: string | null } | null;
}

export default function ProductielijstPage() {
  const supabase = createClient();
  const [lijnen, setLijnen] = useState<ProductieLijn[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [weekplanningOpen, setWeekplanningOpen] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Filters
  const [filterKwaliteit, setFilterKwaliteit] = useState("");
  const [filterAfwerking, setFilterAfwerking] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("werkbon_lines")
      .select("id, werkbon_id, sample_id, quality_id, color_code_id, dimension_id, article_number, quality_name, color_code, dimension_name, afwerking, to_produce, status, samples(description)")
      .in("status", ["open", "gesneden"])
      .order("afwerking").order("quality_name").order("color_code");
    setLijnen(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const kwaliteiten = [...new Set(lijnen.map(l => l.quality_name).filter(Boolean))].sort() as string[];
  const afwerkingen = [...new Set(lijnen.map(l => l.afwerking ?? "Geen afwerking").filter(Boolean))].sort() as string[];

  const snijden = lijnen.filter(l => l.status === "open"
    && (!filterKwaliteit || l.quality_name === filterKwaliteit)
    && (!filterAfwerking || (l.afwerking ?? "Geen afwerking") === filterAfwerking)
  );

  const afwerken = lijnen.filter(l => l.status === "gesneden"
    && (!filterKwaliteit || l.quality_name === filterKwaliteit)
    && (!filterAfwerking || (l.afwerking ?? "Geen afwerking") === filterAfwerking)
  );

  async function markGesneden(lijn: ProductieLijn) {
    setCompleting(lijn.id);
    try {
      await (supabase as any).from("werkbon_lines")
        .update({ status: "gesneden" })
        .eq("id", lijn.id);
      await load();
    } finally { setCompleting(null); }
  }

  async function markAfgewerkt(lijn: ProductieLijn) {
    setCompleting(lijn.id);
    setBookingError(null);
    try {
      if (lijn.quality_id && lijn.color_code_id && lijn.dimension_id) {
        // 1. finishing_type_id: eerst via sample, fallback via naam
        let finishing_type_id: string | null = null;
        if (lijn.sample_id) {
          const { data: sample } = await supabase
            .from("samples").select("finishing_type_id").eq("id", lijn.sample_id).single();
          finishing_type_id = (sample as any)?.finishing_type_id ?? null;
        }
        if (!finishing_type_id && lijn.afwerking) {
          const { data: ftRows } = await (supabase as any)
            .from("finishing_types").select("id").ilike("name", lijn.afwerking).limit(1);
          finishing_type_id = ftRows?.[0]?.id ?? null;
        }

        // 2. location_id: default locatie ophalen, aanmaken als die niet bestaat
        let location_id: string | null = null;
        const { data: locRows } = await (supabase as any)
          .from("locations").select("id")
          .eq("aisle", "-").eq("rack", "-").eq("level", "-").limit(1);
        if (locRows?.[0]) {
          location_id = locRows[0].id;
        } else {
          const { data: newLoc } = await (supabase as any)
            .from("locations").insert({ aisle: "-", rack: "-", level: "-" }).select("id").single();
          location_id = newLoc?.id ?? null;
        }

        if (!finishing_type_id || !location_id) {
          setBookingError(
            `Voorraad niet opgeboekt: ${!finishing_type_id ? `afwerking "${lijn.afwerking ?? "onbekend"}" niet gevonden in database` : "standaard locatie kon niet aangemaakt worden"}`
          );
          return;
        }

        // 3. Upsert finished_stock
        const { data: rows } = await (supabase as any)
          .from("finished_stock")
          .select("quantity")
          .eq("quality_id", lijn.quality_id)
          .eq("color_code_id", lijn.color_code_id)
          .eq("dimension_id", lijn.dimension_id)
          .eq("finishing_type_id", finishing_type_id)
          .eq("location_id", location_id)
          .limit(1);

        let stockError: { message: string } | null = null;
        if (rows && rows.length > 0) {
          const { error } = await (supabase as any).from("finished_stock")
            .update({ quantity: rows[0].quantity + lijn.to_produce })
            .eq("quality_id", lijn.quality_id)
            .eq("color_code_id", lijn.color_code_id)
            .eq("dimension_id", lijn.dimension_id)
            .eq("finishing_type_id", finishing_type_id)
            .eq("location_id", location_id);
          stockError = error;
        } else {
          const { error } = await (supabase as any).from("finished_stock").insert({
            quality_id: lijn.quality_id,
            color_code_id: lijn.color_code_id,
            dimension_id: lijn.dimension_id,
            finishing_type_id,
            location_id,
            quantity: lijn.to_produce,
          });
          stockError = error;
        }

        if (stockError) {
          setBookingError(`Voorraad niet opgeboekt: ${stockError.message}`);
          return;
        }
      }

      await (supabase as any).from("werkbon_lines")
        .update({ status: "gereed", completed_at: new Date().toISOString() })
        .eq("id", lijn.id);
      const { data: openLeft } = await (supabase as any)
        .from("werkbon_lines").select("id")
        .eq("werkbon_id", lijn.werkbon_id).in("status", ["open", "gesneden"]);
      if (!openLeft?.length) {
        await (supabase as any).from("werkbonnen")
          .update({ status: "completed" }).eq("id", lijn.werkbon_id);
      }
      await load();
    } finally { setCompleting(null); }
  }

  function exportNaarExcel(rijen: ProductieLijn[], fase: "snijden" | "afwerken") {
    const titel = fase === "snijden" ? "Te snijden" : "Te afwerken";
    const datum = new Date().toLocaleDateString("nl-NL").replace(/\//g, "-");

    // Groepeer op afwerking
    const groups = new Map<string, ProductieLijn[]>();
    for (const r of rijen) {
      const key = r.afwerking ?? "Geen afwerking";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    const rows: (string | number)[][] = [];

    // Titelbalk
    rows.push([`Productielijst — ${titel}`, "", "", "", "", ""]);
    rows.push([`Export datum: ${datum}`, "", "", "", "", ""]);
    rows.push(["", "", "", "", "", ""]);

    for (const [afwerkingKey, groepLijnen] of groups.entries()) {
      const groepTotaal = groepLijnen.reduce((s, l) => s + l.to_produce, 0);

      // Groepkoptekst
      rows.push([`Afwerking: ${afwerkingKey}`, "", "", "", "", `${groepTotaal} stuks`]);

      // Kolomkoppen
      rows.push(["Kwaliteit", "Naam", "Kleur", "Afmeting", "Afwerking", "Stuks"]);

      // Datarijen
      for (const l of groepLijnen) {
        rows.push([
          l.quality_name ?? "",
          l.samples?.description ?? "",
          l.color_code ?? "",
          l.dimension_name ?? "",
          l.afwerking ?? "",
          l.to_produce,
        ]);
      }

      // Subtotaal rij
      rows.push(["", "", "", "", "Subtotaal", groepTotaal]);
      rows.push(["", "", "", "", "", ""]);
    }

    // Eindtotaal
    const eindtotaal = rijen.reduce((s, l) => s + l.to_produce, 0);
    rows.push(["", "", "", "", "TOTAAL", eindtotaal]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Kolombreedte
    ws["!cols"] = [
      { wch: 16 }, { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 8 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, titel);
    XLSX.writeFile(wb, `productielijst_${fase}_${datum}.xlsx`);
  }

  function exportNaarPdf(rijen: ProductieLijn[], fase: "snijden" | "afwerken") {
    const titel = fase === "snijden" ? "Te snijden" : "Te afwerken";
    const datum = new Date().toLocaleDateString("nl-NL");
    const kleur = fase === "snijden" ? [37, 99, 235] : [124, 58, 237]; // blue-600 / violet-600

    const groups = new Map<string, ProductieLijn[]>();
    for (const r of rijen) {
      const key = r.afwerking ?? "Geen afwerking";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    // Koptekst
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Productielijst — ${titel}`, 14, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`Export: ${datum}`, 14, 22);
    doc.setTextColor(0, 0, 0);

    let y = 28;

    for (const [afwerkingKey, groepLijnen] of groups.entries()) {
      const groepTotaal = groepLijnen.reduce((s, l) => s + l.to_produce, 0);

      const body = groepLijnen.map(l => [
        l.quality_name ?? "",
        l.samples?.description ?? "",
        l.color_code ?? "",
        l.dimension_name ?? "",
        l.afwerking ?? "",
        l.to_produce.toString(),
      ]);

      // Subtotaalrij
      body.push(["", "", "", "", "Subtotaal", groepTotaal.toString()]);

      autoTable(doc, {
        startY: y,
        head: [[
          { content: `Afwerking: ${afwerkingKey}  —  ${groepTotaal} stuks`, colSpan: 6,
            styles: { fillColor: kleur as [number, number, number], textColor: 255, fontStyle: "bold", fontSize: 10 } },
        ], ["Kwaliteit", "Naam", "Kleur", "Afmeting", "Afwerking", "Stuks"]],
        body,
        theme: "striped",
        headStyles: { fillColor: [240, 240, 240], textColor: 60, fontStyle: "bold", fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 5: { halign: "right", fontStyle: "bold" } },
        didParseCell: (data) => {
          // Subtotaalrij: lichtgrijze achtergrond + bold
          if (data.section === "body" && data.row.index === body.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [230, 230, 230];
          }
          // Groepkoptekst (eerste head-rij) krijgt al kleur via head-def
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Eindtotaal
    const eindtotaal = rijen.reduce((s, l) => s + l.to_produce, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Totaal: ${eindtotaal} stuks`, 14, y + 2);

    doc.save(`productielijst_${fase}_${datum.replace(/\//g, "-")}.pdf`);
  }

  const Tabel = ({ lijnen: rijen, fase }: { lijnen: ProductieLijn[]; fase: "snijden" | "afwerken" }) => {
    if (rijen.length === 0) return (
      <p className="text-sm text-muted-foreground italic py-4 px-2">Niets te {fase === "snijden" ? "snijden" : "afwerken"}.</p>
    );

    // Groepeer op afwerking (voor snijden) of afwerking (voor afwerken)
    const groups = new Map<string, ProductieLijn[]>();
    for (const r of rijen) {
      const key = r.afwerking ?? "Geen afwerking";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    return (
      <div className="space-y-3">
        {Array.from(groups.entries()).map(([afwerkingKey, groepLijnen]) => (
          <div key={afwerkingKey} className="overflow-hidden rounded-xl ring-1 ring-border">
            <div className={`flex items-center justify-between px-4 py-2 ${fase === "snijden" ? "bg-blue-600" : "bg-violet-600"}`}>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/60">{fase === "snijden" ? "Snijden" : "Afwerking"}</p>
                <p className="font-bold text-white">{afwerkingKey}</p>
              </div>
              <span className="text-sm font-semibold text-white/70">
                {groepLijnen.reduce((s, l) => s + l.to_produce, 0)} stuks
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 px-4 text-left font-semibold">Kwaliteit</th>
                  <th className="py-2 px-4 text-left font-semibold">Naam</th>
                  <th className="py-2 px-4 text-left font-semibold">Kleur</th>
                  <th className="py-2 px-4 text-left font-semibold">Afmeting</th>
                  <th className="py-2 px-4 text-left font-semibold">Afwerking</th>
                  <th className="py-2 px-4 text-right font-semibold">Stuks</th>
                  <th className="py-2 px-3 text-center font-semibold w-16">
                    {fase === "snijden" ? "Gesneden" : "Afgewerkt"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {groepLijnen.map((l, i) => (
                  <tr key={l.id} className={`border-b border-border/30 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                    <td className="py-2.5 px-4 font-medium">{l.quality_name}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{l.samples?.description ?? <span className="italic text-muted-foreground/40">—</span>}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{l.color_code}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{l.dimension_name}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{l.afwerking ?? <span className="italic text-muted-foreground/50">—</span>}</td>
                    <td className="py-2.5 px-4 text-right text-base font-bold">{l.to_produce}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => fase === "snijden" ? markGesneden(l) : markAfgewerkt(l)}
                        disabled={completing !== null}
                        title={fase === "snijden" ? "Markeer als gesneden" : "Markeer als afgewerkt + boek voorraad"}
                        className={`rounded-full p-1 transition-colors disabled:opacity-30 ${
                          fase === "snijden"
                            ? "text-blue-400 hover:bg-blue-50 hover:text-blue-700"
                            : "text-violet-400 hover:bg-violet-50 hover:text-violet-700"
                        }`}
                      >
                        <CheckCircle2 size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };

  const totalSnijden = lijnen.filter(l => l.status === "open").reduce((s, l) => s + l.to_produce, 0);
  const totalAfwerken = lijnen.filter(l => l.status === "gesneden").reduce((s, l) => s + l.to_produce, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">Productielijst</h2>
          <p className="mt-1 text-sm text-muted-foreground">Overzicht van alle openstaande snij- en afwerktaken</p>
        </div>
        <Button onClick={() => setWeekplanningOpen(true)}>
          Weekplanning werkbon
        </Button>
      </div>

      <WeekplanningModal
        open={weekplanningOpen}
        onOpenChange={setWeekplanningOpen}
        onSaved={() => { setWeekplanningOpen(false); load(); }}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterKwaliteit}
          onChange={e => setFilterKwaliteit(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Alle kwaliteiten</option>
          {kwaliteiten.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select
          value={filterAfwerking}
          onChange={e => setFilterAfwerking(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Alle afwerkingen</option>
          {afwerkingen.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {(filterKwaliteit || filterAfwerking) && (
          <button onClick={() => { setFilterKwaliteit(""); setFilterAfwerking(""); }} className="text-sm text-muted-foreground hover:text-foreground underline">
            Filter wissen
          </button>
        )}
      </div>

      {bookingError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <span><strong>Fout bij opboeken voorraad:</strong> {bookingError}</span>
          <button onClick={() => setBookingError(null)} className="shrink-0 text-red-500 hover:text-red-700 font-bold">✕</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : lijnen.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-green-200 bg-green-50 py-12 text-center">
          <CheckCircle2 size={36} className="text-green-600 mb-3" />
          <p className="text-lg font-semibold text-green-800">Niets te doen</p>
          <p className="text-sm text-muted-foreground mt-1">Alle werkbonnen zijn afgewerkt.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
          {/* Fase 1: Snijden */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</div>
                <div>
                  <h3 className="font-semibold text-foreground">Te snijden</h3>
                  {totalSnijden > 0 && <p className="text-xs text-muted-foreground">{totalSnijden} stuks</p>}
                </div>
              </div>
              {snijden.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportNaarExcel(snijden, "snijden")} className="gap-1.5">
                    <Download size={14} /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportNaarPdf(snijden, "snijden")} className="gap-1.5">
                    <FileText size={14} /> PDF
                  </Button>
                </div>
              )}
            </div>
            <Tabel lijnen={snijden} fase="snijden" />
          </div>

          {/* Fase 2: Afwerken */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">2</div>
                <div>
                  <h3 className="font-semibold text-foreground">Te afwerken</h3>
                  {totalAfwerken > 0 && <p className="text-xs text-muted-foreground">{totalAfwerken} stuks</p>}
                </div>
              </div>
              {afwerken.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportNaarExcel(afwerken, "afwerken")} className="gap-1.5">
                    <Download size={14} /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportNaarPdf(afwerken, "afwerken")} className="gap-1.5">
                    <FileText size={14} /> PDF
                  </Button>
                </div>
              )}
            </div>
            <Tabel lijnen={afwerken} fase="afwerken" />
          </div>
        </div>
      )}
    </div>
  );
}
