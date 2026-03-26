"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, ArrowRight, ArrowLeft, Check, Pencil, Plus, Square, CheckSquare, Camera, Trash2, Loader2, ChevronDown, ChevronRight, Eye } from "lucide-react";
import Image from "next/image";

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

interface BundleColor {
  code: string;
  name: string;
  hex_color: string | null;
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
  colors: BundleColor[];
}

interface DimensionPrice {
  dimension_name: string;
  width_cm: number;
  height_cm: number;
  price_cents: number; // inkoopprijs in centen
  unit: string;
}

interface QualityRow {
  quality_id: string;
  quality_name: string;
  quality_code: string;
  base_price: number | null;
  client_name: string;
  bundles: BundleDetail[];
  dimension_prices: DimensionPrice[];
}

interface AccessoryOption {
  id: string;
  name: string;
  type: string;
  default_price_cents: number;
}

interface SelectedAccessory {
  accessory_id: string;
  quantity: number;
  price_cents: number;
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
  const [excludedBundleIds, setExcludedBundleIds] = useState<Set<string>>(new Set());
  const [expandedBundleIds, setExpandedBundleIds] = useState<Set<string>>(new Set());
  const [expandedPriceQualityIds, setExpandedPriceQualityIds] = useState<Set<string>>(new Set());
  const [excludedDimensions, setExcludedDimensions] = useState<Set<string>>(new Set()); // "qualityId:dimensionName"
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

  // Accessoires (roede, display)
  const [accessories, setAccessories] = useState<AccessoryOption[]>([]);
  const [selectedAccessories, setSelectedAccessories] = useState<SelectedAccessory[]>([]);
  const [showAccessories, setShowAccessories] = useState(false);

