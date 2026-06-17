"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, FileText, Users, AlertTriangle, ChevronDown, ChevronRight, X } from "lucide-react";
import { compareCarpetDims } from "@/lib/carpet-dims";
import { isNoMarginPriceList } from "@/lib/articles";

/* ─── Types ──────────────────────────────────────────── */

interface PriceListRow {
  nr: string;
  name: string;
  valid_from: string;
  active: boolean;
  line_count: number;
  client_count: number;
  client_names: string[];
}

interface QualityOpt {
  id: string;
  code: string;
  name: string;
}

interface CarpetDimOpt {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
}

interface SourceLine {
  quality_id: string;
  carpet_dimension_id: string | null;
  price_cents: number;
  unit: "piece" | "m2";
}

/* ─── Component ──────────────────────────────────────── */

export default function PrijslijstenPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<PriceListRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [newNr, setNewNr] = useState("");
  const [newName, setNewName] = useState("");
  const [newValidFrom, setNewValidFrom] = useState("");
  const [createMode, setCreateMode] = useState<"scratch" | "copy">("scratch");
  const [sourceListNr, setSourceListNr] = useState<string>("");
  const [copyPrices, setCopyPrices] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Structuur-data voor stap 2
  const [allQualities, setAllQualities] = useState<QualityOpt[]>([]);
  const [allCarpetDims, setAllCarpetDims] = useState<CarpetDimOpt[]>([]);
  const [sourceLines, setSourceLines] = useState<SourceLine[]>([]);
  const [selectedQualities, setSelectedQualities] = useState<Set<string>>(new Set());
  /** Map<quality_id, Set<carpet_dimension_id>> — alleen ingevuld voor geselecteerde qualities */
  const [selectedDims, setSelectedDims] = useState<Map<string, Set<string>>>(new Map());
  const [expandedQualities, setExpandedQualities] = useState<Set<string>>(new Set());
  const [structureSearch, setStructureSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: lists },
      { data: lineCounts },
      { data: clients },
    ] = await Promise.all([
      supabase
        .from("price_lists")
        .select("nr, name, valid_from, active")
        .order("nr"),
      supabase
        .from("price_list_lines")
        .select("price_list_nr"),
      supabase
        .from("clients")
        .select("name, price_list_nr")
        .eq("active", true)
        .not("price_list_nr", "is", null),
    ]);

    const lineCountMap = new Map<string, number>();
    for (const l of (lineCounts ?? []) as { price_list_nr: string }[]) {
      lineCountMap.set(l.price_list_nr, (lineCountMap.get(l.price_list_nr) ?? 0) + 1);
    }

    const clientsByList = new Map<string, string[]>();
    for (const c of (clients ?? []) as { name: string; price_list_nr: string }[]) {
      const arr = clientsByList.get(c.price_list_nr) ?? [];
      arr.push(c.name);
      clientsByList.set(c.price_list_nr, arr);
    }

    const mapped: PriceListRow[] = ((lists ?? []) as { nr: string; name: string; valid_from: string; active: boolean }[]).map((l) => ({
      nr: l.nr,
      name: l.name,
      valid_from: l.valid_from,
      active: l.active,
      line_count: lineCountMap.get(l.nr) ?? 0,
      client_count: (clientsByList.get(l.nr) ?? []).length,
      client_names: clientsByList.get(l.nr) ?? [],
    }));

    setRows(mapped);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const totalClients = rows.reduce((sum, r) => sum + r.client_count, 0);
  const listsWithoutClients = rows.filter((r) => r.client_count === 0).length;

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.nr.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.client_names.some((n) => n.toLowerCase().includes(q))
    );
  });

  function resetCreate() {
    setCreating(false);
    setStep(1);
    setNewNr("");
    setNewName("");
    setNewValidFrom("");
    setCreateMode("scratch");
    setSourceListNr("");
    setCopyPrices(true);
    setSelectedQualities(new Set());
    setSelectedDims(new Map());
    setExpandedQualities(new Set());
    setSourceLines([]);
    setStructureSearch("");
    setError("");
    setSubmitting(false);
  }

  async function openCreateModal() {
    setCreating(true);
    setStep(1);
    if (allQualities.length === 0 || allCarpetDims.length === 0) {
      const [{ data: qs }, { data: cds }] = await Promise.all([
        supabase.from("qualities").select("id, code, name").eq("active", true).order("code"),
        supabase
          .from("carpet_dimensions")
          .select("id, name, width_cm, height_cm")
          .eq("active", true)
          .order("width_cm")
          .order("height_cm"),
      ]);
      setAllQualities((qs ?? []) as QualityOpt[]);
      setAllCarpetDims(((cds ?? []) as CarpetDimOpt[]).slice().sort(compareCarpetDims));
    }
  }

  async function handleNextStep() {
    setError("");
    const nrTrim = newNr.trim();
    const nameTrim = newName.trim();
    if (!nrTrim || !nameTrim) {
      setError("Nummer en naam zijn verplicht.");
      return;
    }
    if (rows.some((r) => r.nr === nrTrim)) {
      setError(`Prijslijst-nummer "${nrTrim}" bestaat al.`);
      return;
    }
    if (createMode === "copy") {
      if (!sourceListNr) {
        setError("Kies een bron-prijslijst om van te kopiëren.");
        return;
      }
      const { data: lines } = await supabase
        .from("price_list_lines")
        .select("quality_id, carpet_dimension_id, price_cents, unit")
        .eq("price_list_nr", sourceListNr);
      const sl = (lines ?? []) as unknown as SourceLine[];
      setSourceLines(sl);
      // Pre-fill selectie op basis van bron-regels (alleen piece, m² blijft buiten scope)
      const qSet = new Set<string>();
      const dMap = new Map<string, Set<string>>();
      for (const l of sl) {
        if (l.unit !== "piece" || !l.carpet_dimension_id) continue;
        qSet.add(l.quality_id);
        const cur = dMap.get(l.quality_id) ?? new Set<string>();
        cur.add(l.carpet_dimension_id);
        dMap.set(l.quality_id, cur);
      }
      setSelectedQualities(qSet);
      setSelectedDims(dMap);
    } else {
      setSourceLines([]);
      setSelectedQualities(new Set());
      setSelectedDims(new Map());
    }
    setStep(2);
  }

  function toggleQuality(qid: string) {
    setSelectedQualities((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) {
        next.delete(qid);
        setSelectedDims((dm) => {
          const ndm = new Map(dm);
          ndm.delete(qid);
          return ndm;
        });
      } else {
        next.add(qid);
        // Default: alle actieve afmetingen aanvinken
        setSelectedDims((dm) => {
          const ndm = new Map(dm);
          ndm.set(qid, new Set(allCarpetDims.map((d) => d.id)));
          return ndm;
        });
        setExpandedQualities((ex) => {
          const nex = new Set(ex);
          nex.add(qid);
          return nex;
        });
      }
      return next;
    });
  }

  function toggleDim(qid: string, did: string) {
    setSelectedDims((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(qid) ?? []);
      if (cur.has(did)) cur.delete(did);
      else cur.add(did);
      next.set(qid, cur);
      return next;
    });
  }

  function toggleExpand(qid: string) {
    setExpandedQualities((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  }

  function selectAllQualities() {
    const all = new Set(allQualities.map((q) => q.id));
    setSelectedQualities(all);
    const dimMap = new Map<string, Set<string>>();
    for (const id of all) dimMap.set(id, new Set(allCarpetDims.map((d) => d.id)));
    setSelectedDims(dimMap);
  }

  function deselectAllQualities() {
    setSelectedQualities(new Set());
    setSelectedDims(new Map());
  }

  async function handleCreate() {
    setError("");
    setSubmitting(true);
    const nrTrim = newNr.trim();
    const nameTrim = newName.trim();
    const validFrom = newValidFrom || new Date().toISOString().slice(0, 10);

    const { error: insErr } = await supabase
      .from("price_lists")
      .insert({ nr: nrTrim, name: nameTrim, valid_from: validFrom, active: true });
    if (insErr) {
      setError(insErr.message);
      setSubmitting(false);
      return;
    }

    // Bouw prijsregels uit selectie
    type LineInsert = {
      price_list_nr: string;
      quality_id: string;
      carpet_dimension_id: string;
      price_cents: number;
      unit: "piece";
    };
    const lines: LineInsert[] = [];
    const sourceMap = new Map<string, number>();
    if (createMode === "copy" && copyPrices) {
      for (const l of sourceLines) {
        if (l.unit !== "piece" || !l.carpet_dimension_id) continue;
        sourceMap.set(`${l.quality_id}|${l.carpet_dimension_id}`, l.price_cents);
      }
    }

    for (const qid of selectedQualities) {
      const dims = selectedDims.get(qid);
      if (!dims) continue;
      for (const did of dims) {
        const key = `${qid}|${did}`;
        lines.push({
          price_list_nr: nrTrim,
          quality_id: qid,
          carpet_dimension_id: did,
          price_cents: sourceMap.get(key) ?? 0,
          unit: "piece",
        });
      }
    }

    if (lines.length > 0) {
      const { error: linesErr } = await supabase.from("price_list_lines").insert(lines);
      if (linesErr) {
        setError(`Prijslijst aangemaakt, maar regels invoegen faalde: ${linesErr.message}`);
        setSubmitting(false);
        await load();
        return;
      }
    }

    resetCreate();
    await load();
    // Direct doorlinken naar de detail-pagina zodat de gebruiker prijzen kan invullen
    if (lines.length > 0) {
      window.location.href = `/prijslijst/${encodeURIComponent(nrTrim)}`;
    }
  }

  const totalSelectedLines = (() => {
    let n = 0;
    for (const qid of selectedQualities) {
      n += selectedDims.get(qid)?.size ?? 0;
    }
    return n;
  })();

  const visibleQualitiesInModal = structureSearch
    ? allQualities.filter((q) => {
        const s = structureSearch.toLowerCase();
        return q.name.toLowerCase().includes(s) || q.code.toLowerCase().includes(s);
      })
    : allQualities;

  function formatDate(iso: string) {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">Prijslijsten</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Genummerde prijslijsten gekoppeld aan klanten
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus size={14} /> Nieuwe prijslijst
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Prijslijsten" value={rows.length} icon={<FileText size={16} />} />
        <StatCard label="Gekoppelde klanten" value={totalClients} icon={<Users size={16} />} />
        <StatCard
          label="Zonder klanten"
          value={listsWithoutClients}
          icon={<AlertTriangle size={16} />}
          variant={listsWithoutClients > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op nr, naam of klant..."
          className="pl-8"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <FileText size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Nog geen prijslijsten. Klik op '+ Nieuwe prijslijst' om te beginnen."
              : "Geen prijslijsten gevonden voor deze zoekopdracht."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nr</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Naam</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Geldig vanaf</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Regels</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Gekoppelde klanten</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.nr}
                  className="border-b border-border/50 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/prijslijst/${encodeURIComponent(r.nr)}`}
                      className="font-mono text-amber-700 hover:underline"
                    >
                      {r.nr}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-card-foreground">
                    <Link href={`/prijslijst/${encodeURIComponent(r.nr)}`} className="hover:underline">
                      {r.name}
                    </Link>
                    {!r.active && (
                      <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Inactief
                      </span>
                    )}
                    {isNoMarginPriceList(r.nr) && (
                      <span className="ml-2 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                        Geen marge
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.valid_from)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <FileText size={12} /> {r.line_count}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.client_count === 0 ? (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-card-foreground">
                        <Users size={12} className="text-muted-foreground" />
                        {r.client_names.slice(0, 2).join(", ")}
                        {r.client_count > 2 && (
                          <span className="text-muted-foreground"> +{r.client_count - 2}</span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal — wizard met 2 stappen */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className={`w-full ${step === 1 ? "max-w-md" : "max-w-2xl"} rounded-2xl bg-background shadow-xl ring-1 ring-border max-h-[90vh] flex flex-col`}>
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold">
                Nieuwe prijslijst
                <span className="ml-3 text-xs font-normal text-muted-foreground">
                  Stap {step} van 2
                </span>
              </h3>
              <button onClick={resetCreate} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            {step === 1 && (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground">Nummer</label>
                  <Input
                    value={newNr}
                    onChange={(e) => setNewNr(e.target.value)}
                    placeholder="bv. 0220"
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Naam</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="bv. Benelux 2027"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Geldig vanaf</label>
                  <Input
                    type="date"
                    value={newValidFrom}
                    onChange={(e) => setNewValidFrom(e.target.value)}
                  />
                </div>

                <div className="rounded-xl border border-border p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground">Hoe wil je beginnen?</p>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="createMode"
                      checked={createMode === "scratch"}
                      onChange={() => setCreateMode("scratch")}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Vanaf nul</span>
                      <span className="block text-xs text-muted-foreground">
                        Selecteer kwaliteiten en afmetingen, vul daarna de prijzen in.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="createMode"
                      checked={createMode === "copy"}
                      onChange={() => setCreateMode("copy")}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Op basis van bestaande prijslijst</span>
                      <span className="block text-xs text-muted-foreground">
                        Kopieer structuur (en optioneel prijzen) van een bestaande lijst, pas daarna aan.
                      </span>
                    </span>
                  </label>

                  {createMode === "copy" && (
                    <div className="mt-2 space-y-2 rounded-lg bg-muted/30 p-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Bron-prijslijst</label>
                        <select
                          value={sourceListNr}
                          onChange={(e) => setSourceListNr(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">— kies een lijst —</option>
                          {rows
                            .filter((r) => r.line_count > 0)
                            .map((r) => (
                              <option key={r.nr} value={r.nr}>
                                {r.nr} — {r.name} ({r.line_count} regels)
                              </option>
                            ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={copyPrices}
                          onChange={(e) => setCopyPrices(e.target.checked)}
                        />
                        Prijzen ook overnemen (anders worden alle prijzen leeg)
                      </label>
                    </div>
                  )}
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            )}

            {step === 2 && (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-48">
                    <Search size={14} className="absolute left-2.5 top-2 text-muted-foreground" />
                    <Input
                      value={structureSearch}
                      onChange={(e) => setStructureSearch(e.target.value)}
                      placeholder="Zoek kwaliteit..."
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  <Button variant="outline" onClick={selectAllQualities} className="h-8 text-xs">
                    Alles aanvinken
                  </Button>
                  <Button variant="outline" onClick={deselectAllQualities} className="h-8 text-xs">
                    Alles uitvinken
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  {selectedQualities.size} kwaliteit{selectedQualities.size === 1 ? "" : "en"} ·{" "}
                  {totalSelectedLines} prijsregel{totalSelectedLines === 1 ? "" : "s"} worden aangemaakt
                  {createMode === "copy" && copyPrices && ", prijzen waar beschikbaar overgenomen"}
                  .
                </p>

                <div className="rounded-xl border border-border divide-y divide-border max-h-[50vh] overflow-y-auto">
                  {visibleQualitiesInModal.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Geen kwaliteiten gevonden.
                    </p>
                  ) : (
                    visibleQualitiesInModal.map((q) => {
                      const checked = selectedQualities.has(q.id);
                      const expanded = expandedQualities.has(q.id);
                      const dimsForQ = selectedDims.get(q.id) ?? new Set<string>();
                      return (
                        <div key={q.id}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleQuality(q.id)}
                            />
                            <button
                              onClick={() => toggleExpand(q.id)}
                              className="flex flex-1 items-center gap-2 text-left"
                            >
                              {expanded ? (
                                <ChevronDown size={14} className="text-muted-foreground" />
                              ) : (
                                <ChevronRight size={14} className="text-muted-foreground" />
                              )}
                              <span className="font-mono text-xs text-amber-700">{q.code}</span>
                              <span className="text-sm font-medium text-card-foreground">{q.name}</span>
                              {checked && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {dimsForQ.size} / {allCarpetDims.length} afmetingen
                                </span>
                              )}
                            </button>
                          </div>
                          {expanded && checked && (
                            <div className="bg-muted/30 px-10 py-2 grid grid-cols-2 gap-1">
                              {allCarpetDims.map((cd) => (
                                <label key={cd.id} className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={dimsForQ.has(cd.id)}
                                    onChange={() => toggleDim(q.id, cd.id)}
                                  />
                                  <span>{cd.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
              {step === 2 ? (
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← Terug
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetCreate}>Annuleren</Button>
                {step === 1 ? (
                  <Button onClick={handleNextStep}>Volgende →</Button>
                ) : (
                  <Button onClick={handleCreate} disabled={submitting || totalSelectedLines === 0}>
                    {submitting ? "Aanmaken..." : `Aanmaken (${totalSelectedLines} regels)`}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  variant = "neutral",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: "neutral" | "warning";
}) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-2 text-3xl font-semibold ${
          variant === "warning" && value > 0 ? "text-amber-700" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
