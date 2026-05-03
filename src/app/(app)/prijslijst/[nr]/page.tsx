"use client";

import { useEffect, useState, useCallback, use, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  const [saving, setSaving] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
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
    ]);

    setList(listData as PriceList | null);
    setLines((linesData ?? []) as PriceLine[]);
    setQualities((qualitiesData ?? []) as Quality[]);
    setCarpetDims((carpetDimsData ?? []) as CarpetDim[]);
    setLinkedClients((clientsLinked ?? []) as ClientLink[]);
    setAllClients((clientsAll ?? []) as ClientOption[]);
    setEdits({});
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

    setSaving(false);
    setEdits({});
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

  /** Qualities die voorkomen in deze prijslijst (eerst) + aangevuld met de rest */
  const qualitiesWithLines = useMemo(() => {
    const inList = new Set(lines.map((l) => l.quality_id));
    return qualities.filter((q) => inList.has(q.id));
  }, [qualities, lines]);

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

  const dirty = Object.keys(edits).length > 0;
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
            {dirty && (
              <Button onClick={handleSavePrices} disabled={saving}>
                <Save size={14} /> {saving ? "Opslaan..." : `Opslaan (${Object.keys(edits).length})`}
              </Button>
            )}
          </div>

          {visibleQualities.length === 0 ? (
            <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
              <p className="text-sm text-muted-foreground">
                {lines.length === 0
                  ? "Nog geen prijsregels. Backfill ontbreekt of de prijslijst is leeg."
                  : "Geen kwaliteiten gevonden voor deze zoekopdracht."}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {visibleQualities.map((q) => (
                <QualityPriceCard
                  key={q.id}
                  quality={q}
                  carpetDims={carpetDims}
                  getDisplay={(cdId) => getDisplay(q.id, cdId)}
                  onChange={(cdId, val) =>
                    setEdits((p) => ({ ...p, [editKey(q.id, cdId)]: val }))
                  }
                />
              ))}
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
    </div>
  );
}

/* ─── Subcomponents ──────────────────────────────────── */

function QualityPriceCard({
  quality,
  carpetDims,
  getDisplay,
  onChange,
}: {
  quality: Quality;
  carpetDims: CarpetDim[];
  getDisplay: (carpetDimId: string) => string;
  onChange: (carpetDimId: string, val: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border bg-card">
      <div className="flex items-baseline gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="font-mono text-xs text-amber-700">{quality.code}</span>
        <span className="font-medium text-card-foreground">{quality.name}</span>
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
