"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2 } from "lucide-react";

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
}

export default function ProductielijstPage() {
  const supabase = createClient();
  const [lijnen, setLijnen] = useState<ProductieLijn[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  // Filters
  const [filterKwaliteit, setFilterKwaliteit] = useState("");
  const [filterAfwerking, setFilterAfwerking] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("werkbon_lines")
      .select("id, werkbon_id, sample_id, quality_id, color_code_id, dimension_id, article_number, quality_name, color_code, dimension_name, afwerking, to_produce, status")
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
    try {
      // Boek voorraad op
      if (lijn.quality_id && lijn.color_code_id && lijn.dimension_id) {
        const { data: rows } = await supabase
          .from("finished_stock")
          .select("quality_id, color_code_id, dimension_id, finishing_type_id, location_id, quantity")
          .eq("quality_id", lijn.quality_id)
          .eq("color_code_id", lijn.color_code_id)
          .eq("dimension_id", lijn.dimension_id)
          .limit(1);
        if (rows && rows.length > 0) {
          const row = rows[0] as any;
          await supabase.from("finished_stock")
            .update({ quantity: row.quantity + lijn.to_produce })
            .eq("quality_id", row.quality_id)
            .eq("color_code_id", row.color_code_id)
            .eq("dimension_id", row.dimension_id)
            .eq("finishing_type_id", row.finishing_type_id)
            .eq("location_id", row.location_id);
        }
      }
      await (supabase as any).from("werkbon_lines")
        .update({ status: "gereed", completed_at: new Date().toISOString() })
        .eq("id", lijn.id);
      // Controleer of de hele werkbon klaar is
      const { data: openLeft } = await (supabase as any)
        .from("werkbon_lines")
        .select("id")
        .eq("werkbon_id", lijn.werkbon_id)
        .in("status", ["open", "gesneden"]);
      if (!openLeft?.length) {
        await (supabase as any).from("werkbonnen")
          .update({ status: "completed" })
          .eq("id", lijn.werkbon_id);
      }
      await load();
    } finally { setCompleting(null); }
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
                  <th className="py-2 px-4 text-left font-semibold">Kleur</th>
                  <th className="py-2 px-4 text-left font-semibold">Afmeting</th>
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
                    <td className="py-2.5 px-4 text-muted-foreground">{l.color_code}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{l.dimension_name}</td>
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
      </div>

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
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</div>
              <div>
                <h3 className="font-semibold text-foreground">Te snijden</h3>
                {totalSnijden > 0 && <p className="text-xs text-muted-foreground">{totalSnijden} stuks</p>}
              </div>
            </div>
            <Tabel lijnen={snijden} fase="snijden" />
          </div>

          {/* Fase 2: Afwerken */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">2</div>
              <div>
                <h3 className="font-semibold text-foreground">Te afwerken</h3>
                {totalAfwerken > 0 && <p className="text-xs text-muted-foreground">{totalAfwerken} stuks</p>}
              </div>
            </div>
            <Tabel lijnen={afwerken} fase="afwerken" />
          </div>
        </div>
      )}
    </div>
  );
}
