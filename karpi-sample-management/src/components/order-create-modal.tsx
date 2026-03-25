"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, ArrowRight, ArrowLeft, Check, Pencil, Plus } from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface ClientOption {
  id: string;
  name: string;
  client_number: string | null;
  logo_url: string | null;
}

interface CollectionOption {
  id: string;
  name: string;
  bundle_count: number;
  price_cents: number | null;
}

interface AddressOption {
  id: string;
  label: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  is_primary: boolean;
}

interface BundleDetail {
  id: string;
  name: string;
  quality_id: string;
  quality_name: string;
  quality_code: string;
  base_price: number | null;
  dimension_name: string;
  color_count: number;
}

interface QualityRow {
  quality_id: string;
  quality_name: string;
  quality_code: string;
  base_price: number | null;
  client_name: string;
  bundles: BundleDetail[];
}

interface OrderCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

/* ─── Week helpers ───────────────────────────────────── */

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}

/** Returns the Monday of a given ISO week */
function mondayOfWeek(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

function generateWeekOptions(count: number): { label: string; value: string; week: number; year: number }[] {
  const today = new Date();
  // Start 3 weken vanaf nu (vroegst mogelijke levering)
  const start = new Date(today);
  start.setDate(start.getDate() + 3 * 7);
  const options: { label: string; value: string; week: number; year: number }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    const w = getISOWeek(d);
    const y = getISOWeekYear(d);
    const dateStr = mondayOfWeek(y, w);
    // Avoid duplicates (same week)
    if (options.length > 0 && options[options.length - 1].week === w && options[options.length - 1].year === y) continue;
    options.push({ label: `Week ${w} (${y})`, value: dateStr, week: w, year: y });
  }
  return options;
}

/* ─── Component ──────────────────────────────────────── */

