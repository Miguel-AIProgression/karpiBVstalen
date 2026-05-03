"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, FileText, Users, AlertTriangle } from "lucide-react";

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

/* ─── Component ──────────────────────────────────────── */

export default function PrijslijstenPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<PriceListRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newNr, setNewNr] = useState("");
  const [newName, setNewName] = useState("");
  const [newValidFrom, setNewValidFrom] = useState("");
  const [error, setError] = useState("");

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

  async function handleCreate() {
    setError("");
    const nrTrim = newNr.trim();
    const nameTrim = newName.trim();
    if (!nrTrim || !nameTrim) {
      setError("Nummer en naam zijn verplicht.");
      return;
    }
    const { error: insErr } = await supabase
      .from("price_lists")
      .insert({
        nr: nrTrim,
        name: nameTrim,
        valid_from: newValidFrom || new Date().toISOString().slice(0, 10),
        active: true,
      });
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setCreating(false);
    setNewNr("");
    setNewName("");
    setNewValidFrom("");
    await load();
  }

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
        <Button onClick={() => setCreating(true)}>
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

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl ring-1 ring-border">
            <h3 className="mb-4 text-lg font-semibold">Nieuwe prijslijst</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Nummer</label>
                <Input
                  value={newNr}
                  onChange={(e) => setNewNr(e.target.value)}
                  placeholder="bv. 002"
                  className="font-mono"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Naam</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="bv. Standaard 2026"
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
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setCreating(false); setError(""); }}>
                  Annuleren
                </Button>
                <Button onClick={handleCreate}>Aanmaken</Button>
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
