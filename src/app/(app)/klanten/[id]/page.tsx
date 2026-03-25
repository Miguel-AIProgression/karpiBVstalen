"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoUpload } from "@/components/logo-upload";
import { PriceCalculator } from "@/components/price-calculator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Trash2,
  Check,
  X,
  Save,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface ClientRow {
  id: string;
  name: string;
  client_type: string;
  client_number: string | null;
  contact_email: string | null;
  logo_url: string | null;
  active: boolean;
}

interface QualityNameRow {
  id: string;
  client_id: string;
  quality_id: string;
  custom_name: string;
  qualities: { name: string } | null;
}

interface Quality {
  id: string;
  name: string;
  code: string;
}

interface CarpetDimension {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
}

interface QualityCarpetDim {
  id: string;
  quality_id: string;
  carpet_dimension_id: string;
  carpet_dimensions: CarpetDimension | null;
}

interface ClientCarpetPrice {
  id: string;
  client_id: string;
  quality_id: string;
  carpet_dimension_id: string | null;
  price_cents: number;
  unit: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  delivery_date: string;
  created_at: string;
  collections: { name: string } | null;
}

type TabKey = "eigen-namen" | "prijzen" | "orders";

/* ─── Component ──────────────────────────────────────── */

export default function KlantDetailPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("eigen-namen");

  // Edit mode for header
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Eigen namen
  const [qualityNames, setQualityNames] = useState<QualityNameRow[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [newQualityId, setNewQualityId] = useState("");
  const [newCustomName, setNewCustomName] = useState("");
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // Prijzen
  const [selectedQualityId, setSelectedQualityId] = useState("");
  const [qualityDims, setQualityDims] = useState<QualityCarpetDim[]>([]);
  const [prices, setPrices] = useState<ClientCarpetPrice[]>([]);
  const [editingPriceKey, setEditingPriceKey] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

  // Orders
  const [orders, setOrders] = useState<OrderRow[]>([]);

  /* ─── Load client ─── */

  const loadClient = useCallback(async () => {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();
    if (data) {
      const row = data as ClientRow;
      setClient(row);
      setEditName(row.name);
      setEditType(row.client_type);
      setEditNumber(row.client_number ?? "");
      setEditEmail(row.contact_email ?? "");
    }
    setLoading(false);
  }, [supabase, clientId]);

  /* ─── Load eigen namen ─── */

  const loadQualityNames = useCallback(async () => {
    const [{ data: namesData }, { data: qualsData }] = await Promise.all([
      supabase
        .from("client_quality_names")
        .select("*, qualities(name)")
        .eq("client_id", clientId),
      supabase
        .from("qualities")
        .select("id, name, code")
        .eq("active", true)
        .order("name"),
    ]);
    setQualityNames((namesData as QualityNameRow[]) ?? []);
    setQualities((qualsData as Quality[]) ?? []);
  }, [supabase, clientId]);

  /* ─── Load prices for selected quality ─── */

  const loadPrices = useCallback(
    async (qualityId: string) => {
      if (!qualityId) {
        setQualityDims([]);
        setPrices([]);
        return;
      }
      const [{ data: dimsData }, { data: pricesData }] = await Promise.all([
        supabase
          .from("quality_carpet_dimensions")
          .select("*, carpet_dimensions(*)")
          .eq("quality_id", qualityId)
          .eq("active", true),
        supabase
          .from("client_carpet_prices")
          .select("*")
          .eq("client_id", clientId)
          .eq("quality_id", qualityId),
      ]);
      setQualityDims((dimsData as QualityCarpetDim[]) ?? []);
      setPrices((pricesData as ClientCarpetPrice[]) ?? []);
    },
    [supabase, clientId]
  );

  /* ─── Load orders ─── */

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select("*, collections(name)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setOrders((data as OrderRow[]) ?? []);
  }, [supabase, clientId]);

  /* ─── Effects ─── */

  useEffect(() => {
    loadClient();
    loadQualityNames();
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (selectedQualityId) loadPrices(selectedQualityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQualityId]);

  /* ─── Handlers: header edit ─── */

  async function saveClientEdit() {
    await supabase
      .from("clients")
      .update({
        name: editName.trim(),
        client_type: editType,
        client_number: editNumber.trim() || null,
        contact_email: editEmail.trim() || null,
      })
      .eq("id", clientId);
    setEditing(false);
    loadClient();
  }

  /* ─── Handlers: eigen namen ─── */

  async function addQualityName() {
    if (!newQualityId || !newCustomName.trim()) return;
    await supabase.from("client_quality_names").insert({
      client_id: clientId,
      quality_id: newQualityId,
      custom_name: newCustomName.trim(),
    });
    setNewQualityId("");
    setNewCustomName("");
    loadQualityNames();
  }

  async function updateQualityName(nameId: string) {
    if (!editingNameValue.trim()) return;
    await supabase
      .from("client_quality_names")
      .update({ custom_name: editingNameValue.trim() })
      .eq("id", nameId);
    setEditingNameId(null);
    loadQualityNames();
  }

  async function deleteQualityName(nameId: string) {
    await supabase.from("client_quality_names").delete().eq("id", nameId);
    loadQualityNames();
  }

  /* ─── Handlers: prices ─── */

  function getPriceForDim(dimId: string | null): ClientCarpetPrice | undefined {
    return prices.find((p) =>
      dimId ? p.carpet_dimension_id === dimId : p.carpet_dimension_id === null
    );
  }

  function formatPrice(cents: number): string {
    return (cents / 100).toFixed(2).replace(".", ",");
  }

  async function savePrice(
    carpetDimensionId: string | null,
    priceCents: number
  ) {
    await supabase.from("client_carpet_prices").upsert(
      {
        client_id: clientId,
        quality_id: selectedQualityId,
        carpet_dimension_id: carpetDimensionId,
        price_cents: priceCents,
        unit: carpetDimensionId ? "stuk" : "m2",
      },
      { onConflict: "client_id,quality_id,carpet_dimension_id" }
    );
    loadPrices(selectedQualityId);
  }

  function startEditPrice(key: string, currentCents: number) {
    setEditingPriceKey(key);
    setEditingPriceValue((currentCents / 100).toFixed(2));
  }

  function commitEditPrice(carpetDimensionId: string | null) {
    const val = parseFloat(editingPriceValue.replace(",", "."));
    if (!isNaN(val) && val >= 0) {
      savePrice(carpetDimensionId, Math.round(val * 100));
    }
    setEditingPriceKey(null);
  }

  function getQualityLabel(qualityId: string): string {
    const qual = qualities.find((q) => q.id === qualityId);
    const customName = qualityNames.find((n) => n.quality_id === qualityId);
    if (qual && customName) return `${qual.name} (${customName.custom_name})`;
    return qual?.name ?? "";
  }

  /* ─── Status label ─── */
  function statusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: "Concept",
      confirmed: "Bevestigd",
      in_production: "In productie",
      ready: "Gereed",
      shipped: "Verzonden",
      completed: "Afgerond",
    };
    return map[status] ?? status;
  }

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Klant niet gevonden.</p>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "eigen-namen", label: "Eigen namen" },
    { key: "prijzen", label: "Prijzen" },
    { key: "orders", label: "Orders" },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Back link */}
      <button
        onClick={() => router.push("/klanten")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Terug naar klanten
      </button>

      {/* Header */}
      <div className="flex items-start gap-5 rounded-2xl bg-card p-5 ring-1 ring-border">
        <LogoUpload
          clientId={clientId}
          currentUrl={client.logo_url}
          onUploaded={(url) =>
            setClient((prev) => (prev ? { ...prev, logo_url: url } : prev))
          }
        />
        <div className="flex-1">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Naam"
                />
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="Hoofdkantoor">Hoofdkantoor</option>
                  <option value="Filiaal">Filiaal</option>
                </select>
                <Input
                  value={editNumber}
                  onChange={(e) => setEditNumber(e.target.value)}
                  placeholder="Klantnummer"
                />
                <Input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="E-mail"
                  type="email"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveClientEdit}>
                  <Save size={14} /> Opslaan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  Annuleren
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl tracking-tight text-foreground">
                  {client.name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {client.client_number && (
                    <span className="font-mono">{client.client_number}</span>
                  )}
                  <Badge
                    variant={
                      client.client_type === "Hoofdkantoor"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {client.client_type}
                  </Badge>
                  {client.contact_email && <span>{client.contact_email}</span>}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <Pencil size={14} /> Bewerken
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "eigen-namen" && (
        <EigenNamenTab
          qualityNames={qualityNames}
          qualities={qualities}
          newQualityId={newQualityId}
          setNewQualityId={setNewQualityId}
          newCustomName={newCustomName}
          setNewCustomName={setNewCustomName}
          addQualityName={addQualityName}
          editingNameId={editingNameId}
          editingNameValue={editingNameValue}
          setEditingNameId={setEditingNameId}
          setEditingNameValue={setEditingNameValue}
          updateQualityName={updateQualityName}
          deleteQualityName={deleteQualityName}
        />
      )}

      {activeTab === "prijzen" && (
        <PrijzenTab
          qualities={qualities}
          qualityNames={qualityNames}
          selectedQualityId={selectedQualityId}
          setSelectedQualityId={setSelectedQualityId}
          qualityDims={qualityDims}
          prices={prices}
          editingPriceKey={editingPriceKey}
          editingPriceValue={editingPriceValue}
          getPriceForDim={getPriceForDim}
          formatPrice={formatPrice}
          startEditPrice={startEditPrice}
          commitEditPrice={commitEditPrice}
          setEditingPriceKey={setEditingPriceKey}
          setEditingPriceValue={setEditingPriceValue}
          savePrice={savePrice}
          getQualityLabel={getQualityLabel}
        />
      )}

      {activeTab === "orders" && (
        <OrdersTab
          orders={orders}
          statusLabel={statusLabel}
          router={router}
        />
      )}
    </div>
  );
}

