"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Users, X } from "lucide-react";
import Image from "next/image";

/* ─── Types ──────────────────────────────────────────── */

interface ClientData {
  id: string;
  name: string;
  client_type: string;
  client_number: string | null;
  contact_email: string | null;
  logo_url: string | null;
  active: boolean;
  client_quality_names: { id: string }[];
}

/* ─── Component ──────────────────────────────────────── */

export default function KlantenPage() {
  const supabase = createClient();
  const router = useRouter();

  const [clients, setClients] = useState<ClientData[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // New client form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("retailer");
  const [formNumber, setFormNumber] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [
      { data: clientsData },
      { data: ordersData },
    ] = await Promise.all([
      supabase
        .from("clients")
        .select("*, client_quality_names(id)")
        .eq("active", true)
        .order("name"),
      supabase.from("orders").select("client_id"),
    ]);

    setClients((clientsData as ClientData[]) ?? []);

    // Count orders per client
    const counts: Record<string, number> = {};
    for (const o of ordersData ?? []) {
      const cid = (o as any).client_id;
      counts[cid] = (counts[cid] ?? 0) + 1;
    }
    setOrderCounts(counts);


    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = clients.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.client_number ?? "").toLowerCase().includes(q) ||
      (c.contact_email ?? "").toLowerCase().includes(q)
    );
  });

  async function handleCreate() {
    if (!formName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("clients").insert({
      name: formName.trim(),
      client_type: formType,
      client_number: formNumber.trim() || null,
      contact_email: formEmail.trim() || null,
    });
    if (!error) {
      setFormName("");
      setFormType("retailer");
      setFormNumber("");
      setFormEmail("");
      setShowForm(false);
      await loadData();
    }
    setSaving(false);
  }

  function getInitials(name: string) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">
            Klanten
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Beheer klanten, eigen namen en prijzen
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={14} /> Nieuwe klant
        </Button>
      </div>

      {/* New client form */}
      {showForm && (
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-card-foreground">
              Nieuwe klant toevoegen
            </h3>
            <button
              onClick={() => setShowForm(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Naam *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Bedrijfsnaam"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="retailer">Hoofdkantoor</option>
                <option value="branch">Filiaal</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Klantnummer
              </label>
              <Input
                value={formNumber}
                onChange={(e) => setFormNumber(e.target.value)}
                placeholder="Optioneel"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">E-mail</label>
              <Input
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="contact@voorbeeld.nl"
                type="email"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Annuleren
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={saving || !formName.trim()}>
              {saving ? "Opslaan..." : "Klant aanmaken"}
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={16}
            className="absolute left-2.5 top-2 text-muted-foreground"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op naam, klantnummer of e-mail..."
            className="pl-8"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <Users
            size={32}
            className="mx-auto mb-3 text-muted-foreground/30"
          />
          <p className="text-sm text-muted-foreground">
            {clients.length === 0
              ? "Nog geen klanten. Klik op '+ Nieuwe klant' om te beginnen."
              : "Geen klanten gevonden voor deze zoekopdracht."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Klant
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Klantnr.
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Eigen namen
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Orders
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const nameCount = c.client_quality_names?.length ?? 0;
                  const orderCount = orderCounts[c.id] ?? 0;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/klanten/${c.id}`)}
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.logo_url ? (
                            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg">
                              <Image
                                src={c.logo_url}
                                alt=""
                                fill
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                              {getInitials(c.name)}
                            </div>
                          )}
                          <span className="font-medium text-card-foreground">
                            {c.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-card-foreground">
                        {c.client_number ?? (
                          <span className="text-muted-foreground/40">
                            &mdash;
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            c.client_type === "retailer"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {c.client_type === "retailer" ? "Hoofdkantoor" : c.client_type === "branch" ? "Filiaal" : c.client_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-card-foreground">
                        {nameCount > 0 ? (
                          <span className="text-sm">
                            {nameCount} {nameCount === 1 ? "naam" : "namen"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">
                            Niet ingesteld
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {orderCount > 0 ? (
                          <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                            {orderCount}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">
                            &mdash;
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {filtered.length} klant{filtered.length !== 1 ? "en" : ""} gevonden
        </div>
      )}
    </div>
  );
}
