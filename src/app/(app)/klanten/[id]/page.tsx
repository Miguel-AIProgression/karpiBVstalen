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
  Sparkles,
  Calculator,
  MapPin,
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
  base_price: number | null;
}

interface CarpetDimension {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
}

interface ClientCarpetPrice {
  id: string;
  client_id: string;
  quality_id: string;
  carpet_dimension_id: string | null;
  price_cents: number;
  unit: string;
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

type TabKey = "adressen" | "eigen-namen" | "prijzen" | "orders";

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

  // Prijzen
  const [selectedQualityId, setSelectedQualityId] = useState("");
  const [carpetDims, setCarpetDims] = useState<CarpetDimension[]>([]);
  const [prices, setPrices] = useState<ClientCarpetPrice[]>([]);
  const [editingPriceKey, setEditingPriceKey] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

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
        .select("id, name, code, base_price")
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
        setCarpetDims([]);
        setPrices([]);
        return;
      }
      const [{ data: dimsData }, { data: pricesData }] = await Promise.all([
        supabase
          .from("carpet_dimensions")
          .select("*")
          .eq("active", true)
          .order("width_cm"),
        supabase
          .from("client_carpet_prices")
          .select("*")
          .eq("client_id", clientId)
          .eq("quality_id", qualityId),
      ]);
      setCarpetDims((dimsData as CarpetDimension[]) ?? []);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (!selectedQualityId && qualityNames.length > 0) {
      setSelectedQualityId(qualityNames[0].quality_id);
    }
  }, [qualityNames, selectedQualityId]);

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
    // Find existing record
    let query = supabase
      .from("client_carpet_prices")
      .select("id")
      .eq("client_id", clientId)
      .eq("quality_id", selectedQualityId);

    if (carpetDimensionId) {
      query = query.eq("carpet_dimension_id", carpetDimensionId);
    } else {
      query = query.is("carpet_dimension_id", null);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      await supabase
        .from("client_carpet_prices")
        .update({ price_cents: priceCents })
        .eq("id", existing.id);
    } else {
      await supabase.from("client_carpet_prices").insert({
        client_id: clientId,
        quality_id: selectedQualityId,
        carpet_dimension_id: carpetDimensionId,
        price_cents: priceCents,
        unit: carpetDimensionId ? "piece" : "m2",
      });
    }
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
    { key: "adressen", label: "Adressen" },
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

      {activeTab === "prijzen" && (
        <PrijzenTab
          clientId={clientId}
          qualities={qualities}
          qualityNames={qualityNames}
          selectedQualityId={selectedQualityId}
          setSelectedQualityId={setSelectedQualityId}
          carpetDims={carpetDims}
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
          onQualitiesChanged={loadQualityNames}
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
  clientId: _clientId,
  qualities,
  qualityNames,
  selectedQualityId,
  setSelectedQualityId,
  carpetDims,
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
  onQualitiesChanged,
}: {
  clientId: string;
  qualities: Quality[];
  qualityNames: QualityNameRow[];
  selectedQualityId: string;
  setSelectedQualityId: (v: string) => void;
  carpetDims: CarpetDimension[];
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
  onQualitiesChanged: () => void;
}) {
  const supabase = createClient();
  const clientId = _clientId;
  const selectedQuality = qualities.find((q) => q.id === selectedQualityId);
  const [, setEditingBasePrice] = useState(false);

  // Bulk: alle kwaliteiten in één keer
  const [bulkFactor, setBulkFactor] = useState<number>(2.5);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);

  function bulkRoundTo5or9(cents: number): number {
    const rounded = Math.round(cents / 100);
    const base = Math.floor(rounded / 10) * 10;
    const candidates = [base - 1, base + 5, base + 9];
    let best = candidates[0];
    let bestDist = Math.abs(rounded - best);
    for (const c of candidates) {
      const dist = Math.abs(rounded - c);
      if (dist < bestDist) { best = c; bestDist = dist; }
    }
    return best * 100;
  }

  async function applyBulkPrices() {
    setBulkApplying(true);
    setBulkDone(false);

    // Load ALL quality_base_prices for all qualities this client has
    const qualityIds = qualityNames.map((n) => n.quality_id);
    const { data: allBasePrices } = await supabase
      .from("quality_base_prices")
      .select("quality_id, carpet_dimension_id, price_cents, unit")
      .in("quality_id", qualityIds);

    if (!allBasePrices || allBasePrices.length === 0) {
      setBulkApplying(false);
      return;
    }

    // For each base price, upsert client price
    for (const bp of allBasePrices) {
      if (bp.price_cents <= 0) continue;
      const adjustedCents = bulkRoundTo5or9(Math.round(bp.price_cents * bulkFactor));

      // Check if client already has a price for this quality+dimension
      let query = supabase
        .from("client_carpet_prices")
        .select("id")
        .eq("client_id", clientId)
        .eq("quality_id", bp.quality_id);

      if (bp.carpet_dimension_id) {
        query = query.eq("carpet_dimension_id", bp.carpet_dimension_id);
      } else {
        query = query.is("carpet_dimension_id", null);
      }

      const { data: existing } = await query.maybeSingle();

      if (existing) {
        await supabase
          .from("client_carpet_prices")
          .update({ price_cents: adjustedCents })
          .eq("id", existing.id);
      } else {
        await supabase.from("client_carpet_prices").insert({
          client_id: clientId,
          quality_id: bp.quality_id,
          carpet_dimension_id: bp.carpet_dimension_id,
          price_cents: adjustedCents,
          unit: bp.carpet_dimension_id ? "piece" : "m2",
        });
      }
    }

    setBulkApplying(false);
    setBulkDone(true);
    // Reload current quality prices
    if (selectedQualityId) {
      // Trigger reload by re-selecting
      const q = selectedQualityId;
      setSelectedQualityId("");
      setTimeout(() => setSelectedQualityId(q), 50);
    }
  }

  // Prijslijst overnemen
  interface BasePriceRow { quality_id: string; carpet_dimension_id: string | null; price_cents: number; unit: string }
  const [basePrices, setBasePrices] = useState<BasePriceRow[]>([]);
  const [basePricesLoaded, setBasePricesLoaded] = useState(false);
  const [applyFactor, setApplyFactor] = useState<number>(1);
  const [applyingPrijslijst, setApplyingPrijslijst] = useState(false);

  // Load base prices when quality changes
  useEffect(() => {
    if (!selectedQualityId) { setBasePrices([]); setBasePricesLoaded(false); return; }
    supabase
      .from("quality_base_prices")
      .select("quality_id, carpet_dimension_id, price_cents, unit")
      .eq("quality_id", selectedQualityId)
      .then(({ data }) => {
        setBasePrices((data as BasePriceRow[]) ?? []);
        setBasePricesLoaded(true);
      });
  }, [selectedQualityId, supabase]);

  const hasPrijslijstPrices = basePrices.some((bp) => bp.price_cents > 0);

  // Afronden naar dichtstbijzijnde euro eindigend op 5 of 9
  function roundTo5or9(cents: number): number {
    const rounded = Math.round(cents / 100);
    const base = Math.floor(rounded / 10) * 10;
    const candidates = [base - 1, base + 5, base + 9];
    let best = candidates[0];
    let bestDist = Math.abs(rounded - best);
    for (const c of candidates) {
      const dist = Math.abs(rounded - c);
      if (dist < bestDist) { best = c; bestDist = dist; }
    }
    return best * 100;
  }

  function calcAdjustedCents(priceCents: number): number {
    if (applyFactor === 1) return priceCents; // 1:1 overnemen, geen afronding
    // verkoopprijs incl BTW = inkoop × factor, afgerond naar 5 of 9
    return roundTo5or9(Math.round(priceCents * applyFactor));
  }

  async function applyPrijslijstPrices() {
    if (!hasPrijslijstPrices) return;
    setApplyingPrijslijst(true);
    for (const bp of basePrices) {
      if (bp.price_cents <= 0) continue;
      await savePrice(bp.carpet_dimension_id, calcAdjustedCents(bp.price_cents));
    }
    setApplyingPrijslijst(false);
  }

  return (
    <div className="space-y-4">
      {/* Bulk: alle kwaliteiten in één keer */}
      {qualityNames.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles size={16} className="text-primary" />
            Alle kwaliteiten in één keer vullen vanuit prijslijst
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Factor</label>
              <select
                value={bulkFactor}
                onChange={(e) => { setBulkFactor(parseFloat(e.target.value)); setBulkDone(false); }}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value={1}>&times;1 (prijslijst overnemen)</option>
                <option value={2.5}>&times;2,5</option>
                <option value={3}>&times;3</option>
              </select>
            </div>
            <Button
              size="sm"
              onClick={applyBulkPrices}
              disabled={bulkApplying}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {bulkApplying
                ? "Bezig..."
                : `Prijzen invullen voor ${qualityNames.length} kwaliteiten`}
            </Button>
            {bulkDone && (
              <span className="flex items-center gap-1 text-sm text-green-700">
                <Check size={14} /> Klaar!
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Berekening: prijslijst &times; factor &times; 1,21 BTW, afgerond naar boven op 5 of 9
            {bulkFactor !== 1 && <> (factor &times;1 neemt prijzen 1:1 over)</>}
          </p>
        </div>
      )}

      {/* Quality selector */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          Selecteer kwaliteit
        </label>
        <select
          value={selectedQualityId}
          onChange={(e) => {
            setSelectedQualityId(e.target.value);
            setEditingBasePrice(false);
          }}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Kies een kwaliteit...</option>
          {qualityNames.map((n) => {
            const q = qualities.find((q) => q.id === n.quality_id);
            return (
              <option key={n.quality_id} value={n.quality_id}>
                {q?.name ?? n.quality_id}
                {` (${n.custom_name})`}
              </option>
            );
          })}
        </select>
      </div>

      {selectedQualityId && selectedQuality && (
        <>
          {/* Prices table */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-card-foreground">Verkoopprijzen klant (incl. BTW)</h3>
              <span className="text-[11px] text-muted-foreground">Klik op een prijs om te wijzigen</span>
            </div>
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
                    <th className="w-40 px-4 py-3 text-right font-medium text-muted-foreground">
                      Prijs incl. BTW
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {carpetDims.map((dim) => {
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
                        <td className="px-4 py-3 text-muted-foreground">St.</td>
                        <td className="w-40 px-4 py-3 text-right">
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
                              className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-right font-mono hover:bg-muted"
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
                      <tr className="bg-amber-50/50 transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-card-foreground">
                          Afwijkende maten
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">m&sup2;</td>
                        <td className="w-40 px-4 py-3 text-right">
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
                              className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-right font-mono hover:bg-muted"
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
          </div>

          {/* Overnemen van prijslijst */}
          {basePricesLoaded && hasPrijslijstPrices && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Calculator size={16} />
                Overnemen van prijslijst
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Factor</label>
                  <select
                    value={applyFactor}
                    onChange={(e) => setApplyFactor(parseFloat(e.target.value))}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={1}>&times;1 (prijslijst overnemen)</option>
                    <option value={2.5}>&times;2,5</option>
                    <option value={3}>&times;3</option>
                  </select>
                </div>
                <Button
                  size="sm"
                  onClick={applyPrijslijstPrices}
                  disabled={applyingPrijslijst}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {applyingPrijslijst ? "Bezig..." : "Alle prijzen invullen"}
                </Button>
              </div>

              {/* Preview */}
              <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                <p className="text-xs font-medium text-green-700 mb-2">Voorbeeld:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
                  {basePrices.filter((bp) => bp.price_cents > 0).map((bp) => {
                    const dim = carpetDims.find((d) => d.id === bp.carpet_dimension_id);
                    const label = bp.carpet_dimension_id ? (dim?.name ?? "?") : "Afwijkend /m\u00B2";
                    const adjusted = calcAdjustedCents(bp.price_cents);
                    return (
                      <div key={bp.carpet_dimension_id ?? "null"} className="text-green-800">
                        <span className="text-green-600 text-xs">{label}</span>
                        <br />
                        <span className="font-semibold">&euro; {(adjusted / 100).toFixed(2).replace(".", ",")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {basePricesLoaded && !hasPrijslijstPrices && (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4">
              <p className="text-sm text-muted-foreground">
                Geen prijslijst ingesteld voor deze kwaliteit. Stel eerst prijzen in via{" "}
                <a href="/prijslijst" className="underline hover:text-foreground">Prijslijst</a>.
              </p>
            </div>
          )}
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
