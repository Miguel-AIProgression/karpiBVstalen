"use client";

import { useEffect, useState, useCallback, use, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { compareCarpetDims } from "@/lib/carpet-dims";
import {
  ArrowLeft,
  Search,
  FileText,
  Users,
  Calendar,
  Save,
  Plus,
  X,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface PriceList {
  nr: string;
  name: string;
  valid_from: string;
  active: boolean;
}

interface PriceLine {
  id: string;
  quality_id: string;
  carpet_dimension_id: string;
  price_cents: number;
}

interface Quality {
  id: string;
  name: string;
  code: string;
}

interface CarpetDim {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
}

interface ClientLink {
  id: string;
  name: string;
  client_number: string | null;
}

interface ClientOption {
  id: string;
  name: string;
  client_number: string | null;
  price_list_nr: string | null;
}

interface ColorCode {
  id: string;
  quality_id: string;
  code: string;
  name: string;
  hex_color: string | null;
}

/* ─── Component ──────────────────────────────────────── */

export default function PrijslijstDetailPage({ params }: { params: Promise<{ nr: string }> }) {
  const { nr } = use(params);
  const decodedNr = decodeURIComponent(nr);
  const supabase = createClient();

  const [list, setList] = useState<PriceList | null>(null);
  const [lines, setLines] = useState<PriceLine[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [carpetDims, setCarpetDims] = useState<CarpetDim[]>([]);
  const [linkedClients, setLinkedClients] = useState<ClientLink[]>([]);
  const [allClients, setAllClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"prijzen" | "klanten">("prijzen");
  const [search, setSearch] = useState("");
  const [filterQualityId, setFilterQualityId] = useState("");
  /** Edits keyed by `${quality_id}|${carpet_dim_id}` → string (raw input) */
  const [edits, setEdits] = useState<Record<string, string>>({});
  /** Staaltjes-prijzen per quality_id (price_cents in DB) */
  const [samplePrices, setSamplePrices] = useState<Record<string, number>>({});
  /** Lokale edits voor staaltjes-prijzen (raw string input) */
  const [samplePriceEdits, setSamplePriceEdits] = useState<Record<string, string>>({});
  /** Whitelist kleuren per quality_id (color_code_ids uit DB) */
  const [whitelistColors, setWhitelistColors] = useState<Record<string, string[]>>({});
  /** Lokale edits voor kleuren — vervangt server-set per quality_id wanneer aanwezig */
  const [colorEdits, setColorEdits] = useState<Record<string, string[]>>({});
  /** Alle beschikbare kleuren per quality_id */
  const [allColorsByQuality, setAllColorsByQuality] = useState<Record<string, ColorCode[]>>({});
  const [saving, setSaving] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddQuality, setShowAddQuality] = useState(false);
  /** Handmatig toegevoegde qualities (nog zonder regels) — getoond als invul-kaart */
  const [addedQualityIds, setAddedQualityIds] = useState<Set<string>>(new Set());
  const [editingMeta, setEditingMeta] = useState(false);
  const [editName, setEditName] = useState("");
  const [editValidFrom, setEditValidFrom] = useState("");
  const [editActive, setEditActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: listData },
      { data: linesData },
      { data: qualitiesData },
      { data: carpetDimsData },
      { data: clientsLinked },
      { data: clientsAll },
      { data: samplePricesData },
      { data: colorWhitelistData },
      { data: allColorsData },
    ] = await Promise.all([
      supabase.from("price_lists").select("nr, name, valid_from, active").eq("nr", decodedNr).maybeSingle(),
      supabase
        .from("price_list_lines")
        .select("id, quality_id, carpet_dimension_id, price_cents")
        .eq("price_list_nr", decodedNr),
      supabase.from("qualities").select("id, name, code").eq("active", true).order("code"),
      supabase
        .from("carpet_dimensions")
        .select("id, name, width_cm, height_cm")
        .eq("active", true)
        .order("width_cm")
        .order("height_cm"),
      supabase
        .from("clients")
        .select("id, name, client_number")
        .eq("price_list_nr", decodedNr)
        .eq("active", true)
        .order("name"),
      supabase
        .from("clients")
        .select("id, name, client_number, price_list_nr")
        .eq("active", true)
        .order("name"),
      supabase
        .from("price_list_sample_prices")
        .select("quality_id, price_cents")
        .eq("price_list_nr", decodedNr),
      supabase
        .from("price_list_colors")
        .select("quality_id, color_code_id")
        .eq("price_list_nr", decodedNr),
      supabase
        .from("color_codes")
        .select("id, quality_id, code, name, hex_color")
        .eq("active", true)
        .order("code"),
    ]);

    setList(listData as PriceList | null);
    const newLines = (linesData ?? []) as PriceLine[];
    setLines(newLines);
    setQualities((qualitiesData ?? []) as Quality[]);
    setCarpetDims(((carpetDimsData ?? []) as CarpetDim[]).slice().sort(compareCarpetDims));
    setLinkedClients((clientsLinked ?? []) as ClientLink[]);
    setAllClients((clientsAll ?? []) as ClientOption[]);
    setEdits({});
    setSamplePriceEdits({});
    setColorEdits({});

    // Staaltjes-prijzen indexeren per quality_id
    const spMap: Record<string, number> = {};
    for (const r of (samplePricesData ?? []) as { quality_id: string; price_cents: number }[]) {
      spMap[r.quality_id] = r.price_cents;
    }
    setSamplePrices(spMap);

    // Kleur-whitelist groeperen per quality_id
    const wlMap: Record<string, string[]> = {};
    for (const r of (colorWhitelistData ?? []) as { quality_id: string; color_code_id: string }[]) {
      (wlMap[r.quality_id] ??= []).push(r.color_code_id);
    }
    setWhitelistColors(wlMap);

    // Alle kleuren groeperen per quality_id
    const colorsMap: Record<string, ColorCode[]> = {};
    for (const c of (allColorsData ?? []) as ColorCode[]) {
      (colorsMap[c.quality_id] ??= []).push(c);
    }
    setAllColorsByQuality(colorsMap);
    setAddedQualityIds((prev) => {
      const inLines = new Set(newLines.map((l) => l.quality_id));
      const next = new Set<string>();
      for (const id of prev) if (!inLines.has(id)) next.add(id);
      return next;
    });
    if (listData) {
      setEditName(listData.name);
      setEditValidFrom(listData.valid_from);
      setEditActive(listData.active);
    }
    setLoading(false);
  }, [supabase, decodedNr]);

  useEffect(() => {
    load();
  }, [load]);

  function formatCents(cents: number) {
    return (cents / 100).toFixed(2).replace(".", ",");
  }

  function parseEuro(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const cleaned = trimmed.replace(",", ".").replace(/[^\d.]/g, "");
    const n = parseFloat(cleaned);
    if (isNaN(n)) return null;
    return Math.round(n * 100);
  }

  /** Lijnen indexed by `${quality_id}|${carpet_dim_id}` voor O(1) lookup */
  const lineMap = useMemo(() => {
    const m = new Map<string, PriceLine>();
    for (const l of lines) m.set(`${l.quality_id}|${l.carpet_dimension_id}`, l);
    return m;
  }, [lines]);

  function editKey(qualityId: string, carpetDimId: string) {
    return `${qualityId}|${carpetDimId}`;
  }

  function getDisplay(qualityId: string, carpetDimId: string): string {
    const k = editKey(qualityId, carpetDimId);
    if (k in edits) return edits[k];
    const line = lineMap.get(k);
    if (!line || line.price_cents === 0) return "";
    return formatCents(line.price_cents);
  }

  async function handleSavePrices() {
    setSaving(true);
    const inserts: { price_list_nr: string; quality_id: string; carpet_dimension_id: string; price_cents: number }[] = [];
    const updates: { id: string; price_cents: number }[] = [];
    const deletes: string[] = [];

    for (const k of Object.keys(edits)) {
      const cents = parseEuro(edits[k]);
      if (cents === null) continue;
      const [qid, cid] = k.split("|");
      const existing = lineMap.get(k);
      if (existing) {
        if (existing.price_cents === cents) continue;
        if (cents === 0) deletes.push(existing.id);
        else updates.push({ id: existing.id, price_cents: cents });
      } else if (cents > 0) {
        inserts.push({
          price_list_nr: decodedNr,
          quality_id: qid,
          carpet_dimension_id: cid,
          price_cents: cents,
        });
      }
    }

    for (const u of updates) {
      await supabase.from("price_list_lines").update({ price_cents: u.price_cents }).eq("id", u.id);
    }
    if (deletes.length > 0) {
      await supabase.from("price_list_lines").delete().in("id", deletes);
    }
    if (inserts.length > 0) {
      await supabase.from("price_list_lines").insert(inserts);
    }

    // ── Staaltjes-prijzen ──
    const sampleUpserts: { price_list_nr: string; quality_id: string; price_cents: number }[] = [];
    const sampleDeletes: string[] = [];
    for (const qid of Object.keys(samplePriceEdits)) {
      const cents = parseEuro(samplePriceEdits[qid]);
      if (cents === null) continue;
      const current = samplePrices[qid] ?? 0;
      if (cents === current) continue;
      if (cents === 0 && samplePrices[qid] !== undefined) {
        sampleDeletes.push(qid);
      } else if (cents > 0) {
        sampleUpserts.push({ price_list_nr: decodedNr, quality_id: qid, price_cents: cents });
      }
    }
    if (sampleDeletes.length > 0) {
      await supabase
        .from("price_list_sample_prices")
        .delete()
        .eq("price_list_nr", decodedNr)
        .in("quality_id", sampleDeletes);
    }
    if (sampleUpserts.length > 0) {
      await supabase
        .from("price_list_sample_prices")
        .upsert(sampleUpserts, { onConflict: "price_list_nr,quality_id" });
    }

    // ── Kleur-whitelist ──
    const colorInserts: { price_list_nr: string; quality_id: string; color_code_id: string }[] = [];
    const colorDeletes: { quality_id: string; color_code_id: string }[] = [];
    for (const qid of Object.keys(colorEdits)) {
      const desired = new Set(colorEdits[qid]);
      const current = new Set(whitelistColors[qid] ?? []);
      for (const cid of desired) if (!current.has(cid)) colorInserts.push({ price_list_nr: decodedNr, quality_id: qid, color_code_id: cid });
      for (const cid of current) if (!desired.has(cid)) colorDeletes.push({ quality_id: qid, color_code_id: cid });
    }
    if (colorDeletes.length > 0) {
      // Delete in batch per quality_id (vereenvoudigt query)
      const byQ: Record<string, string[]> = {};
      for (const d of colorDeletes) (byQ[d.quality_id] ??= []).push(d.color_code_id);
      for (const qid of Object.keys(byQ)) {
        await supabase
          .from("price_list_colors")
          .delete()
          .eq("price_list_nr", decodedNr)
          .eq("quality_id", qid)
          .in("color_code_id", byQ[qid]);
      }
    }
    if (colorInserts.length > 0) {
      await supabase.from("price_list_colors").insert(colorInserts);
    }

    setSaving(false);
    setEdits({});
    setSamplePriceEdits({});
    setColorEdits({});
    await load();
  }

  async function handleSaveMeta() {
    if (!list) return;
    await supabase
      .from("price_lists")
      .update({ name: editName, valid_from: editValidFrom, active: editActive })
      .eq("nr", decodedNr);
    setEditingMeta(false);
    await load();
  }

  async function handleLinkClient(clientId: string) {
    await supabase.from("clients").update({ price_list_nr: decodedNr }).eq("id", clientId);
    setShowAddClient(false);
    await load();
  }

  async function handleUnlinkClient(clientId: string) {
    await supabase.from("clients").update({ price_list_nr: null }).eq("id", clientId);
    await load();
  }

  /** Qualities die voorkomen in deze prijslijst óf handmatig toegevoegd zijn voor invullen */
  const qualitiesWithLines = useMemo(() => {
    const inList = new Set(lines.map((l) => l.quality_id));
    return qualities.filter((q) => inList.has(q.id) || addedQualityIds.has(q.id));
  }, [qualities, lines, addedQualityIds]);

  const addableQualities = useMemo(() => {
    const inList = new Set(lines.map((l) => l.quality_id));
    return qualities.filter((q) => !inList.has(q.id) && !addedQualityIds.has(q.id));
  }, [qualities, lines, addedQualityIds]);

  function handleAddQuality(qualityId: string) {
    setAddedQualityIds((prev) => {
      const next = new Set(prev);
      next.add(qualityId);
      return next;
    });
    setShowAddQuality(false);
  }

  const visibleQualities = useMemo(() => {
    let qs = qualitiesWithLines;
    if (filterQualityId) {
      qs = qs.filter((q) => q.id === filterQualityId);
    }
    if (search) {
      const q = search.toLowerCase();
      qs = qs.filter((x) => x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q));
    }
    return qs;
  }, [qualitiesWithLines, filterQualityId, search]);

  function getSampleDisplay(qualityId: string): string {
    if (qualityId in samplePriceEdits) return samplePriceEdits[qualityId];
    const cents = samplePrices[qualityId];
    if (!cents || cents === 0) return "";
    return formatCents(cents);
  }

  /** Toggle een kleur in de whitelist voor een kwaliteit */
  function toggleColor(qualityId: string, colorCodeId: string) {
    setColorEdits((prev) => {
      const current = prev[qualityId] ?? whitelistColors[qualityId] ?? [];
      const set = new Set(current);
      if (set.has(colorCodeId)) set.delete(colorCodeId);
      else set.add(colorCodeId);
      return { ...prev, [qualityId]: Array.from(set) };
    });
  }

  /** Effectieve kleur-set voor display (edit of server) */
  function effectiveColors(qualityId: string): Set<string> {
    if (qualityId in colorEdits) return new Set(colorEdits[qualityId]);
    return new Set(whitelistColors[qualityId] ?? []);
  }

  const editsCount =
    Object.keys(edits).length +
    Object.keys(samplePriceEdits).length +
    Object.keys(colorEdits).length;
  const dirty = editsCount > 0;
  const linkableClients = allClients.filter((c) => c.price_list_nr !== decodedNr);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Laden...</div>;
  }

  if (!list) {
    return (
      <div className="space-y-4 p-6">
        <Link href="/prijslijst" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Terug naar prijslijsten
        </Link>
        <p className="text-sm text-red-600">Prijslijst niet gevonden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <Link href="/prijslijst" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Terug naar prijslijsten
      </Link>

      {/* Header */}
      <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {editingMeta ? (
              <div className="space-y-3">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="text-xl font-semibold" />
                <div className="flex items-center gap-3">
                  <Input
                    type="date"
                    value={editValidFrom}
                    onChange={(e) => setEditValidFrom(e.target.value)}
                    className="w-auto"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    Actief
                  </label>
                </div>
              </div>
            ) : (
              <>
                <h2 className="font-display text-2xl tracking-tight text-foreground">{list.name}</h2>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-mono text-sm text-amber-700">{list.nr}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      list.active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {list.active ? "Actief" : "Inactief"}
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            {editingMeta ? (
              <>
                <Button variant="outline" onClick={() => { setEditingMeta(false); setEditName(list.name); setEditValidFrom(list.valid_from); setEditActive(list.active); }}>
                  Annuleren
                </Button>
                <Button onClick={handleSaveMeta}>Opslaan</Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditingMeta(true)}>Bewerken</Button>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Stat label="Geldig vanaf" value={new Date(list.valid_from).toLocaleDateString("nl-NL")} icon={<Calendar size={14} />} />
          <Stat label="Prijsregels" value={lines.length.toString()} icon={<FileText size={14} />} />
          <Stat label="Gekoppelde klanten" value={linkedClients.length.toString()} icon={<Users size={14} />} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabButton active={activeTab === "prijzen"} onClick={() => setActiveTab("prijzen")}>
          Prijzen ({lines.length})
        </TabButton>
        <TabButton active={activeTab === "klanten"} onClick={() => setActiveTab("klanten")}>
          Klanten ({linkedClients.length})
        </TabButton>
      </div>

      {activeTab === "prijzen" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op kwaliteit (naam of code)..."
                className="pl-8"
              />
            </div>
            <select
              value={filterQualityId}
              onChange={(e) => setFilterQualityId(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Alle kwaliteiten</option>
              {qualitiesWithLines.map((q) => (
                <option key={q.id} value={q.id}>{q.code} — {q.name}</option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => setShowAddQuality(true)}
              disabled={addableQualities.length === 0}
              title={addableQualities.length === 0 ? "Alle kwaliteiten staan al in deze prijslijst" : undefined}
            >
              <Plus size={14} /> Kwaliteit toevoegen
            </Button>
            {dirty && (
              <Button onClick={handleSavePrices} disabled={saving}>
                <Save size={14} /> {saving ? "Opslaan..." : `Opslaan (${editsCount})`}
              </Button>
            )}
          </div>

          {visibleQualities.length === 0 ? (
            <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
              <p className="text-sm text-muted-foreground">
                {lines.length === 0 && addedQualityIds.size === 0
                  ? "Nog geen prijsregels. Klik op 'Kwaliteit toevoegen' om prijzen in te vullen."
                  : "Geen kwaliteiten gevonden voor deze zoekopdracht."}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* ── Staaltjes-prijzen sectie ── */}
              <SamplePricesCard
                qualities={visibleQualities}
                getDisplay={getSampleDisplay}
                onChange={(qid, val) =>
                  setSamplePriceEdits((p) => ({ ...p, [qid]: val }))
                }
              />

              {/* ── Carpet-prijzen per kwaliteit ── */}
              <div className="space-y-6">
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Carpet-prijzen
                </h3>
                {visibleQualities.map((q) => (
                  <QualityPriceCard
                    key={q.id}
                    quality={q}
                    carpetDims={carpetDims}
                    availableColors={allColorsByQuality[q.id] ?? []}
                    selectedColors={effectiveColors(q.id)}
                    onToggleColor={(colorCodeId) => toggleColor(q.id, colorCodeId)}
                    getDisplay={(cdId) => getDisplay(q.id, cdId)}
                    onChange={(cdId, val) =>
                      setEdits((p) => ({ ...p, [editKey(q.id, cdId)]: val }))
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "klanten" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowAddClient(true)}>
              <Plus size={14} /> Klant koppelen
            </Button>
          </div>

          {linkedClients.length === 0 ? (
            <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
              <Users size={32} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Nog geen klanten gekoppeld aan deze prijslijst.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl ring-1 ring-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Klantnr</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Naam</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {linkedClients.map((c) => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {c.client_number ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/klanten/${c.id}`} className="text-card-foreground hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleUnlinkClient(c.id)}
                          className="text-xs text-muted-foreground hover:text-red-600"
                          title="Loskoppelen"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add client modal */}
      {showAddClient && (
        <ClientPickerModal
          clients={linkableClients}
          onClose={() => setShowAddClient(false)}
          onPick={handleLinkClient}
        />
      )}

      {/* Add quality modal */}
      {showAddQuality && (
        <QualityPickerModal
          qualities={addableQualities}
          onClose={() => setShowAddQuality(false)}
          onPick={handleAddQuality}
        />
      )}
    </div>
  );
}

/* ─── Subcomponents ──────────────────────────────────── */

function QualityPriceCard({
  quality,
  carpetDims,
  availableColors,
  selectedColors,
  onToggleColor,
  getDisplay,
  onChange,
}: {
  quality: Quality;
  carpetDims: CarpetDim[];
  availableColors: ColorCode[];
  selectedColors: Set<string>;
  onToggleColor: (colorCodeId: string) => void;
  getDisplay: (carpetDimId: string) => string;
  onChange: (carpetDimId: string, val: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border bg-card">
      <div className="flex items-baseline gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="font-mono text-xs text-amber-700">{quality.code}</span>
        <span className="font-medium text-card-foreground">{quality.name}</span>
      </div>

      {/* Kleurnummers — whitelist per (prijslijst × kwaliteit) */}
      <div className="border-b border-border/40 px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
          <span>Kleurnummers ({selectedColors.size}/{availableColors.length})</span>
        </div>
        {availableColors.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">Geen kleurnummers bekend voor deze kwaliteit.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {availableColors.map((c) => {
              const checked = selectedColors.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => onToggleColor(c.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-mono transition-colors ${
                    checked
                      ? "border-amber-700/40 bg-amber-50 text-amber-900"
                      : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted/40"
                  }`}
                  title={c.name}
                >
                  {c.hex_color && (
                    <span
                      className="inline-block h-3 w-3 rounded-sm border border-border/50"
                      style={{ backgroundColor: c.hex_color }}
                    />
                  )}
                  {c.code}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Carpet-afmeting</th>
            <th className="px-4 py-2 text-right font-medium">Prijs</th>
          </tr>
        </thead>
        <tbody>
          {carpetDims.map((cd) => (
            <tr key={cd.id} className="border-b border-border/30 last:border-b-0">
              <td className="px-4 py-1.5 text-card-foreground">
                {cd.name}
              </td>
              <td className="px-4 py-1.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-muted-foreground">€</span>
                  <input
                    value={getDisplay(cd.id)}
                    onChange={(e) => onChange(cd.id, e.target.value)}
                    placeholder="—"
                    className="w-24 rounded-md border border-border bg-transparent px-2 py-0.5 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SamplePricesCard({
  qualities,
  getDisplay,
  onChange,
}: {
  qualities: Quality[];
  getDisplay: (qualityId: string) => string;
  onChange: (qualityId: string, val: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <div>
          <h3 className="font-medium text-card-foreground">Staaltjes-prijzen</h3>
          <p className="text-xs text-muted-foreground">Wat de klant aan Karpi betaalt voor het ontvangen van staaltjes. Komt niet op de sticker.</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Kwaliteit</th>
            <th className="px-4 py-2 text-right font-medium">Prijs per staaltje</th>
          </tr>
        </thead>
        <tbody>
          {qualities.map((q) => (
            <tr key={q.id} className="border-b border-border/30 last:border-b-0">
              <td className="px-4 py-1.5">
                <span className="font-mono text-xs text-amber-700">{q.code}</span>
                <span className="ml-2 text-card-foreground">{q.name}</span>
              </td>
              <td className="px-4 py-1.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-muted-foreground">€</span>
                  <input
                    value={getDisplay(q.id)}
                    onChange={(e) => onChange(q.id, e.target.value)}
                    placeholder="—"
                    className="w-24 rounded-md border border-border bg-transparent px-2 py-0.5 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {children}
    </button>
  );
}

function QualityPickerModal({
  qualities,
  onClose,
  onPick,
}: {
  qualities: Quality[];
  onClose: () => void;
  onPick: (qualityId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = qualities.filter((q) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return q.name.toLowerCase().includes(s) || q.code.toLowerCase().includes(s);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl ring-1 ring-border">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Kwaliteit toevoegen</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek kwaliteit (naam of code)..."
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {qualities.length === 0
                ? "Alle actieve kwaliteiten staan al in deze prijslijst."
                : "Geen kwaliteiten gevonden."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((q) => (
                <li key={q.id}>
                  <button
                    onClick={() => onPick(q.id)}
                    className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium">{q.name}</span>
                    <span className="font-mono text-xs text-amber-700">{q.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Tip: vul de prijzen voor elke afmeting in en klik daarna op <span className="font-medium">Opslaan</span>. Lege velden worden niet opgeslagen.
        </p>
      </div>
    </div>
  );
}

function ClientPickerModal({
  clients,
  onClose,
  onPick,
}: {
  clients: ClientOption[];
  onClose: () => void;
  onPick: (clientId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.client_number ?? "").includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl ring-1 ring-border">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Klant koppelen</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek klant..."
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Geen klanten gevonden.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onPick(c.id)}
                    className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>
                      {c.price_list_nr && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (nu: {c.price_list_nr})
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{c.client_number ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
