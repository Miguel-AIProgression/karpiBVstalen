"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, CheckCircle2, Trash2 } from "lucide-react";

interface WerkbonLine {
  id: string;
  sample_id: string | null;
  quality_id: string | null;
  color_code_id: string | null;
  dimension_id: string | null;
  article_number: string;
  quality_name: string | null;
  color_code: string | null;
  dimension_name: string | null;
  afwerking: string | null;
  location: string | null;
  to_produce: number;
  status: string;
}

function formatDate(dt: string) {
  return new Date(dt).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function WerkbonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [orderNumbers, setOrderNumbers] = useState<string[]>([]);
  const [createdAt, setCreatedAt] = useState("");
  const [status, setStatus] = useState("open");
  const [lines, setLines] = useState<WerkbonLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: wb }, { data: orders }, { data: linesData }] = await Promise.all([
      (supabase as any).from("werkbonnen").select("id, created_at, status").eq("id", id).single(),
      (supabase as any).from("werkbon_orders").select("order_number").eq("werkbon_id", id),
      (supabase as any).from("werkbon_lines").select("*").eq("werkbon_id", id).eq("status", "open"),
    ]);
    if (!wb) { setLoading(false); return; }
    setCreatedAt(wb.created_at);
    setStatus(wb.status);
    setOrderNumbers((orders ?? []).map((o: any) => o.order_number).sort());
    setLines(linesData ?? []);
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => { load(); }, [load]);

  async function bookStock(line: WerkbonLine) {
    if (!line.quality_id || !line.color_code_id || !line.dimension_id) return;
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
  }

  async function markLineGereed(line: WerkbonLine) {
    setCompleting(line.id);
    try {
      await bookStock(line);
      await (supabase as any).from("werkbon_lines")
        .update({ status: "gereed", completed_at: new Date().toISOString() })
        .eq("id", line.id);
      await load();
    } finally { setCompleting(null); }
  }

  async function markAllGereed() {
    setCompleting("all");
    try {
      for (const line of lines) await bookStock(line);
      await (supabase as any).from("werkbon_lines")
        .update({ status: "gereed", completed_at: new Date().toISOString() })
        .eq("werkbon_id", id).eq("status", "open");
      await (supabase as any).from("werkbonnen").update({ status: "completed" }).eq("id", id);
      await load();
    } finally { setCompleting(null); }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Laden...</div>;

  const isCompleted = status === "completed" || lines.length === 0;
  const totalStuds = lines.reduce((s, l) => s + l.to_produce, 0);

  // Groepeer op afwerking, gesorteerd
  const groups = new Map<string, WerkbonLine[]>();
  for (const l of [...lines].sort((a, b) => {
    const ak = (a.afwerking ?? "—") + (a.quality_name ?? "") + (a.color_code ?? "");
    const bk = (b.afwerking ?? "—") + (b.quality_name ?? "") + (b.color_code ?? "");
    return ak.localeCompare(bk);
  })) {
    const key = l.afwerking ?? "Geen afwerking";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => router.back()} className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> Terug
          </button>
          <h2 className="text-2xl font-bold">Werkbon</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orderNumbers.join(", ")} · {formatDate(createdAt)}
          </p>
          {!isCompleted && (
            <p className="mt-1 text-sm font-medium text-amber-700">{totalStuds} stuks bijmaken</p>
          )}
        </div>
        <div className="flex gap-2">
          {!isCompleted && (
            <Button onClick={markAllGereed} disabled={completing !== null} className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle2 size={14} />
              {completing === "all" ? "Bezig..." : "Alles gereed"}
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={14} /> Afdrukken
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!confirm("Werkbon verwijderen? Alle regels verdwijnen ook van de productielijst.")) return;
              await (supabase as any).from("werkbonnen").delete().eq("id", id);
              router.push("/orders?tab=werkbonnen");
            }}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={14} /> Verwijderen
          </Button>
        </div>
      </div>

      {isCompleted ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-green-200 bg-green-50 py-12 text-center">
          <CheckCircle2 size={40} className="text-green-600 mb-3" />
          <p className="text-lg font-semibold text-green-800">Werkbon voltooid</p>
          <p className="text-sm text-muted-foreground mt-1">Alle regels zijn gereed gemeld.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([afwerking, groupLines]) => (
            <div key={afwerking} className="overflow-hidden rounded-2xl ring-1 ring-border">
              {/* Afwerking header */}
              <div className="flex items-center justify-between bg-foreground px-5 py-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/50">Afwerking</p>
                  <p className="text-base font-bold text-white">{afwerking}</p>
                </div>
                <span className="text-sm font-semibold text-white/70">
                  {groupLines.reduce((s, l) => s + l.to_produce, 0)} stuks
                </span>
              </div>

              {/* Tabel */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 px-4 text-left font-semibold">Kwaliteit</th>
                    <th className="py-2 px-4 text-left font-semibold">Kleur</th>
                    <th className="py-2 px-4 text-left font-semibold">Afmeting</th>
                    <th className="py-2 px-4 text-right font-semibold">Stuks</th>
                    <th className="py-2 px-4 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {groupLines.map((l, i) => (
                    <tr key={l.id} className={`border-b border-border/30 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                      <td className="py-2.5 px-4 font-medium">{l.quality_name}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{l.color_code}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{l.dimension_name}</td>
                      <td className="py-2.5 px-4 text-right text-lg font-bold text-foreground">{l.to_produce}</td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={() => markLineGereed(l)}
                          disabled={completing !== null}
                          className="rounded-full p-1 text-muted-foreground hover:bg-green-100 hover:text-green-700 disabled:opacity-30 transition-colors"
                          title="Gereed melden"
                        >
                          <CheckCircle2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media print {
          body > *:not(main) { display: none; }
          .no-print { display: none !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