  // Logo beheer
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showLogoPreview, setShowLogoPreview] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Step 6: Bevestig
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
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

  const loadAccessories = useCallback(async () => {
    const { data } = await supabase
      .from("accessories")
      .select("id, name, type, default_price_cents")
      .eq("active", true)
      .order("type");
    setAccessories((data as AccessoryOption[]) ?? []);
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
          bundle_colors ( id, color_codes ( code, name, hex_color ) )
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

      const colors: BundleColor[] = (b.bundle_colors ?? [])
        .map((bc: any) => bc.color_codes)
        .filter(Boolean)
        .map((cc: any) => ({ code: cc.code, name: cc.name, hex_color: cc.hex_color }));

      const bundle: BundleDetail = {
        id: b.id,
        name: b.name,
        quality_id: q.id,
        quality_name: q.name,
        quality_code: q.code,
        base_price: q.base_price,
        dimension_name: b.sample_dimensions?.name ?? "—",
        color_count: b.bundle_colors?.length ?? 0,
        colors,
      };

      if (!qualityMap.has(q.id)) {
        qualityMap.set(q.id, {
          quality_id: q.id,
          quality_name: q.name,
          quality_code: q.code,
          base_price: q.base_price,
          client_name: clientNameMap[q.id] ?? "",
          bundles: [],
          dimension_prices: [],
        });
      }
      qualityMap.get(q.id)!.bundles.push(bundle);
    });

    // Load quality_base_prices met carpet_dimensions voor alle kwaliteiten in deze collectie
    const qualityIds = Array.from(qualityMap.keys());
    if (qualityIds.length > 0) {
      const { data: basePrices } = await supabase
        .from("quality_base_prices")
        .select("quality_id, price_cents, unit, carpet_dimensions ( name, width_cm, height_cm )")
        .in("quality_id", qualityIds)
        .order("price_cents", { ascending: true });

      (basePrices ?? []).forEach((bp: any) => {
        const qr = qualityMap.get(bp.quality_id);
        if (!qr || !bp.carpet_dimensions) return;
        qr.dimension_prices.push({
          dimension_name: bp.carpet_dimensions.name,
          width_cm: bp.carpet_dimensions.width_cm,
          height_cm: bp.carpet_dimensions.height_cm,
          price_cents: bp.price_cents,
          unit: bp.unit,
        });
      });
    }

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
    loadClientAddresses(data.id);
    setShowNewClient(false);
    setNewClientName("");
    setSavingClient(false);
    setStep(2);
  }

  useEffect(() => {
    if (open) {
      loadClients();
      loadCollections();
      loadAccessories();
    }
  }, [open, loadClients, loadCollections, loadAccessories]);

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
    setClientLogoUrl(null);
    setUploadingLogo(false);
    setShowLogoPreview(false);
    setShowNewClient(false);
    setNewClientName("");
    setSavingClient(false);
    setSelectedCollection(null);
    setQualityRows([]);
    setEditedClientNames({});
    setPriceFactor("2.5");
    setSelectedAccessories([]);
    setShowAccessories(false);
    setExcludedBundleIds(new Set());
    setExpandedBundleIds(new Set());
    setExpandedPriceQualityIds(new Set());
    setExcludedDimensions(new Set());
    setLoadingDetails(false);
    setClientAddresses([]);
    setSelectedAddressId(null);
    setShippingStreet("");
    setShippingPostalCode("");
    setShippingCity("");
    setShippingCountry("Nederland");
    setCollectionPriceInput("");
    setDeliveryDate(weekOptions[defaultWeekIndex]?.value ?? "");
    setNotes("");
    setError("");
    savingRef.current = false;
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

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${selectedClient.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("client-logos")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("client-logos").getPublicUrl(path);
      const publicUrl = urlData.publicUrl + "?t=" + Date.now(); // cache bust
      await supabase.from("clients").update({ logo_url: publicUrl }).eq("id", selectedClient.id);
      setClientLogoUrl(publicUrl);
      setSelectedClient((prev) => prev ? { ...prev, logo_url: publicUrl } : prev);
    } catch (err) {
      console.error("Logo upload error:", err);
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleLogoDelete() {
    if (!selectedClient) return;
    setUploadingLogo(true);
    try {
      // List files in client folder and remove them
      const { data: files } = await supabase.storage.from("client-logos").list(selectedClient.id);
      if (files && files.length > 0) {
        await supabase.storage.from("client-logos").remove(files.map((f) => `${selectedClient.id}/${f.name}`));
      }
      await supabase.from("clients").update({ logo_url: null }).eq("id", selectedClient.id);
      setClientLogoUrl(null);
      setSelectedClient((prev) => prev ? { ...prev, logo_url: null } : prev);
    } catch (err) {
      console.error("Logo delete error:", err);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleConfirm() {
    if (!selectedClient || !selectedCollection || !deliveryDate || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");

    const priceCents = Math.round(parseFloat(collectionPriceInput || "0") * 100);

    const { data: orderData, error: insertError } = await supabase.from("orders").insert({
      client_id: selectedClient.id,
      collection_id: selectedCollection.id,
      delivery_date: deliveryDate,
      notes: notes.trim() || null,
      created_by: user?.id ?? null,
      shipping_street: shippingStreet.trim() || null,
      shipping_postal_code: shippingPostalCode.trim() || null,
      shipping_city: shippingCity.trim() || null,
      shipping_country: shippingCountry.trim() || null,
      collection_price_cents: priceCents > 0 ? priceCents : null,
      price_factor: factor > 0 ? factor : null,
      excluded_dimensions: excludedDimensions.size > 0 ? Array.from(excludedDimensions) : null,
    }).select("id").single();

    if (insertError || !orderData) {
      setError(insertError?.message ?? "Order aanmaken mislukt");
      savingRef.current = false;
    setSaving(false);
      return;
    }

    // Insert order_lines voor geselecteerde bundels (deduplicate op bundle_id)
    const seenBundleIds = new Set<string>();
    const selectedBundles = qualityRows
      .flatMap((qr) => qr.bundles)
      .filter((b) => {
        if (excludedBundleIds.has(b.id) || seenBundleIds.has(b.id)) return false;
        seenBundleIds.add(b.id);
        return true;
      });

    if (selectedBundles.length > 0) {
      const orderLines = selectedBundles.map((b) => ({
        order_id: orderData.id,
        bundle_id: b.id,
        quantity: 1,
      }));
      const { error: linesError } = await supabase.from("order_lines").insert(orderLines);
      if (linesError) {
        console.error("Order lines insert error:", linesError);
      }
    }

    // Insert order accessoires
    if (selectedAccessories.length > 0) {
      const orderAccessories = selectedAccessories.map((sa) => ({
        order_id: orderData.id,
        accessory_id: sa.accessory_id,
        quantity: sa.quantity,
        price_cents: sa.price_cents,
      }));
      const { error: accError } = await supabase.from("order_accessories").insert(orderAccessories);
      if (accError) {
        console.error("Order accessories insert error:", accError);
      }
    }

    savingRef.current = false;
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

  const stepLabels = ["Kies klant", "Kies collectie", "Collectie-inhoud", "Adres & prijs", "Levertijd", "Bevestig"];
  const factor = parseFloat(priceFactor) || 0;

  /** Rond af naar dichtstbijzijnde euro eindigend op 5 of 9 */
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

  /** Bereken verkoopprijs incl BTW = inkoop × factor, afgerond naar 5 of 9 */
  function calcRetailPrice(inkoopCents: number, f: number): number {
    return roundTo5or9(Math.round(inkoopCents * f));
  }

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
          {[1, 2, 3, 4, 5, 6].map((s) => (
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
              {s < 6 && (
                <div className={`h-0.5 w-4 ${s < step ? "bg-green-300" : "bg-border"}`} />
              )}
            </div>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">{stepLabels[step - 1]}</span>
        </div>

        {/* Klant-header met logo (zichtbaar vanaf stap 2) */}
        {selectedClient && step >= 2 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-2.5 ring-1 ring-border">
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleLogoUpload(e); setShowLogoPreview(false); }} />
            {/* Logo thumbnail — klik om te vergroten */}
            <button
              type="button"
              onClick={() => clientLogoUrl ? setShowLogoPreview(true) : logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/50 transition-colors hover:border-primary"
              title={clientLogoUrl ? "Klik om te vergroten" : "Klik om logo te uploaden"}
            >
              {uploadingLogo ? (
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              ) : clientLogoUrl ? (
                <Image src={clientLogoUrl} alt="Logo" fill className="object-cover" />
              ) : (
                <Camera size={14} className="text-muted-foreground group-hover:text-primary" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-card-foreground truncate">{selectedClient.name}</div>
              {selectedClient.client_number && (
                <div className="text-xs text-muted-foreground">{selectedClient.client_number}</div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!clientLogoUrl && (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-md px-2 py-1 text-[10px] text-primary hover:bg-primary/10 transition-colors"
                >
                  Logo uploaden
                </button>
              )}
            </div>
          </div>
        )}

        {/* Logo preview overlay */}
        {showLogoPreview && clientLogoUrl && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLogoPreview(false)} />
            <div className="relative z-10 flex flex-col items-center gap-4 rounded-2xl bg-background p-6 ring-1 ring-border shadow-xl">
              <div className="relative h-72 w-72 overflow-hidden rounded-xl border border-border">
                <Image src={clientLogoUrl} alt="Logo" fill className="object-contain" />
              </div>
              <p className="text-sm font-medium text-card-foreground">{selectedClient?.name}</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { logoInputRef.current?.click(); }}
                >
                  <Pencil size={14} /> Wijzigen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { handleLogoDelete(); setShowLogoPreview(false); }}
                  disabled={uploadingLogo}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 size={14} /> Verwijderen
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setShowLogoPreview(false)}
                className="absolute top-2 right-2 rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

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
                        setClientLogoUrl(c.logo_url);
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
                    setCollectionPriceInput(
                      c.price_cents != null && c.price_cents > 0
                        ? (c.price_cents / 100).toFixed(2)
                        : ""
                    );
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
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {loadingDetails ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Laden...</p>
            ) : (
              <>
                {/* Selectie-teller + prijsfactor */}
                {(() => {
                  const totalBundles = qualityRows.reduce((s, qr) => s + qr.bundles.length, 0);
                  const selectedCount = totalBundles - excludedBundleIds.size;
                  return (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        <span className="font-semibold text-card-foreground">{selectedCount}</span> van {totalBundles} bundels geselecteerd
                      </span>
                      {excludedBundleIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setExcludedBundleIds(new Set())}
                          className="text-primary hover:underline"
                        >
                          Alles selecteren
                        </button>
                      )}
                    </div>
                  );
                })()}

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
                    Inkoop &times; factor = verkoopprijs incl BTW
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
                              <div className="text-xs text-muted-foreground">Inkoopprijs</div>
                              <div className="text-sm font-medium text-card-foreground">
                                &euro;{qr.base_price.toFixed(2)} <span className="text-[10px] text-muted-foreground">ex BTW</span>
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

                        {/* Prijzen-knop + optionele prijstabel */}
                        {qr.dimension_prices.length > 0 && factor > 0 && (
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedPriceQualityIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(qr.quality_id)) next.delete(qr.quality_id);
                                  else next.add(qr.quality_id);
                                  return next;
                                });
                              }}
                              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                            >
                              <Eye size={12} />
                              {expandedPriceQualityIds.has(qr.quality_id) ? "Prijstabel verbergen" : "Prijstabel bekijken"}
                            </button>

                            {expandedPriceQualityIds.has(qr.quality_id) && (
                              <div className="rounded-md bg-background ring-1 ring-border overflow-hidden">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="bg-muted/50 text-muted-foreground">
                                      <th className="w-6 px-1 py-1"></th>
                                      <th className="px-2 py-1 text-left font-medium">Afmeting</th>
                                      <th className="px-2 py-1 text-right font-medium">Inkoop</th>
                                      <th className="px-2 py-1 text-right font-medium">Verkoop ex BTW</th>
                                      <th className="px-2 py-1 text-right font-medium">Verkoop incl BTW</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {qr.dimension_prices.map((dp, i) => {
                                      const dimKey = `${qr.quality_id}:${dp.dimension_name}`;
                                      const isDimExcluded = excludedDimensions.has(dimKey);
                                      const inclCents = calcRetailPrice(dp.price_cents, factor);
                                      const exCents = Math.round(inclCents / 1.21);
                                      return (
                                        <tr
                                          key={i}
                                          className={`hover:bg-muted/30 cursor-pointer ${isDimExcluded ? "opacity-35" : ""}`}
                                          onClick={() => {
                                            setExcludedDimensions((prev) => {
                                              const next = new Set(prev);
                                              if (next.has(dimKey)) next.delete(dimKey);
                                              else next.add(dimKey);
                                              return next;
                                            });
                                          }}
                                        >
                                          <td className="px-1 py-1 text-center">
                                            {isDimExcluded ? (
                                              <Square size={12} className="text-muted-foreground inline-block" />
                                            ) : (
                                              <CheckSquare size={12} className="text-primary inline-block" />
                                            )}
                                          </td>
                                          <td className={`px-2 py-1 text-card-foreground ${isDimExcluded ? "line-through" : ""}`}>{dp.dimension_name}</td>
                                          <td className="px-2 py-1 text-right text-muted-foreground">
                                            &euro;{(dp.price_cents / 100).toFixed(2)}
                                          </td>
                                          <td className="px-2 py-1 text-right text-card-foreground">
                                            &euro;{(exCents / 100).toFixed(2)}
                                          </td>
                                          <td className="px-2 py-1 text-right font-semibold text-card-foreground">
                                            &euro;{(inclCents / 100).toFixed(2)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bundels in deze kwaliteit */}
                      <div className="divide-y divide-border">
                        {qr.bundles.map((b) => {
                          const isIncluded = !excludedBundleIds.has(b.id);
                          const isExpanded = expandedBundleIds.has(b.id);
                          return (
                            <div key={b.id} className={!isIncluded ? "opacity-40" : ""}>
                              <div className="flex items-center px-4 py-2 text-xs">
                                {/* Checkbox */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExcludedBundleIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(b.id)) next.delete(b.id);
                                      else next.add(b.id);
                                      return next;
                                    });
                                  }}
                                  className="flex items-center gap-2 flex-1 min-w-0 hover:text-primary transition-colors"
                                >
                                  {isIncluded ? (
                                    <CheckSquare size={14} className="text-primary shrink-0" />
                                  ) : (
                                    <Square size={14} className="text-muted-foreground shrink-0" />
                                  )}
                                  <span className={`text-card-foreground truncate ${!isIncluded ? "line-through" : ""}`}>{b.name}</span>
                                </button>

                                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                                  <span>{b.dimension_name}</span>
                                  <span>{b.color_count} kleuren</span>
                                  {/* Expand knop */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedBundleIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(b.id)) next.delete(b.id);
                                        else next.add(b.id);
                                        return next;
                                      });
                                    }}
                                    className="rounded p-0.5 hover:bg-muted transition-colors"
                                    title="Kleuren bekijken"
                                  >
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </button>
                                </div>
                              </div>

                              {/* Kleurdetails (expanded) */}
                              {isExpanded && b.colors.length > 0 && (
                                <div className="px-4 pb-2 pl-10">
                                  <div className="flex flex-wrap gap-1.5">
                                    {b.colors.map((c, i) => (
                                      <div
                                        key={i}
                                        className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-[10px]"
                                        title={`${c.code} — ${c.name}`}
                                      >
                                        {c.hex_color && (
                                          <span
                                            className="inline-block h-3 w-3 rounded-sm border border-border shrink-0"
                                            style={{ backgroundColor: c.hex_color }}
                                          />
                                        )}
                                        <span className="text-muted-foreground">{c.code}</span>
                                        <span className="text-card-foreground">{c.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {qualityRows.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Geen producten in deze collectie
                    </p>
                  )}
                </div>

                {/* Roede & Display — altijd zichtbaar */}
                {(() => {
                  const mainAccessories = accessories.filter((a) => a.type === "roede" || a.type === "display");
                  const otherAccessories = accessories.filter((a) => a.type !== "roede" && a.type !== "display");

                  function renderAccessoryRow(acc: AccessoryOption) {
                    const selected = selectedAccessories.find((sa) => sa.accessory_id === acc.id);
                    const isActive = !!selected;
                    return (
                      <div key={acc.id} className="px-4 py-2.5 space-y-2">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (isActive) {
                                setSelectedAccessories((prev) => prev.filter((sa) => sa.accessory_id !== acc.id));
                              } else {
                                setSelectedAccessories((prev) => [
                                  ...prev,
                                  { accessory_id: acc.id, quantity: 1, price_cents: acc.default_price_cents },
                                ]);
                              }
                            }}
                            className="flex items-center gap-2 flex-1 min-w-0 text-xs hover:text-primary transition-colors"
                          >
                            {isActive ? (
                              <CheckSquare size={14} className="text-primary shrink-0" />
                            ) : (
                              <Square size={14} className="text-muted-foreground shrink-0" />
                            )}
                            <span className={`font-medium ${isActive ? "text-card-foreground" : "text-muted-foreground"}`}>
                              {acc.name}
                            </span>
                          </button>
                          <span className="text-xs text-muted-foreground">
                            &euro;{(acc.default_price_cents / 100).toFixed(2)} ex BTW
                          </span>
                        </div>
                        {isActive && selected && (
                          <div className="flex items-center gap-3 pl-6">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[10px] text-muted-foreground">Aantal:</label>
                              <Input
                                type="number"
                                min="1"
                                value={selected.quantity}
                                onChange={(e) => {
                                  const qty = Math.max(1, parseInt(e.target.value) || 1);
                                  setSelectedAccessories((prev) =>
                                    prev.map((sa) => sa.accessory_id === acc.id ? { ...sa, quantity: qty } : sa)
                                  );
                                }}
                                className="w-16 h-7 text-xs text-center"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <label className="text-[10px] text-muted-foreground">Prijs/st (€):</label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={(selected.price_cents / 100).toFixed(2)}
                                onChange={(e) => {
                                  const cents = Math.round(parseFloat(e.target.value || "0") * 100);
                                  setSelectedAccessories((prev) =>
                                    prev.map((sa) => sa.accessory_id === acc.id ? { ...sa, price_cents: cents } : sa)
                                  );
                                }}
                                className="w-24 h-7 text-xs text-center"
                              />
                            </div>
                            <span className="text-xs font-medium text-card-foreground ml-auto">
                              &euro;{((selected.quantity * selected.price_cents) / 100).toFixed(2)} ex BTW
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* Roede & Display */}
                      {mainAccessories.length > 0 && (
                        <div className="rounded-lg ring-1 ring-border overflow-hidden">
                          <div className="bg-muted/30 px-4 py-2">
                            <div className="text-sm font-semibold text-card-foreground">Roede & Display</div>
                          </div>
                          <div className="divide-y divide-border">
                            {mainAccessories.map(renderAccessoryRow)}
                          </div>
                        </div>
                      )}

                      {/* Overige accessoires — uitklapbaar */}
                      {otherAccessories.length > 0 && (
                        <div className="rounded-lg ring-1 ring-border overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setShowAccessories((v) => !v)}
                            className="w-full flex items-center justify-between bg-muted/30 px-4 py-2.5 hover:bg-muted/50 transition-colors"
                          >
                            <div className="text-left">
                              <div className="text-sm font-semibold text-card-foreground">
                                Overige accessoires
                                {(() => {
                                  const otherSelected = selectedAccessories.filter(
                                    (sa) => otherAccessories.some((a) => a.id === sa.accessory_id)
                                  ).length;
                                  return otherSelected > 0 ? (
                                    <span className="ml-2 text-xs font-normal text-primary">{otherSelected} geselecteerd</span>
                                  ) : null;
                                })()}
                              </div>
                              <div className="text-xs text-muted-foreground">Anti-slip, plush, toeslag, etc.</div>
                            </div>
                            {showAccessories ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                          </button>
                          {showAccessories && (
                            <div className="divide-y divide-border max-h-48 overflow-y-auto">
                              {otherAccessories.map(renderAccessoryRow)}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Step 4: Adres & collectieprijs */}
        {step === 4 && (
          <div className="space-y-4">
            {/* Address selection */}
            <div>
              <h3 className="text-sm font-semibold text-card-foreground mb-2">Verzendadres</h3>
              {clientAddresses.length > 0 ? (
                <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                  {clientAddresses.map((addr) => (
                    <button
                      key={addr.id}
                      onClick={() => {
                        setSelectedAddressId(addr.id);
                        setShippingStreet(addr.street ?? "");
                        setShippingPostalCode(addr.postal_code ?? "");
                        setShippingCity(addr.city ?? "");
                        setShippingCountry(addr.country ?? "Nederland");
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                        selectedAddressId === addr.id ? "bg-primary/10 ring-1 ring-primary/30" : ""
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-card-foreground">{addr.label}</span>
                          {addr.is_primary && (
                            <span className="inline-flex items-center rounded-md bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
                              Standaard
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[addr.street, addr.postal_code, addr.city].filter(Boolean).join(", ") || "Geen adres"}
                        </p>
                      </div>
                      {selectedAddressId === addr.id && <Check size={16} className="text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-3">
                  Geen adressen gevonden. Vul hieronder een verzendadres in, of voeg adressen toe via Klanten → Adressen.
                </p>
              )}

              {/* Editable address fields */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Straat + huisnr.</label>
                  <Input value={shippingStreet} onChange={(e) => setShippingStreet(e.target.value)} placeholder="Kerkstraat 1" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Postcode</label>
                  <Input value={shippingPostalCode} onChange={(e) => setShippingPostalCode(e.target.value)} placeholder="1234 AB" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Plaats</label>
                  <Input value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} placeholder="Amsterdam" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Land</label>
                  <Input value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)} placeholder="Nederland" />
                </div>
              </div>
            </div>

            {/* Collection price */}
            <div>
              <h3 className="text-sm font-semibold text-card-foreground mb-2">Collectieprijs</h3>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Prijs (€ ex BTW)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={collectionPriceInput}
                  onChange={(e) => setCollectionPriceInput(e.target.value)}
                  placeholder="0.00"
                  className="max-w-[160px]"
                />
                {selectedCollection && selectedCollection.price_cents != null && selectedCollection.price_cents > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Standaardprijs: €{(selectedCollection.price_cents / 100).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Levertijd */}
        {step === 5 && (
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

        {/* Step 6: Preview & Bevestig */}
        {step === 6 && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {/* Overzicht */}
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
                <span className="text-muted-foreground">Verzendadres</span>
                <span className="font-medium text-card-foreground text-right max-w-[60%]">
                  {[shippingStreet, shippingPostalCode, shippingCity, shippingCountry]
                    .filter(Boolean)
                    .join(", ") || "Niet ingevuld"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Levertijd</span>
                <span className="font-medium text-card-foreground">
                  {weekOptions.find((o) => o.value === deliveryDate)?.label ?? deliveryDate}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prijsfactor</span>
                <span className="font-medium text-card-foreground">&times;{factor}</span>
              </div>
              {parseFloat(collectionPriceInput || "0") > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Collectieprijs</span>
                  <span className="font-medium text-card-foreground">€{parseFloat(collectionPriceInput).toFixed(2)} ex BTW</span>
                </div>
              )}
              {notes.trim() && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Opmerkingen</span>
                  <span className="font-medium text-card-foreground text-right max-w-[60%]">{notes}</span>
                </div>
              )}
            </div>

            {/* Bundels per kwaliteit */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bundels in order</h4>
              {qualityRows.map((qr) => {
                const includedBundles = qr.bundles.filter((b) => !excludedBundleIds.has(b.id));
                if (includedBundles.length === 0) return null;
                return (
                  <div key={qr.quality_id} className="rounded-lg ring-1 ring-border overflow-hidden">
                    <div className="bg-muted/30 px-3 py-2 flex items-center justify-between">
                      <div className="text-xs">
                        <span className="font-semibold text-card-foreground">{qr.quality_name}</span>
                        <span className="text-muted-foreground ml-1.5">({qr.quality_code})</span>
                      </div>
                      {qr.base_price != null && factor > 0 && (
                        <span className="text-xs text-muted-foreground">
                          €{(qr.base_price * factor / 1.21).toFixed(2)} ex BTW / €{(qr.base_price * factor).toFixed(2)} incl
                        </span>
                      )}
                    </div>
                    <div className="divide-y divide-border">
                      {includedBundles.map((b) => (
                        <div key={b.id} className="px-3 py-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-card-foreground">{b.name}</span>
                            <span className="text-muted-foreground">{b.dimension_name} · {b.color_count} kleuren</span>
                          </div>
                          {b.colors.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {b.colors.map((c, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  {c.hex_color && (
                                    <span className="inline-block h-2 w-2 rounded-sm border border-border" style={{ backgroundColor: c.hex_color }} />
                                  )}
                                  {c.code}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Accessoires */}
            {selectedAccessories.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Accessoires</h4>
                <div className="rounded-lg ring-1 ring-border divide-y divide-border">
                  {selectedAccessories.map((sa) => {
                    const acc = accessories.find((a) => a.id === sa.accessory_id);
                    return (
                      <div key={sa.accessory_id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="font-medium text-card-foreground">{sa.quantity}&times; {acc?.name ?? "?"}</span>
                        <span className="text-muted-foreground">€{((sa.quantity * sa.price_cents) / 100).toFixed(2)} ex BTW</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Kostenoverzicht */}
            {(() => {
              const collectionPrice = parseFloat(collectionPriceInput || "0");
              const accessoiresTotaal = selectedAccessories.reduce(
                (sum, sa) => sum + (sa.quantity * sa.price_cents) / 100, 0
              );
              const totalExBtw = collectionPrice + accessoiresTotaal;
              const totalInclBtw = totalExBtw * 1.21;
              const btwBedrag = totalExBtw * 0.21;

              return (
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kostenoverzicht</h4>
                  <div className="rounded-lg ring-1 ring-border overflow-hidden text-xs">
                    <div className="divide-y divide-border">
                      {collectionPrice > 0 && (
                        <div className="flex items-center justify-between px-4 py-2">
                          <span className="text-card-foreground">Collectie ({selectedCollection?.name})</span>
                          <span className="text-card-foreground">&euro;{collectionPrice.toFixed(2)}</span>
                        </div>
                      )}
                      {selectedAccessories.map((sa) => {
                        const acc = accessories.find((a) => a.id === sa.accessory_id);
                        return (
                          <div key={sa.accessory_id} className="flex items-center justify-between px-4 py-2">
                            <span className="text-card-foreground">{sa.quantity}&times; {acc?.name ?? "?"}</span>
                            <span className="text-card-foreground">&euro;{((sa.quantity * sa.price_cents) / 100).toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                    {totalExBtw > 0 && (
                      <div className="bg-muted/30 divide-y divide-border">
                        <div className="flex items-center justify-between px-4 py-2">
                          <span className="text-muted-foreground">Subtotaal ex BTW</span>
                          <span className="font-medium text-card-foreground">&euro;{totalExBtw.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2">
                          <span className="text-muted-foreground">BTW 21%</span>
                          <span className="text-card-foreground">&euro;{btwBedrag.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <span className="font-semibold text-card-foreground">Totaal incl BTW</span>
                          <span className="font-bold text-card-foreground text-sm">&euro;{totalInclBtw.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                    {totalExBtw === 0 && (
                      <div className="px-4 py-3 text-center text-muted-foreground">
                        Geen prijzen ingevuld
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

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
                onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4 | 5 | 6)}
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
              <Button size="sm" onClick={() => setStep(5)}>
                Volgende <ArrowRight size={14} />
              </Button>
            )}
            {step === 5 && (
              <Button
                size="sm"
                onClick={() => setStep(6)}
                disabled={!deliveryDate}
              >
                Volgende <ArrowRight size={14} />
              </Button>
            )}
            {step === 6 && (
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
