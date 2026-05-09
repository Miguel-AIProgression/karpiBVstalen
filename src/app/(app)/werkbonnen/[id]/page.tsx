"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, CheckCircle2 } from "lucide-react";

interface WerkbonLine {
  id: string;
  sample_id: string | null;
  quality_id: string | null;
  color_code_id: string | null;
  dimension_id: string | null;
  collection_name: string | null;
  bundle_name: string | null;
  article_number: string;
  quality_name: string | null;
  color_code: string | null;
  dimension_name: string | null;
  afwerking: string | null;
  location: string | null;
  to_produce: number;
  status: string;
}

interface Werkbon {
  id: string;
  created_at: string;
  status: string;
  order_numbers: string[];
  lines: WerkbonLine[];
}

function groupLines(lines: WerkbonLine[]) {
  const collMap = new Map<string, Map<string, WerkbonLine[]>>();
  const loose: WerkbonLine[] = [];
  for (const l of lines) {
    if (l.bundle_name && l.collection_name) {
      if (!collMap.has(l.collection_name)) collMap.set(l.collection_name, new Map());
      const bm = collMap.get(l.collection_name)!;
      if (!bm.has(l.bundle_name)) bm.set(l.bundle_name, []);
      bm.get(l.bundle_name)!.push(l);
    } else {
      loose.push(l);
    }
  }
  return { collMap, loose };
}

