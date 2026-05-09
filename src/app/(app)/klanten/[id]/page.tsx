"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoUpload } from "@/components/logo-upload";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Trash2,
  Check,
  X,
  Save,
  MapPin,
  Euro,
} from "lucide-react";
import Link from "next/link";

/* ─── Types ──────────────────────────────────────────── */

interface ClientRow {
  id: string;
  name: string;
  client_type: string;
  client_number: string | null;
  contact_email: string | null;
  logo_url: string | null;
  active: boolean;
  price_list_nr: string | null;
}

interface PriceListOption {
  nr: string;
  name: string;
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
  base_price: number | null;
}

interface AddressRow {
  id: string;
  client_id: string;
  label: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  is_primary: boolean;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  delivery_date: string;
  created_at: string;
  collections: { name: string } | null;
}

type TabKey = "adressen" | "eigen-namen" | "orders";

/* ─── Component ──────────────────────────────────────── */

export default function KlantDetailPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("adressen");

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

  // Prijslijst
  const [priceLists, setPriceLists] = useState<PriceListOption[]>([]);
  const [selectedPriceListNr, setSelectedPriceListNr] = useState<string>("");
  const [savingPriceList, setSavingPriceList] = useState(false);

  // Orders
  const [orders, setOrders] = useState<OrderRow[]>([]);

  // Adressen
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addrLabel, setAddrLabel] = useState("");
  const [addrStreet, setAddrStreet] = useState("");
  const [addrPostalCode, setAddrPostalCode] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrCountry, setAddrCountry] = useState("Nederland");

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
      setSelectedPriceListNr(row.price_list_nr ?? "");
    }
    setLoading(false);
  }, [supabase, clientId]);

  const loadPriceLists = useCallback(async () => {
    const { data } = await supabase
      .from("price_lists")
      .select("nr, name")
      .order("nr");
    setPriceLists((data as PriceListOption[]) ?? []);
  }, [supabase]);

  /* ─── Load eigen namen ─── */

  const loadQualityNames = useCallback(async () => {
    const [{ data: namesData }, { data: qualsData }] = await Promise.all([
      supabase
        .from("client_quality_names")
        .select("*, qualities(name)")
        .eq("client_id", clientId),
      supabase
        .from("qualities")
        .select("id, name, code, base_price")
        .eq("active", true)
        .order("name"),
    ]);
    setQualityNames((namesData as QualityNameRow[]) ?? []);
    setQualities((qualsData as Quality[]) ?? []);
  }, [supabase, clientId]);

  /* ─── Load orders ─── */

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select("*, collections(name)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setOrders((data as OrderRow[]) ?? []);
  }, [supabase, clientId]);

  /* ─── Load addresses ─── */

  const loadAddresses = useCallback(async () => {
    const { data } = await supabase
      .from("client_addresses")
      .select("*")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("label");
    setAddresses((data as AddressRow[]) ?? []);
  }, [supabase, clientId]);

  /* ─── Handlers: addresses ─── */

  function resetAddressForm() {
    setAddrLabel("");
    setAddrStreet("");
    setAddrPostalCode("");
    setAddrCity("");
    setAddrCountry("Nederland");
    setEditingAddressId(null);
    setShowAddressForm(false);
  }

  function startEditAddress(addr: AddressRow) {
    setAddrLabel(addr.label);
    setAddrStreet(addr.street ?? "");
    setAddrPostalCode(addr.postal_code ?? "");
    setAddrCity(addr.city ?? "");
    setAddrCountry(addr.country ?? "Nederland");
    setEditingAddressId(addr.id);
    setShowAddressForm(true);
  }

  async function handleAddAddress() {
    if (!addrLabel.trim()) return;
    const isPrimary = addresses.length === 0;
    await supabase.from("client_addresses").insert({
      client_id: clientId,
      label: addrLabel.trim(),
      street: addrStreet.trim() || null,
      postal_code: addrPostalCode.trim() || null,
      city: addrCity.trim() || null,
      country: addrCountry.trim() || null,
      is_primary: isPrimary,
    });
    resetAddressForm();
    loadAddresses();
  }

  async function handleUpdateAddress(id: string) {
    if (!addrLabel.trim()) return;
    await supabase
      .from("client_addresses")
      .update({
        label: addrLabel.trim(),
        street: addrStreet.trim() || null,
        postal_code: addrPostalCode.trim() || null,
        city: addrCity.trim() || null,
        country: addrCountry.trim() || null,
      })
      .eq("id", id);
    resetAddressForm();
    loadAddresses();
  }

  async function handleDeleteAddress(id: string) {
    await supabase.from("client_addresses").delete().eq("id", id);
    loadAddresses();
  }

  async function handleSetPrimary(id: string) {
    await supabase
      .from("client_addresses")
      .update({ is_primary: false })
      .eq("client_id", clientId);
    await supabase
      .from("client_addresses")
      .update({ is_primary: true })
      .eq("id", id);
    loadAddresses();
  }

  /* ─── Effects ─── */

  useEffect(() => {
    loadClient();
    loadQualityNames();
    loadOrders();
    loadAddresses();
    loadPriceLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleChangePriceList(nr: string) {
    setSavingPriceList(true);
    const newNr = nr || null;
    await supabase.from("clients").update({ price_list_nr: newNr }).eq("id", clientId);
    setSelectedPriceListNr(nr);
    setSavingPriceList(false);
    loadClient();
  }

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

  async function deleteClient() {
    if (!confirm(`Klant "${client?.name}" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    await supabase.from("client_addresses").delete().eq("client_id", clientId);
    await supabase.from("client_quality_names").delete().eq("client_id", clientId);
    await supabase.from("clients").delete().eq("id", clientId);
    router.push("/klanten");
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
    { key: "adressen", label: "Adressen" },
    { key: "eigen-namen", label: "Eigen namen" },
    { key: "orders", label: "Orders" },
  ];

  const currentPriceList = priceLists.find((pl) => pl.nr === selectedPriceListNr);

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
                  <option value="retailer">Hoofdkantoor</option>
                  <option value="branch">Filiaal</option>
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
                      client.client_type === "retailer"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {client.client_type === "retailer" ? "Hoofdkantoor" : client.client_type === "branch" ? "Filiaal" : client.client_type}
                  </Badge>
                  {client.contact_email && <span>{client.contact_email}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil size={14} /> Bewerken
                </Button>
                <Button size="sm" variant="outline" onClick={deleteClient} className="text-destructive hover:bg-destructive/10">
                  <Trash2 size={14} /> Verwijderen
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prijslijst-koppeling */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
        <div className="flex items-center gap-2 text-sm font-medium text-card-foreground">
          <Euro size={14} className="text-muted-foreground" />
          Prijslijst
        </div>
        <select
          value={selectedPriceListNr}
          onChange={(e) => handleChangePriceList(e.target.value)}
          disabled={savingPriceList}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <option value="">— Geen prijslijst gekoppeld —</option>
          {priceLists.map((pl) => (
            <option key={pl.nr} value={pl.nr}>
              {pl.nr} — {pl.name}
            </option>
          ))}
        </select>
        {currentPriceList && (
          <Link
            href={`/prijslijst/${encodeURIComponent(currentPriceList.nr)}`}
            className="text-xs text-amber-700 hover:underline"
          >
            Open prijslijst →
          </Link>
        )}
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
      {activeTab === "adressen" && (
        <div className="space-y-4">
          {/* Add button */}
          {!showAddressForm && (
            <Button
              size="sm"
              onClick={() => {
                resetAddressForm();
                setShowAddressForm(true);
              }}
            >
              <Plus size={14} /> Adres toevoegen
            </Button>
          )}

          {/* Add / Edit form */}
          {showAddressForm && (
            <div className="rounded-2xl bg-card p-5 ring-1 ring-border space-y-3">
              <h3 className="text-sm font-medium text-card-foreground">
                {editingAddressId ? "Adres bewerken" : "Nieuw adres"}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Label *</label>
                  <Input
                    value={addrLabel}
                    onChange={(e) => setAddrLabel(e.target.value)}
                    placeholder="bijv. Hoofdkantoor, Magazijn"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Straat</label>
                  <Input
                    value={addrStreet}
                    onChange={(e) => setAddrStreet(e.target.value)}
                    placeholder="Straat en huisnummer"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Postcode</label>
                  <Input
                    value={addrPostalCode}
                    onChange={(e) => setAddrPostalCode(e.target.value)}
                    placeholder="1234 AB"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Stad</label>
                  <Input
                    value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)}
                    placeholder="Stad"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Land</label>
                  <Input
                    value={addrCountry}
                    onChange={(e) => setAddrCountry(e.target.value)}
                    placeholder="Land"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    editingAddressId
                      ? handleUpdateAddress(editingAddressId)
                      : handleAddAddress()
                  }
                  disabled={!addrLabel.trim()}
                >
                  <Save size={14} />{" "}
                  {editingAddressId ? "Opslaan" : "Toevoegen"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetAddressForm}
                >
                  Annuleren
                </Button>
              </div>
            </div>
          )}

          {/* Address list */}
          {addresses.length === 0 ? (
            <div className="rounded-2xl bg-card p-6 text-center ring-1 ring-border">
              <MapPin size={24} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nog geen adressen voor deze klant.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {addresses.map((addr) => {
                const parts = [addr.street, addr.postal_code, addr.city, addr.country].filter(Boolean);
                return (
                  <div
                    key={addr.id}
                    className="flex items-start justify-between rounded-2xl bg-card p-4 ring-1 ring-border"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-card-foreground">
                          {addr.label}
                        </span>
                        {addr.is_primary && (
                          <Badge variant="default">Standaard</Badge>
                        )}
                      </div>
                      {parts.length > 0 && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {parts.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!addr.is_primary && (
                        <button
                          onClick={() => handleSetPrimary(addr.id)}
                          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Instellen als standaard"
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => startEditAddress(addr)}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Bewerken"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        title="Verwijderen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
                {o.collections?.name ?? "—"}
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