export function OrderCreateModal({ open, onOpenChange, onCreated }: OrderCreateModalProps) {
  const supabase = createClient();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // Step 1: Klant
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  // Step 2: Collectie
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<CollectionOption | null>(null);

  // Step 3: Collectie-inhoud (nieuw)
  const [qualityRows, setQualityRows] = useState<QualityRow[]>([]);
  const [editedClientNames, setEditedClientNames] = useState<Record<string, string>>({});
  const [priceFactor, setPriceFactor] = useState<string>("2.5");
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Step 4: Adres & collectieprijs
  const [clientAddresses, setClientAddresses] = useState<AddressOption[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [shippingStreet, setShippingStreet] = useState("");
  const [shippingPostalCode, setShippingPostalCode] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingCountry, setShippingCountry] = useState("Nederland");
  const [collectionPriceInput, setCollectionPriceInput] = useState("");

  // Step 5: Levertijd
  const weekOptions = generateWeekOptions(26);
  const defaultWeekIndex = 0; // eerste optie = vroegst mogelijke levering
  const [deliveryDate, setDeliveryDate] = useState(weekOptions[defaultWeekIndex]?.value ?? "");
  const [notes, setNotes] = useState("");

  // Step 6: Bevestig
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from("clients")
      .select("id, name, client_number, logo_url")
      .eq("active", true)
      .order("name");
    setClients(data ?? []);
  }, [supabase]);

  const loadCollections = useCallback(async () => {
    const { data } = await supabase
      .from("collections")
      .select("id, name, price_cents, collection_bundles(id)")
      .eq("active", true)
      .order("name");
    const mapped: CollectionOption[] = (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      bundle_count: c.collection_bundles?.length ?? 0,
      price_cents: c.price_cents ?? null,
    }));
    setCollections(mapped);
  }, [supabase]);

  const loadClientAddresses = useCallback(async (clientId: string) => {
    const { data } = await supabase
      .from("client_addresses")
      .select("id, label, street, postal_code, city, country, is_primary")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("label");
    const addresses = (data as AddressOption[]) ?? [];
    setClientAddresses(addresses);
    // Auto-select primary address
    const primary = addresses.find((a) => a.is_primary) ?? addresses[0];
    if (primary) {
      setSelectedAddressId(primary.id);
      setShippingStreet(primary.street ?? "");
      setShippingPostalCode(primary.postal_code ?? "");
      setShippingCity(primary.city ?? "");
      setShippingCountry(primary.country ?? "Nederland");
    }
  }, [supabase]);

  const loadCollectionDetails = useCallback(async (collectionId: string, clientId: string) => {
    setLoadingDetails(true);

    // Load bundles in this collection with quality + dimension info
    const { data: cbData } = await supabase
      .from("collection_bundles")
      .select(`
        bundle_id,
        position,
        bundles (
          id, name, quality_id,
          qualities ( id, name, code, base_price ),
          sample_dimensions ( name ),
          bundle_colors ( id )
        )
      `)
      .eq("collection_id", collectionId)
      .order("position");

    // Load client-specific quality names
    const { data: clientNames } = await supabase
      .from("client_quality_names")
      .select("quality_id, custom_name")
      .eq("client_id", clientId);

    const clientNameMap: Record<string, string> = {};
    (clientNames ?? []).forEach((cn: any) => {
      clientNameMap[cn.quality_id] = cn.custom_name;
    });

    // Group bundles by quality
    const qualityMap = new Map<string, QualityRow>();
    (cbData ?? []).forEach((cb: any) => {
      const b = cb.bundles;
      if (!b) return;
      const q = b.qualities;
      if (!q) return;

      const bundle: BundleDetail = {
        id: b.id,
        name: b.name,
        quality_id: q.id,
        quality_name: q.name,
        quality_code: q.code,
        base_price: q.base_price,
        dimension_name: b.sample_dimensions?.name ?? "—",
        color_count: b.bundle_colors?.length ?? 0,
      };

      if (!qualityMap.has(q.id)) {
        qualityMap.set(q.id, {
          quality_id: q.id,
          quality_name: q.name,
          quality_code: q.code,
          base_price: q.base_price,
          client_name: clientNameMap[q.id] ?? "",
          bundles: [],
        });
      }
      qualityMap.get(q.id)!.bundles.push(bundle);
    });

    const rows = Array.from(qualityMap.values());
    setQualityRows(rows);

    // Initialize edited client names from DB values
    const initNames: Record<string, string> = {};
    rows.forEach((r) => {
      initNames[r.quality_id] = r.client_name;
    });
    setEditedClientNames(initNames);

    setLoadingDetails(false);
  }, [supabase]);

  async function handleCreateClient() {
    const name = newClientName.trim();
    if (!name) return;
    setSavingClient(true);
    setError("");

    const { data, error: insertErr } = await supabase
      .from("clients")
      .insert({
        name,
        client_type: "retailer",
        active: true,
      })
      .select("id, name, client_number, logo_url")
      .single();

    if (insertErr || !data) {
      console.error("Client insert error:", insertErr);
      setError(insertErr?.message ?? "Kon klant niet aanmaken");
      setSavingClient(false);
      return;
    }

    // Add to list, select, and move to step 2
    setClients((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedClient(data);
    setShowNewClient(false);
    setNewClientName("");
    setSavingClient(false);
    setStep(2);
  }

  useEffect(() => {
    if (open) {
      loadClients();
      loadCollections();
    }
  }, [open, loadClients, loadCollections]);

  // Load collection details when entering step 3
  useEffect(() => {
    if (step === 3 && selectedCollection && selectedClient) {
      loadCollectionDetails(selectedCollection.id, selectedClient.id);
    }
  }, [step, selectedCollection, selectedClient, loadCollectionDetails]);

  function resetAll() {
    setStep(1);
    setClientSearch("");
    setSelectedClient(null);
    setShowNewClient(false);
    setNewClientName("");
    setSavingClient(false);
    setSelectedCollection(null);
    setQualityRows([]);
    setEditedClientNames({});
    setPriceFactor("2.5");
    setLoadingDetails(false);
    setDeliveryDate(weekOptions[defaultWeekIndex]?.value ?? "");
    setNotes("");
    setError("");
    setSaving(false);
  }

  function handleClose() {
    resetAll();
    onOpenChange(false);
  }

  async function saveClientNames() {
    if (!selectedClient) return;

    // Save edited client quality names back to DB
    for (const row of qualityRows) {
      const newName = (editedClientNames[row.quality_id] ?? "").trim();
      const oldName = row.client_name;

      if (newName === oldName) continue;

      if (newName === "") {
        // Delete the custom name if cleared
        if (oldName) {
          await supabase
            .from("client_quality_names")
            .delete()
            .eq("client_id", selectedClient.id)
            .eq("quality_id", row.quality_id);
        }
      } else if (oldName) {
        // Update existing
        await supabase
          .from("client_quality_names")
          .update({ custom_name: newName })
          .eq("client_id", selectedClient.id)
          .eq("quality_id", row.quality_id);
      } else {
        // Insert new
        await supabase
          .from("client_quality_names")
          .insert({
            client_id: selectedClient.id,
            quality_id: row.quality_id,
            custom_name: newName,
          });
      }
    }
  }

  async function handleConfirm() {
    if (!selectedClient || !selectedCollection || !deliveryDate) return;
    setSaving(true);
    setError("");

    const { error: insertError } = await supabase.from("orders").insert({
      client_id: selectedClient.id,
      collection_id: selectedCollection.id,
      delivery_date: deliveryDate,
      notes: notes.trim() || null,
      created_by: user?.id ?? null,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    handleClose();
    onCreated();
  }

  const filteredClients = clients.filter((c) => {
    if (!clientSearch) return true;
    const q = clientSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.client_number ?? "").toLowerCase().includes(q)
    );
  });

  if (!open) return null;

  const stepLabels = ["Kies klant", "Kies collectie", "Collectie-inhoud", "Levertijd", "Bevestig"];
  const factor = parseFloat(priceFactor) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-background p-6 ring-1 ring-border shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Nieuwe order aanmaken</h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="mb-5 flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  s === step
                    ? "bg-primary text-primary-foreground"
                    : s < step
                    ? "bg-green-100 text-green-800"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s < step ? <Check size={14} /> : s}
              </div>
              {s < 5 && (
                <div className={`h-0.5 w-4 ${s < step ? "bg-green-300" : "bg-border"}`} />
              )}
            </div>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">{stepLabels[step - 1]}</span>
        </div>

        {/* Step 1: Kies klant */}
        {step === 1 && (
          <div className="space-y-3">
            {!showNewClient ? (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
                    <Input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Zoek klant..."
                      className="pl-8"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewClient(true)}
                    className="shrink-0"
                  >
                    <Plus size={14} /> Nieuw
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedClient(c);
                        loadClientAddresses(c.id);
                        setStep(2);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                        selectedClient?.id === c.id ? "bg-primary/10 ring-1 ring-primary/30" : ""
                      }`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                        {c.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0]?.toUpperCase() ?? "")
                          .join("")}
                      </div>
                      <div>
                        <div className="font-medium text-card-foreground">{c.name}</div>
                        {c.client_number && (
                          <div className="text-xs text-muted-foreground">{c.client_number}</div>
                        )}
                      </div>
                    </button>
                  ))}
                  {filteredClients.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Geen klanten gevonden
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowNewClient(false)}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <span className="text-sm font-medium text-card-foreground">Nieuwe klant aanmaken</span>
                </div>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Naam *</label>
                    <Input
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Bijv. Tapijt De Luxe"
                      autoFocus
                    />
                  </div>
                </div>
                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}
                <Button
                  size="sm"
                  onClick={handleCreateClient}
                  disabled={!newClientName.trim() || savingClient}
                  className="w-full"
                >
                  {savingClient ? "Aanmaken..." : "Klant aanmaken en selecteren"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Kies collectie */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="max-h-64 overflow-y-auto space-y-1">
              {collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCollection(c);
                    setStep(3);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                    selectedCollection?.id === c.id ? "bg-primary/10 ring-1 ring-primary/30" : ""
                  }`}
                >
                  <span className="font-medium text-card-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.bundle_count} bundel{c.bundle_count !== 1 ? "s" : ""}
                  </span>
                </button>
              ))}
              {collections.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Geen collecties gevonden
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Collectie-inhoud */}
        {step === 3 && (
          <div className="space-y-4">
            {loadingDetails ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Laden...</p>
            ) : (
              <>
                {/* Prijsfactor bovenaan */}
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
                  <span className="text-sm text-muted-foreground">Prijsfactor</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">&times;</span>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={priceFactor}
                      onChange={(e) => setPriceFactor(e.target.value)}
                      className="w-20 text-center text-sm font-medium"
                    />
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Basisprijs &times; factor = klantprijs
                  </span>
                </div>

                {/* Kwaliteiten met bundels */}
                <div className="max-h-80 overflow-y-auto space-y-3">
                  {qualityRows.map((qr) => (
                    <div key={qr.quality_id} className="rounded-lg ring-1 ring-border overflow-hidden">
                      {/* Quality header */}
                      <div className="bg-muted/30 px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-card-foreground">
                              {qr.quality_name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Code: {qr.quality_code} · {qr.bundles.length} bundel{qr.bundles.length !== 1 ? "s" : ""}
                            </div>
                          </div>
                          {qr.base_price != null && (
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Basisprijs</div>
                              <div className="text-sm font-medium text-card-foreground">
                                &euro;{qr.base_price.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Klantnaam (verkoopnaam) */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">Verkoopnaam:</span>
                          <div className="relative flex-1">
                            <Input
                              value={editedClientNames[qr.quality_id] ?? ""}
                              onChange={(e) =>
                                setEditedClientNames((prev) => ({
                                  ...prev,
                                  [qr.quality_id]: e.target.value,
                                }))
                              }
                              placeholder={qr.quality_name + " (Karpi naam)"}
                              className="h-7 text-xs pr-7"
                            />
                            <Pencil size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                          </div>
                        </div>

                        {/* Berekende klantprijs */}
                        {qr.base_price != null && factor > 0 && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Klantprijs:</span>
                            <span className="font-semibold text-card-foreground">
                              &euro;{(qr.base_price * factor).toFixed(2)}
                            </span>
                            <span>
                              (&euro;{qr.base_price.toFixed(2)} &times; {factor})
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Bundels in deze kwaliteit */}
                      <div className="divide-y divide-border">
                        {qr.bundles.map((b) => (
                          <div key={b.id} className="flex items-center justify-between px-4 py-2 text-xs">
                            <span className="text-card-foreground">{b.name}</span>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <span>{b.dimension_name}</span>
                              <span>{b.color_count} kleuren</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {qualityRows.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Geen producten in deze collectie
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Levertijd */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Levertijd *</label>
              <select
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {weekOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Opmerkingen</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optionele opmerkingen..."
                rows={3}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {/* Step 5: Bevestig */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Klant</span>
                <span className="font-medium text-card-foreground">{selectedClient?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collectie</span>
                <span className="font-medium text-card-foreground">{selectedCollection?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kwaliteiten</span>
                <span className="font-medium text-card-foreground">{qualityRows.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prijsfactor</span>
                <span className="font-medium text-card-foreground">&times;{factor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Levertijd</span>
                <span className="font-medium text-card-foreground">
                  {weekOptions.find((o) => o.value === deliveryDate)?.label ?? deliveryDate}
                </span>
              </div>
              {notes.trim() && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Opmerkingen</span>
                  <span className="font-medium text-card-foreground text-right max-w-[60%]">
                    {notes}
                  </span>
                </div>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-5 flex items-center justify-between">
          <div>
            {step > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4 | 5)}
              >
                <ArrowLeft size={14} /> Vorige
              </Button>
            )}
          </div>
          <div>
            {step === 3 && (
              <Button
                size="sm"
                onClick={async () => {
                  await saveClientNames();
                  setStep(4);
                }}
                disabled={loadingDetails}
              >
                Volgende <ArrowRight size={14} />
              </Button>
            )}
            {step === 4 && (
              <Button
                size="sm"
                onClick={() => setStep(5)}
                disabled={!deliveryDate}
              >
                Volgende <ArrowRight size={14} />
              </Button>
            )}
            {step === 5 && (
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={saving}
              >
                {saving ? "Aanmaken..." : "Order aanmaken"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