function formatDate(dt: string) {
  return new Date(dt).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function WerkbonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [werkbon, setWerkbon] = useState<Werkbon | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null); // lineId of 'all'

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: wb }, { data: orders }, { data: lines }] = await Promise.all([
      (supabase as any).from("werkbonnen").select("id, created_at, status").eq("id", id).single(),
      (supabase as any).from("werkbon_orders").select("order_number").eq("werkbon_id", id),
      (supabase as any).from("werkbon_lines").select("*").eq("werkbon_id", id).eq("status", "open").order("collection_name").order("bundle_name").order("article_number"),
    ]);
    if (!wb) { setLoading(false); return; }
    setWerkbon({
      id: wb.id,
      created_at: wb.created_at,
      status: wb.status,
      order_numbers: (orders ?? []).map((o: any) => o.order_number).sort(),
      lines: lines ?? [],
    });
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => { load(); }, [load]);

  async function bookStock(line: WerkbonLine) {
    if (!line.quality_id || !line.color_code_id || !line.dimension_id) return;
    // Zoek bestaande finished_stock rij
    const { data: rows } = await supabase
      .from("finished_stock")
      .select("quality_id, color_code_id, dimension_id, finishing_type_id, location_id, quantity")
      .eq("quality_id", line.quality_id)
      .eq("color_code_id", line.color_code_id)
      .eq("dimension_id", line.dimension_id)
      .limit(1);

    if (rows && rows.length > 0) {
      const row = rows[0] as any;
      await supabase.from("finished_stock")
        .update({ quantity: row.quantity + line.to_produce })
        .eq("quality_id", row.quality_id)
        .eq("color_code_id", row.color_code_id)
        .eq("dimension_id", row.dimension_id)
        .eq("finishing_type_id", row.finishing_type_id)
        .eq("location_id", row.location_id);
    }
    // Als er geen rij is, sla voorraad opboeken over (geen default finishing/locatie beschikbaar)
  }

  async function markLineGereed(line: WerkbonLine) {
    setCompleting(line.id);
    try {
      await bookStock(line);
      await (supabase as any).from("werkbon_lines")
        .update({ status: "gereed", completed_at: new Date().toISOString() })
        .eq("id", line.id);
      await load();
    } finally {
      setCompleting(null);
    }
  }

  async function markAllGereed() {
    if (!werkbon) return;
    setCompleting("all");
    try {
      for (const line of werkbon.lines) {
        await bookStock(line);
        await (supabase as any).from("werkbon_lines")
          .update({ status: "gereed", completed_at: new Date().toISOString() })
          .eq("id", line.id);
      }
      await (supabase as any).from("werkbonnen").update({ status: "completed" }).eq("id", id);
      await load();
    } finally {
      setCompleting(null);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Laden...</div>;
  if (!werkbon) return <div className="p-6 text-sm text-red-600">Werkbon niet gevonden.</div>;

  const openLines = werkbon.lines;
  const isCompleted = werkbon.status === "completed" || openLines.length === 0;
  const { collMap, loose } = groupLines(openLines);

  const SampleTable = ({ lines }: { lines: WerkbonLine[] }) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
          <th className="py-1 px-3 text-left">Artikel</th>
          <th className="py-1 px-3 text-left">Kwaliteit</th>
          <th className="py-1 px-3 text-left">Kleur</th>
          <th className="py-1 px-3 text-left">Afm.</th>
          <th className="py-1 px-3 text-left">Afwerking</th>
          <th className="py-1 px-3 text-left">Locatie</th>
          <th className="py-1 px-3 text-right">Bijmaken</th>
          <th className="py-1 px-3 text-right">Gereed</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.id} className={`border-b border-border/30 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
            <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{l.article_number}</td>
            <td className="py-2 px-3">{l.quality_name}</td>
            <td className="py-2 px-3">{l.color_code}</td>
            <td className="py-2 px-3 text-muted-foreground">{l.dimension_name}</td>
            <td className="py-2 px-3 text-muted-foreground">{l.afwerking ?? "—"}</td>
            <td className="py-2 px-3 text-muted-foreground">{l.location ?? "—"}</td>
            <td className="py-2 px-3 text-right font-bold text-amber-700">{l.to_produce}</td>
            <td className="py-2 px-3 text-right">
              <button
                onClick={() => markLineGereed(l)}
                disabled={completing !== null}
                className="rounded-lg p-1 text-muted-foreground hover:bg-green-50 hover:text-green-700 disabled:opacity-40"
                title="Regel gereed melden"
              >
                <CheckCircle2 size={16} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.back()} className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> Terug
          </button>
          <h2 className="text-2xl font-bold">Werkbon</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {werkbon.order_numbers.join(", ")} · {formatDate(werkbon.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isCompleted && (
            <Button
              onClick={markAllGereed}
              disabled={completing !== null}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle2 size={14} />
              {completing === "all" ? "Bezig..." : "Hele werkbon gereed"}
            </Button>
          )}
          <Button variant="outline" onClick={handlePrint}>
            <Printer size={14} /> Afdrukken
          </Button>
        </div>
      </div>

      {isCompleted ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-green-200 bg-green-50 py-12 text-center">
          <CheckCircle2 size={40} className="text-green-600 mb-3" />
          <p className="text-lg font-semibold text-green-800">Werkbon voltooid</p>
          <p className="text-sm text-muted-foreground mt-1">Alle regels zijn gereed gemeld en voorraad is opgeboekt.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Collecties */}
          {Array.from(collMap.entries()).map(([collName, bundleMap]) => (
            <div key={collName} className="rounded-2xl border-2 border-foreground/10 overflow-hidden">
              <div className="bg-foreground/5 px-5 py-3 border-b border-foreground/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Collectie</p>
                <p className="text-base font-bold">{collName}</p>
              </div>
              <div className="divide-y divide-border/50 px-4 pb-4 space-y-3 pt-3">
                {Array.from(bundleMap.entries()).map(([bundleName, lines]) => (
                  <div key={bundleName} className="overflow-hidden rounded-xl ring-1 ring-border">
                    <div className="flex items-center justify-between border-l-4 border-amber-400 bg-amber-50 px-4 py-2">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-amber-700">Bundel</p>
                        <p className="text-sm font-semibold">{bundleName}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{lines.reduce((s, l) => s + l.to_produce, 0)} stuks</span>
                    </div>
                    <SampleTable lines={lines} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Losse stalen */}
          {loose.length > 0 && (
            <div className="overflow-hidden rounded-2xl ring-1 ring-border">
              <div className="bg-muted/40 px-5 py-3 border-b border-border">
                <p className="text-sm font-bold">Losse stalen</p>
              </div>
              <SampleTable lines={loose} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
