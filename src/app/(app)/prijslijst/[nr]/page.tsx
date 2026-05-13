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
  Trash2,
  GripVertical,
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
  carpet_dimension_id: string | null;
  unit: "piece" | "m2";
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

interface SampleColor {
  color_code_id: string;
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
  /** M2-prijzen per quality_id (price_cents in DB) */
  const [m2Prices, setM2Prices] = useState<Record<string, number>>({});
  /** Lokale edits voor m2-prijzen (raw string input) */
  const [m2PriceEdits, setM2PriceEdits] = useState<Record<string, string>>({});
  /** Lijn-id's voor m2-prijzen per quality_id (voor update/delete) */
  const [m2LineIds, setM2LineIds] = useState<Record<string, string>>({});
  /** Kleuren per quality_id — vanuit samples tabel */
  const [colorsByQuality, setColorsByQuality] = useState<Record<string, SampleColor[]>>({});
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
      { data: samplesData },
    ] = await Promise.all([
      supabase.from("price_lists").select("nr, name, valid_from, active").eq("nr", decodedNr).maybeSingle(),
      supabase
        .from("price_list_lines")
        .select("id, quality_id, carpet_dimension_id, unit, price_cents")
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
        .from("samples")
        .select("quality_id, color_code_id, color_codes(code, name, hex_color)")
        .eq("active", true),
    ]);

    setList(listData as PriceList | null);
    const newLines = (linesData ?? []) as PriceLine[];
    setLines(newLines.filter((l) => l.unit !== "m2"));

    // M2-prijzen indexeren per quality_id
    const m2Map: Record<string, number> = {};
    const m2IdMap: Record<string, string> = {};
    for (const l of newLines) {
      if (l.unit === "m2") {
        m2Map[l.quality_id] = l.price_cents;
        m2IdMap[l.quality_id] = l.id;
      }
    }
    setM2Prices(m2Map);
    setM2LineIds(m2IdMap);
    setM2PriceEdits({});
    setQualities((qualitiesData ?? []) as Quality[]);
    setCarpetDims(((carpetDimsData ?? []) as CarpetDim[]).slice().sort(compareCarpetDims));
    setLinkedClients((clientsLinked ?? []) as ClientLink[]);
    setAllClients((clientsAll ?? []) as ClientOption[]);
    setEdits({});

    // Kleuren per quality_id — unieke kleurcodes vanuit samples
    const colorsMap: Record<string, SampleColor[]> = {};
    const seen = new Set<string>();
    for (const s of (samplesData ?? []) as any[]) {
      if (!s.quality_id || !s.color_code_id || !s.color_codes) continue;
      const key = `${s.quality_id}|${s.color_code_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (colorsMap[s.quality_id] ??= []).push({
        color_code_id: s.color_code_id,
        code: s.color_codes.code,
        name: s.color_codes.name,
        hex_color: s.color_codes.hex_color ?? null,
      });
    }
    for (const arr of Object.values(colorsMap)) arr.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    setColorsByQuality(colorsMap);
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

  function getM2Display(qualityId: string): string {
    if (qualityId in m2PriceEdits) return m2PriceEdits[qualityId];
    const cents = m2Prices[qualityId];
    if (!cents) return "";
    return formatCents(cents);
  }

  function getDisplay(qualityId: string, carpetDimId: string): string {
    const k = editKey(qualityId, carpetDimId);
    if (k in edits) return edits[k];
    const line = lineMap.get(k);
    if (!line || line.price_cents === 0) return "";
    return formatCents(line.price_cents);
  }

  async function handleAddNewDim(name: string): Promise<CarpetDim | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    // Probeer breedte/hoogte te parsen uit naam (bijv. "160x230" of "222 rond")
    const rectMatch = trimmed.match(/^(\d+)\s*[xX×]\s*(\d+)/);
    const roundMatch = trimmed.match(/^(\d+)\s*(rond|ROND)/i);
    const width_cm = rectMatch ? parseInt(rectMatch[1]) : roundMatch ? parseInt(roundMatch[1]) : 0;
    const height_cm = rectMatch ? parseInt(rectMatch[2]) : roundMatch ? parseInt(roundMatch[1]) : 0;
    const { data, error } = await supabase
      .from("carpet_dimensions")
      .insert({ name: trimmed, width_cm, height_cm, active: true })
      .select("id, name, width_cm, height_cm")
      .single();
    if (error || !data) { alert("Kon afmeting niet aanmaken: " + error?.message); return null; }
    const newDim = data as CarpetDim;
    setCarpetDims((prev) => [...prev, newDim].slice().sort(compareCarpetDims));
    return newDim;
  }

  async function handleDeleteQuality(qualityId: string, qualityName: string) {
    if (!confirm(`Kwaliteit "${qualityName}" verwijderen uit deze prijslijst?\n\nAlle carpet-prijzen, staaltjesprijs en kleurnummers voor deze kwaliteit worden gewist.`)) return;
    await Promise.all([
      supabase.from("price_list_lines").delete().eq("price_list_nr", decodedNr).eq("quality_id", qualityId),
    ]);
    // Verwijder ook uit addedQualityIds als aanwezig
    setAddedQualityIds((prev) => { const n = new Set(prev); n.delete(qualityId); return n; });
    await load();
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

    // ── M2-prijzen (maatwerk) ──
    for (const qid of Object.keys(m2PriceEdits)) {
      const cents = parseEuro(m2PriceEdits[qid]);
      if (cents === null) continue;
      const current = m2Prices[qid] ?? 0;
      if (cents === current) continue;
      const existingId = m2LineIds[qid];
      if (cents === 0 && existingId) {
        await supabase.from("price_list_lines").delete().eq("id", existingId);
      } else if (cents > 0 && existingId) {
        await supabase.from("price_list_lines").update({ price_cents: cents }).eq("id", existingId);
      } else if (cents > 0) {
        await (supabase as any).from("price_list_lines").insert({
          price_list_nr: decodedNr,
          quality_id: qid,
          carpet_dimension_id: null,
          unit: "m2",
          price_cents: cents,
        });
      }
    }



    setSaving(false);
    setEdits({});
    setM2PriceEdits({});
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


  const editsCount =
    Object.keys(edits).length +
    Object.keys(m2PriceEdits).length;
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
                    colors={colorsByQuality[q.id] ?? []}
                    getDisplay={(cdId) => getDisplay(q.id, cdId)}
                    onChange={(cdId, val) =>
                      setEdits((p) => ({ ...p, [editKey(q.id, cdId)]: val }))
                    }
                    m2Display={getM2Display(q.id)}
                    onM2Change={(val) => setM2PriceEdits((p) => ({ ...p, [q.id]: val }))}
                    onDelete={() => handleDeleteQuality(q.id, q.name)}
                    onAddNewDim={handleAddNewDim}
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
  colors,
  getDisplay,
  onChange,
  m2Display,
  onM2Change,
  onDelete,
  onAddNewDim,
}: {
  quality: Quality;
  carpetDims: CarpetDim[];
  colors: SampleColor[];
  getDisplay: (carpetDimId: string) => string;
  onChange: (carpetDimId: string, val: string) => void;
  m2Display: string;
  onM2Change: (val: string) => void;
  onDelete: () => void;
  onAddNewDim: (name: string) => Promise<CarpetDim | null>;
}) {
  const [addInput, setAddInput] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  // Toegevoegde maar nog niet geprijsde rijen — blijven zichtbaar totdat prijs ingevuld is
  const [pendingDimIds, setPendingDimIds] = useState<Set<string>>(new Set());

  const visibleDims = carpetDims.filter((cd) => getDisplay(cd.id) !== "" || pendingDimIds.has(cd.id));
  const availableDims = carpetDims.filter((cd) => getDisplay(cd.id) === "" && !pendingDimIds.has(cd.id));

  // Bereken volgorde: gebruik custom order als basis, vul aan met nieuwe dims, verwijder verdwenen dims
  const baseIds = visibleDims.map((d) => d.id);
  const orderedIds = [
    ...order.filter((id) => baseIds.includes(id)),
    ...baseIds.filter((id) => !order.includes(id)),
  ];
  const orderedDims = orderedIds
    .map((id) => visibleDims.find((d) => d.id === id))
    .filter(Boolean) as CarpetDim[];

  // Filter suggestions op ingetypte tekst
  const inputLower = addInput.trim().toLowerCase();
  const suggestions = inputLower
    ? availableDims.filter((d) => d.name.toLowerCase().includes(inputLower))
    : availableDims;

  function addDim(cd: CarpetDim) {
    setPendingDimIds((prev) => new Set([...prev, cd.id]));
    setOrder((prev) => [...(prev.length > 0 ? prev : orderedIds), cd.id]);
    setAddInput("");
    setShowAdd(false);
  }

  async function addNewDim() {
    const name = addInput.trim();
    if (!name) return;
    setAddingNew(true);
    const newDim = await onAddNewDim(name);
    if (newDim) addDim(newDim);
    setAddingNew(false);
  }

  function removeDim(id: string) {
    if (pendingDimIds.has(id)) {
      // Nog niet geprijsd — gewoon uit pending verwijderen
      setPendingDimIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    } else {
      // Heeft prijs — markeer voor verwijdering via opslaan
      onChange(id, "");
    }
    setOrder((prev) => (prev.length > 0 ? prev : orderedIds).filter((x) => x !== id));
  }

  // Drag handlers — initialiseer order vanuit orderedIds als nog leeg
  function onDragStart(id: string) {
    setDragId(id);
    setOrder((prev) => prev.length > 0 ? prev : orderedIds);
  }
  function onDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setOrder((prev) => {
      const arr = [...prev];
      const from = arr.indexOf(dragId);
      const to = arr.indexOf(overId);
      if (from === -1 || to === -1) return prev;
      arr.splice(from, 1);
      arr.splice(to, 0, dragId);
      return arr;
    });
  }
  function onDragEnd() { setDragId(null); }

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-amber-700">{quality.code}</span>
          <span className="font-medium text-card-foreground">{quality.name}</span>
        </div>
        <button onClick={onDelete} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Kwaliteit verwijderen uit prijslijst">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Kleurnummers — uit stalen database */}
      <div className="border-b border-border/40 px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Kleurnummers ({colors.length})
        </p>
        {colors.length === 0 ? (
          <p className="text-xs italic text-muted-foreground/60">Nog geen staaltjes aangemaakt voor deze kwaliteit.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {colors.map((c) => (
              <span
                key={c.color_code_id}
                title={c.name}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-0.5 text-xs font-mono text-card-foreground"
              >
                {c.hex_color && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm border border-border/50"
                    style={{ backgroundColor: c.hex_color }}
                  />
                )}
                {c.code}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground/60">
          Kleuren toevoegen of verwijderen via <a href="/stalen" className="underline hover:text-foreground">Stalen</a>.
        </p>
      </div>

      {/* Afmetingen */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-6" />
            <th className="px-4 py-2 text-left font-medium">Carpet-afmeting</th>
            <th className="px-4 py-2 text-right font-medium">Prijs</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {orderedDims.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-3 text-xs text-muted-foreground italic">
                Nog geen afmetingen. Klik op &ldquo;+ Afmeting toevoegen&rdquo;.
              </td>
            </tr>
          )}
          {orderedDims.map((cd) => (
            <tr
              key={cd.id}
              draggable
              onDragStart={() => onDragStart(cd.id)}
              onDragOver={(e) => onDragOver(e, cd.id)}
              onDragEnd={onDragEnd}
              className={`border-b border-border/30 transition-opacity ${dragId === cd.id ? "opacity-40" : ""}`}
            >
              <td className="pl-2 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground">
                <GripVertical size={14} />
              </td>
              <td className="px-4 py-1.5 text-card-foreground">{cd.name}</td>
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
              <td className="px-2 py-1.5">
                <button onClick={() => removeDim(cd.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Rij verwijderen">
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
          {/* M2 rij */}
          <tr className="border-t-2 border-border bg-muted/20">
            <td />
            <td className="px-4 py-1.5 font-medium text-card-foreground">
              Afwijkende maten <span className="ml-1 text-xs font-normal text-muted-foreground">/m²</span>
            </td>
            <td className="px-4 py-1.5 text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-muted-foreground">€</span>
                <input value={m2Display} onChange={(e) => onM2Change(e.target.value)} placeholder="—"
                  className="w-24 rounded-md border border-border bg-transparent px-2 py-0.5 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </td>
            <td />
          </tr>
        </tbody>
      </table>

      {/* Afmeting toevoegen */}
      <div className="border-t border-border/40 px-4 py-2.5">
        {showAdd ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={addInput}
                onChange={(e) => setAddInput(e.target.value)}
                placeholder="Typ afmeting (bijv. 160x230)..."
                className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setShowAdd(false); setAddInput(""); }
                  if (e.key === "Enter") {
                    if (suggestions.length === 1) addDim(suggestions[0]);
                    else if (suggestions.length === 0 && addInput.trim()) addNewDim();
                  }
                }}
              />
              <button onClick={() => { setShowAdd(false); setAddInput(""); }} className="text-xs text-muted-foreground hover:text-foreground">
                Annuleren
              </button>
            </div>
            {addInput && suggestions.length > 0 && (
              <div className="rounded-md border border-border bg-card shadow-sm overflow-hidden">
                {suggestions.slice(0, 8).map((cd) => (
                  <button key={cd.id} onClick={() => addDim(cd)}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors border-b border-border/30 last:border-0">
                    {cd.name}
                  </button>
                ))}
              </div>
            )}
            {addInput && suggestions.length === 0 && (
              <div className="rounded-md border border-border bg-card p-2">
                <p className="text-xs text-muted-foreground mb-2">Geen bestaande afmeting gevonden.</p>
                <button
                  onClick={addNewDim}
                  disabled={addingNew}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Plus size={12} />
                  {addingNew ? "Aanmaken..." : `"${addInput.trim()}" aanmaken als nieuwe afmeting`}
                </button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Plus size={13} /> Afmeting toevoegen
          </button>
        )}
      </div>
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