/* ─── Tab: Eigen namen ──────────────────────────────── */

function EigenNamenTab({
  qualityNames,
  qualities,
  newQualityId,
  setNewQualityId,
  newCustomName,
  setNewCustomName,
  addQualityName,
  editingNameId,
  editingNameValue,
  setEditingNameId,
  setEditingNameValue,
  updateQualityName,
  deleteQualityName,
}: {
  qualityNames: QualityNameRow[];
  qualities: Quality[];
  newQualityId: string;
  setNewQualityId: (v: string) => void;
  newCustomName: string;
  setNewCustomName: (v: string) => void;
  addQualityName: () => void;
  editingNameId: string | null;
  editingNameValue: string;
  setEditingNameId: (v: string | null) => void;
  setEditingNameValue: (v: string) => void;
  updateQualityName: (id: string) => void;
  deleteQualityName: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Kwaliteit</label>
          <select
            value={newQualityId}
            onChange={(e) => setNewQualityId(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Selecteer kwaliteit...</option>
            {qualities.map((q) => (
              <option key={q.id} value={q.id}>
                {q.code} &mdash; {q.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Eigen naam</label>
          <Input
            value={newCustomName}
            onChange={(e) => setNewCustomName(e.target.value)}
            placeholder="Naam bij klant"
            className="w-48"
          />
        </div>
        <Button
          size="sm"
          onClick={addQualityName}
          disabled={!newQualityId || !newCustomName.trim()}
        >
          <Plus size={14} /> Naam toevoegen
        </Button>
      </div>

      {/* Table */}
      {qualityNames.length === 0 ? (
        <div className="rounded-2xl bg-card p-6 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">
            Nog geen eigen namen ingesteld voor deze klant.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Karpi naam
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Klant naam
                </th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {qualityNames.map((qn) => (
                <tr
                  key={qn.id}
                  className="border-b border-border/50 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3 text-card-foreground">
                    {qn.qualities?.name ?? "?"}
                  </td>
                  <td className="px-4 py-3">
                    {editingNameId === qn.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          className="w-48"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateQualityName(qn.id);
                            if (e.key === "Escape") setEditingNameId(null);
                          }}
                        />
                        <button
                          onClick={() => updateQualityName(qn.id)}
                          className="text-green-600 hover:text-green-700"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => setEditingNameId(null)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium text-card-foreground">
                        {qn.custom_name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingNameId(qn.id);
                          setEditingNameValue(qn.custom_name);
                        }}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Bewerken"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteQualityName(qn.id)}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        title="Verwijderen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Prijzen ──────────────────────────────────── */

function PrijzenTab({
  qualities,
  qualityNames,
  selectedQualityId,
  setSelectedQualityId,
  qualityDims,
  prices: _prices,
  editingPriceKey,
  editingPriceValue,
  getPriceForDim,
  formatPrice,
  startEditPrice,
  commitEditPrice,
  setEditingPriceKey,
  setEditingPriceValue,
  savePrice,
  getQualityLabel: _getQualityLabel,
}: {
  qualities: Quality[];
  qualityNames: QualityNameRow[];
  selectedQualityId: string;
  setSelectedQualityId: (v: string) => void;
  qualityDims: QualityCarpetDim[];
  prices: ClientCarpetPrice[];
  editingPriceKey: string | null;
  editingPriceValue: string;
  getPriceForDim: (dimId: string | null) => ClientCarpetPrice | undefined;
  formatPrice: (cents: number) => string;
  startEditPrice: (key: string, currentCents: number) => void;
  commitEditPrice: (carpetDimensionId: string | null) => void;
  setEditingPriceKey: (v: string | null) => void;
  setEditingPriceValue: (v: string) => void;
  savePrice: (carpetDimensionId: string | null, priceCents: number) => void;
  getQualityLabel: (qualityId: string) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Quality selector */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          Selecteer kwaliteit
        </label>
        <select
          value={selectedQualityId}
          onChange={(e) => setSelectedQualityId(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Kies een kwaliteit...</option>
          {qualities.map((q) => {
            const custom = qualityNames.find((n) => n.quality_id === q.id);
            return (
              <option key={q.id} value={q.id}>
                {q.name}
                {custom ? ` (${custom.custom_name})` : ""}
              </option>
            );
          })}
        </select>
      </div>

      {selectedQualityId && (
        <>
          {/* Prices table */}
          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Afmeting
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Eenheid
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Prijs
                  </th>
                </tr>
              </thead>
              <tbody>
                {qualityDims.map((qd) => {
                  const dim = qd.carpet_dimensions;
                  if (!dim) return null;
                  const existing = getPriceForDim(dim.id);
                  const priceKey = `dim-${dim.id}`;
                  const isEditing = editingPriceKey === priceKey;

                  return (
                    <tr
                      key={dim.id}
                      className="border-b border-border/50 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-card-foreground">
                        {dim.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">stuk</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <Input
                            type="text"
                            value={editingPriceValue}
                            onChange={(e) =>
                              setEditingPriceValue(e.target.value)
                            }
                            onBlur={() => commitEditPrice(dim.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEditPrice(dim.id);
                              if (e.key === "Escape")
                                setEditingPriceKey(null);
                            }}
                            className="ml-auto w-28 text-right"
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() =>
                              startEditPrice(
                                priceKey,
                                existing?.price_cents ?? 0
                              )
                            }
                            className="rounded px-2 py-1 text-right font-mono hover:bg-muted"
                          >
                            {existing
                              ? `\u20AC ${formatPrice(existing.price_cents)}`
                              : "\u2014"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Afwijkende maten row */}
                {(() => {
                  const existing = getPriceForDim(null);
                  const priceKey = "dim-null";
                  const isEditing = editingPriceKey === priceKey;

                  return (
                    <tr className="border-b border-border/50 bg-amber-50/50 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-card-foreground">
                        Afwijkende maten
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">m2</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <Input
                            type="text"
                            value={editingPriceValue}
                            onChange={(e) =>
                              setEditingPriceValue(e.target.value)
                            }
                            onBlur={() => commitEditPrice(null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEditPrice(null);
                              if (e.key === "Escape")
                                setEditingPriceKey(null);
                            }}
                            className="ml-auto w-28 text-right"
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() =>
                              startEditPrice(
                                priceKey,
                                existing?.price_cents ?? 0
                              )
                            }
                            className="rounded px-2 py-1 text-right font-mono hover:bg-muted"
                          >
                            {existing
                              ? `\u20AC ${formatPrice(existing.price_cents)}`
                              : "\u2014"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>

          {/* Price calculator */}
          <PriceCalculator
            onApply={(priceCents) => {
              // Apply to the "afwijkende maten" row by default
              savePrice(null, priceCents);
            }}
          />
        </>
      )}

      {!selectedQualityId && (
        <div className="rounded-2xl bg-card p-6 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">
            Selecteer een kwaliteit om prijzen te beheren.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Orders ───────────────────────────────────── */

function OrdersTab({
  orders,
  statusLabel,
  router,
}: {
  orders: OrderRow[];
  statusLabel: (s: string) => string;
  router: ReturnType<typeof useRouter>;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-6 text-center ring-1 ring-border">
        <p className="text-sm text-muted-foreground">
          Nog geen orders voor deze klant.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">
              Order nr.
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">
              Collectie
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">
              Levertijd
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              onClick={() => router.push(`/orders/${o.id}`)}
              className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30"
            >
              <td className="px-4 py-3 font-mono font-medium text-card-foreground">
                {o.order_number}
              </td>
              <td className="px-4 py-3 text-card-foreground">
                {o.collections?.name ?? "\u2014"}
              </td>
              <td className="px-4 py-3 text-card-foreground">
                {new Date(o.delivery_date).toLocaleDateString("nl-NL")}
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary">{statusLabel(o.status)}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
