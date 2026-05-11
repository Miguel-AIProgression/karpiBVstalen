"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Minus,
  Camera,
  Loader2,
} from "lucide-react";
import Image from "next/image";

/* ─── Types ──────────────────────────────────────────── */

interface ClientOption {
  id: string;
  name: string;
  client_number: string | null;
  logo_url: string | null;
  price_list_nr: string | null;
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

interface SampleArticle {
  id: string;
  article_number: string;
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  quality_name: string;
  quality_code: string;
  color_code: string;
  color_name: string;
  hex_color: string | null;
  dimension_name: string;
}

interface BundleOption {
  id: string;
  name: string;
  quality_name: string;
  quality_code: string;
  dimension_name: string;
  colors: { code: string; name: string; hex_color: string | null }[];
  total_stock: number;
}

interface CollectionOption {
  id: string;
  name: string;
  bundle_ids: string[];
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

function mondayOfWeek(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

function generateWeekOptions(count: number): { label: string; value: string; week: number; year: number }[] {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() + 3 * 7);
  const options: { label: string; value: string; week: number; year: number }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    const w = getISOWeek(d);
    const y = getISOWeekYear(d);
    const dateStr = mondayOfWeek(y, w);
    if (options.length > 0 && options[options.length - 1].week === w && options[options.length - 1].year === y) continue;
    options.push({ label: `Week ${w} (${y})`, value: dateStr, week: w, year: y });
  }
  return options;
}

/* ─── Component ──────────────────────────────────────── */

export function OrderCreateModal({ open, onOpenChange, onCreated }: OrderCreateModalProps) {
  const supabase = createClient();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const stepLabels = ["Klant", "Adres & week", "Artikelen", "Bevestig"];

  // Step 1: Klant
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  // Step 2: Adres + leverweek
  const [clientAddresses, setClientAddresses] = useState<AddressOption[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [shippingStreet, setShippingStreet] = useState("");
  const [shippingPostalCode, setShippingPostalCode] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingCountry, setShippingCountry] = useState("Nederland");
  const [saveAddressForClient, setSaveAddressForClient] = useState(false);
  const weekOptions = generateWeekOptions(26);
  const [deliveryDate, setDeliveryDate] = useState(weekOptions[0]?.value ?? "");

  // Step 3: Artikelen
  const [articleTab, setArticleTab] = useState<"staaltjes" | "bundels" | "collecties">("staaltjes");
  const [samples, setSamples] = useState<SampleArticle[]>([]);
  const [articleSearch, setArticleSearch] = useState("");
  const [filterQualityId, setFilterQualityId] = useState("");
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [bundles, setBundles] = useState<BundleOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [bundleQuantities, setBundleQuantities] = useState<Map<string, number>>(new Map());
  const [bundleSearch, setBundleSearch] = useState("");

  // Step 4: Sticker-opties
  const [makeStickers, setMakeStickers] = useState(true);
  const [stickerNameType, setStickerNameType] = useState<"karpi" | "client">("karpi");
  const [showPricesOnSticker, setShowPricesOnSticker] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Logo (mini client logo upload, optional)
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  /* ─── Loaders ─── */

  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from("clients")
      .select("id, name, client_number, logo_url, price_list_nr")
      .eq("active", true)
      .order("name");
    setClients((data as ClientOption[]) ?? []);
  }, [supabase]);

  const loadAddresses = useCallback(async (clientId: string) => {
    const { data } = await supabase
      .from("client_addresses")
      .select("id, label, street, postal_code, city, country, is_primary")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("label");
    const addresses = (data as AddressOption[]) ?? [];
    setClientAddresses(addresses);
    const primary = addresses.find((a) => a.is_primary) ?? addresses[0];
    if (primary) {
      setSelectedAddressId(primary.id);
      setShippingStreet(primary.street ?? "");
      setShippingPostalCode(primary.postal_code ?? "");
      setShippingCity(primary.city ?? "");
      setShippingCountry(primary.country ?? "Nederland");
    } else {
      // Geen opgeslagen adres — haal adres uit meest recente order van deze klant
      setSelectedAddressId(null);
      const { data: lastOrder } = await supabase
        .from("orders")
        .select("shipping_street, shipping_postal_code, shipping_city, shipping_country")
        .eq("client_id", clientId)
        .not("shipping_street", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (lastOrder) {
        setShippingStreet(lastOrder.shipping_street ?? "");
        setShippingPostalCode(lastOrder.shipping_postal_code ?? "");
        setShippingCity(lastOrder.shipping_city ?? "");
        setShippingCountry(lastOrder.shipping_country ?? "Nederland");
        setSaveAddressForClient(true);
      } else {
        setShippingStreet("");
        setShippingPostalCode("");
        setShippingCity("");
        setShippingCountry("Nederland");
        setSaveAddressForClient(false);
        setReference("");
      }
    }
  }, [supabase]);

  const loadSamples = useCallback(async () => {
    setLoadingArticles(true);
    const { data } = await supabase
      .from("samples")
      .select("id, article_number, quality_id, color_code_id, dimension_id, qualities(name, code), color_codes(code, name, hex_color), sample_dimensions(name)")
      .eq("active", true)
      .order("article_number");
    const mapped: SampleArticle[] = ((data ?? []) as Array<{
      id: string;
      article_number: string;
      quality_id: string;
      color_code_id: string;
      dimension_id: string;
      qualities: { name: string; code: string } | null;
      color_codes: { code: string; name: string; hex_color: string | null } | null;
      sample_dimensions: { name: string } | null;
    }>).map((s) => ({
      id: s.id,
      article_number: s.article_number,
      quality_id: s.quality_id,
      color_code_id: s.color_code_id,
      dimension_id: s.dimension_id,
      quality_name: s.qualities?.name ?? "",
      quality_code: s.qualities?.code ?? "",
      color_code: s.color_codes?.code ?? "",
      color_name: s.color_codes?.name ?? "",
      hex_color: s.color_codes?.hex_color ?? null,
      dimension_name: s.sample_dimensions?.name ?? "",
    }));
    setSamples(mapped);
    setLoadingArticles(false);
  }, [supabase]);

  const loadBundlesAndCollections = useCallback(async () => {
    const [{ data: bundleData }, { data: stockData }, { data: collData }] = await Promise.all([
      supabase
        .from("bundles")
        .select("id, name, qualities(name, code), sample_dimensions(name), bundle_colors(color_codes(code, name, hex_color))")
        .eq("active", true)
        .order("name"),
      supabase.from("bundle_stock").select("bundle_id, quantity") as any,
      supabase
        .from("collections")
        .select("id, name, collection_bundles(bundle_id)")
        .eq("active", true)
        .order("name"),
    ]);

    const stockMap = new Map<string, number>();
    for (const s of (stockData ?? []) as any[]) {
      stockMap.set(s.bundle_id, (stockMap.get(s.bundle_id) ?? 0) + s.quantity);
    }

    setBundles(
      (bundleData ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
        quality_name: b.qualities?.name ?? "",
        quality_code: b.qualities?.code ?? "",
        dimension_name: b.sample_dimensions?.name ?? "",
        colors: (b.bundle_colors ?? []).map((bc: any) => bc.color_codes).filter(Boolean),
        total_stock: stockMap.get(b.id) ?? 0,
      }))
    );

    setCollections(
      (collData ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        bundle_ids: (c.collection_bundles ?? []).map((cb: any) => cb.bundle_id),
      }))
    );
  }, [supabase]);

  /* ─── Reset state on open ─── */

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelectedClient(null);
    setClientSearch("");
    setShowNewClient(false);
    setNewClientName("");
    setQuantities(new Map());
    setBundleQuantities(new Map());
    setArticleSearch("");
    setBundleSearch("");
    setFilterQualityId("");
    setArticleTab("staaltjes");
    setMakeStickers(true);
    setStickerNameType("karpi");
    setShowPricesOnSticker(true);
    setNotes("");
    setError("");
    setClientLogoUrl(null);
    setSaveAddressForClient(false);
    loadClients();
  }, [open, loadClients]);

  /* ─── Effects on client select ─── */

  useEffect(() => {
    if (selectedClient) {
      setClientLogoUrl(selectedClient.logo_url);
      loadAddresses(selectedClient.id);
    }
  }, [selectedClient, loadAddresses]);

  useEffect(() => {
    if (step === 3) {
      if (samples.length === 0) loadSamples();
      if (bundles.length === 0) loadBundlesAndCollections();
    }
  }, [step, samples.length, bundles.length, loadSamples, loadBundlesAndCollections]);

  /* ─── Handlers ─── */

  async function createClientHandler() {
    if (!newClientName.trim()) return;
    setSavingClient(true);
    const { data, error: err } = await supabase
      .from("clients")
      .insert({ name: newClientName.trim(), client_type: "retailer", active: true })
      .select("id, name, client_number, logo_url, price_list_nr")
      .single();
    setSavingClient(false);
    if (err || !data) {
      setError(err?.message ?? "Klant aanmaken mislukt");
      return;
    }
    const newClient = data as ClientOption;
    setClients((prev) => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedClient(newClient);
    setShowNewClient(false);
    setNewClientName("");
  }

  function pickAddress(addrId: string) {
    setSelectedAddressId(addrId);
    const addr = clientAddresses.find((a) => a.id === addrId);
    if (addr) {
      setShippingStreet(addr.street ?? "");
      setShippingPostalCode(addr.postal_code ?? "");
      setShippingCity(addr.city ?? "");
      setShippingCountry(addr.country ?? "Nederland");
    }
  }

  function setQty(sampleId: string, qty: number) {
    const next = new Map(quantities);
    if (qty <= 0) next.delete(sampleId);
    else next.set(sampleId, qty);
    setQuantities(next);
  }

  function setBundleQty(bundleId: string, qty: number) {
    const next = new Map(bundleQuantities);
    if (qty <= 0) next.delete(bundleId);
    else next.set(bundleId, qty);
    setBundleQuantities(next);
  }

  function applyCollection(col: CollectionOption) {
    const next = new Map(bundleQuantities);
    for (const bid of col.bundle_ids) {
      next.set(bid, (next.get(bid) ?? 0) + 1);
    }
    setBundleQuantities(next);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedClient || !e.target.files?.[0]) return;
    setUploadingLogo(true);
    const file = e.target.files[0];
    const ext = file.name.split(".").pop();
    const path = `clients/${selectedClient.id}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("client-logos")
      .upload(path, file, { upsert: true });
    if (!uploadErr) {
      const { data } = supabase.storage.from("client-logos").getPublicUrl(path);
      const url = data.publicUrl + `?t=${Date.now()}`;
      await supabase.from("clients").update({ logo_url: url }).eq("id", selectedClient.id);
      setClientLogoUrl(url);
      setSelectedClient({ ...selectedClient, logo_url: url });
    }
    setUploadingLogo(false);
  }

  async function handleCreateOrder() {
    if (!selectedClient) return;
    if (quantities.size === 0 && bundleQuantities.size === 0) {
      setError("Voeg minimaal 1 artikel of bundel toe.");
      return;
    }
    setSaving(true);
    setError("");

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        client_id: selectedClient.id,
        delivery_date: deliveryDate,
        status: "picking_ready",
        notes: notes || null,
        reference: reference || null,
        created_by: user?.id ?? null,
        shipping_street: shippingStreet || null,
        shipping_postal_code: shippingPostalCode || null,
        shipping_city: shippingCity || null,
        shipping_country: shippingCountry || null,
        sticker_name_type: stickerNameType,
        show_prices_on_sticker: showPricesOnSticker,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      setError(orderErr?.message ?? "Order aanmaken mislukt");
      setSaving(false);
      return;
    }

    // Losse staalregels (geen bundel-context)
    const lines: { order_id: string; sample_id: string; bundle_id?: string; quantity: number }[] = Array.from(quantities.entries()).map(([sample_id, qty]) => ({
      order_id: order.id,
      sample_id,
      quantity: qty,
    }));

    // Bundels uitklappen naar sample_id regels — bundle_id meeslagen voor groepering in detailpagina
    if (bundleQuantities.size > 0) {
      const bundleIds = Array.from(bundleQuantities.keys());
      const { data: bundleData } = await supabase
        .from("bundles")
        .select("id, quality_id, dimension_id, bundle_colors(color_code_id), bundle_items(sample_id)")
        .in("id", bundleIds);

      for (const bundle of (bundleData ?? []) as any[]) {
        const qty = bundleQuantities.get(bundle.id) ?? 1;
        const hasItems = bundle.bundle_items?.length > 0;

        if (hasItems) {
          for (const bi of bundle.bundle_items) {
            if (bi.sample_id) lines.push({ order_id: order.id, sample_id: bi.sample_id, bundle_id: bundle.id, quantity: qty });
          }
        } else if (bundle.bundle_colors?.length > 0) {
          const colorIds = bundle.bundle_colors.map((bc: any) => bc.color_code_id);
          const { data: matchedSamples } = await supabase
            .from("samples")
            .select("id")
            .eq("quality_id", bundle.quality_id)
            .eq("dimension_id", bundle.dimension_id)
            .in("color_code_id", colorIds);
          for (const s of (matchedSamples ?? [])) {
            lines.push({ order_id: order.id, sample_id: s.id, bundle_id: bundle.id, quantity: qty });
          }
        }
      }
    }

    const { error: linesErr } = await supabase.from("order_lines").insert(lines);
    if (linesErr) {
      setError(linesErr.message);
      setSaving(false);
      return;
    }

    if (saveAddressForClient && selectedClient && (shippingStreet || shippingCity)) {
      await supabase.from("client_addresses").insert({
        client_id: selectedClient.id,
        label: "Standaard",
        street: shippingStreet || null,
        postal_code: shippingPostalCode || null,
        city: shippingCity || null,
        country: shippingCountry || null,
        is_primary: true,
      });
    }

    setSaving(false);
    onCreated();
    onOpenChange(false);
  }

  /* ─── Computed ─── */

  const filteredClients = clients.filter((c) => {
    if (!clientSearch) return true;
    const q = clientSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.client_number ?? "").toLowerCase().includes(q);
  });

  const qualityOptions = Array.from(
    new Map(samples.map((s) => [s.quality_id, { id: s.quality_id, name: s.quality_name, code: s.quality_code }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filteredSamples = samples.filter((s) => {
    if (filterQualityId && s.quality_id !== filterQualityId) return false;
    if (!articleSearch) return true;
    const q = articleSearch.toLowerCase();
    return (
      s.article_number.toLowerCase().includes(q) ||
      s.quality_name.toLowerCase().includes(q) ||
      s.color_name.toLowerCase().includes(q) ||
      s.color_code.toLowerCase().includes(q)
    );
  });

  const totalSamples = Array.from(quantities.values()).reduce((s, q) => s + q, 0);
  const totalBundles = Array.from(bundleQuantities.values()).reduce((s, q) => s + q, 0);

  const filteredBundles = bundles.filter((b) => {
    if (!bundleSearch) return true;
    const q = bundleSearch.toLowerCase();
    return b.name.toLowerCase().includes(q) || b.quality_name.toLowerCase().includes(q);
  });

  const filteredCollections = collections.filter((c) => {
    if (!bundleSearch) return true;
    return c.name.toLowerCase().includes(bundleSearch.toLowerCase());
  });

  /* ─── Render ─── */

  if (!open) return null;

  const canNext1 = !!selectedClient;
  const canNext2 = !!deliveryDate && (!!selectedAddressId || (shippingStreet || shippingCity).length > 0);
  const canNext3 = quantities.size > 0 || bundleQuantities.size > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-background shadow-xl ring-1 ring-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Nieuwe order</h2>
            <p className="text-xs text-muted-foreground">{stepLabels[step - 1]}</p>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 border-b border-border px-6 py-3">
          {[1, 2, 3, 4].map((s) => (
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
              {s < 4 && <div className={`h-0.5 w-8 ${s < step ? "bg-green-300" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Klant-header (vanaf stap 2) */}
        {selectedClient && step >= 2 && (
          <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-2.5 ring-1 ring-border">
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/50 hover:border-primary"
              title={clientLogoUrl ? "Logo wijzigen" : "Logo uploaden"}
            >
              {uploadingLogo ? (
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              ) : clientLogoUrl ? (
                <Image src={clientLogoUrl} alt="Logo" fill className="object-cover" />
              ) : (
                <Camera size={14} className="text-muted-foreground" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-semibold text-card-foreground">{selectedClient.name}</div>
              {selectedClient.price_list_nr && (
                <div className="text-xs text-muted-foreground">Prijslijst {selectedClient.price_list_nr}</div>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* STEP 1 — Klant */}
          {step === 1 && (
            <div className="space-y-3">
              {showNewClient ? (
                <div className="rounded-xl bg-card p-4 ring-1 ring-border space-y-3">
                  <h3 className="text-sm font-medium">Nieuwe klant</h3>
                  <Input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Naam"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowNewClient(false)}>
                      Annuleren
                    </Button>
                    <Button size="sm" onClick={createClientHandler} disabled={!newClientName.trim() || savingClient}>
                      {savingClient ? "Opslaan..." : "Aanmaken"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
                    <Input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Zoek klant..."
                      className="pl-8"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-[300px] overflow-y-auto rounded-xl ring-1 ring-border">
                    {filteredClients.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground">Geen klanten gevonden.</p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {filteredClients.map((c) => (
                          <li key={c.id}>
                            <button
                              onClick={() => setSelectedClient(c)}
                              className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50 ${
                                selectedClient?.id === c.id ? "bg-primary/5" : ""
                              }`}
                            >
                              <span>
                                <span className="font-medium text-card-foreground">{c.name}</span>
                                {c.client_number && (
                                  <span className="ml-2 font-mono text-xs text-muted-foreground">{c.client_number}</span>
                                )}
                              </span>
                              {c.price_list_nr && (
                                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
                                  {c.price_list_nr}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowNewClient(true)}>
                    <Plus size={14} /> Nieuwe klant aanmaken
                  </Button>
                </>
              )}
            </div>
          )}

          {/* STEP 2 — Adres + week */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="mb-2 text-sm font-medium">Leveradres</h3>
                {clientAddresses.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {clientAddresses.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => pickAddress(a.id)}
                        className={`rounded-md px-3 py-1.5 text-xs ring-1 ${
                          selectedAddressId === a.id
                            ? "bg-primary text-primary-foreground ring-primary"
                            : "bg-card text-card-foreground ring-border hover:bg-muted"
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input value={shippingStreet} onChange={(e) => setShippingStreet(e.target.value)} placeholder="Straat" />
                  <Input value={shippingPostalCode} onChange={(e) => setShippingPostalCode(e.target.value)} placeholder="Postcode" />
                  <Input value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} placeholder="Stad" />
                  <Input value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)} placeholder="Land" />
                </div>
                {clientAddresses.length === 0 && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAddressForClient}
                      onChange={(e) => setSaveAddressForClient(e.target.checked)}
                      className="rounded"
                    />
                    Adres opslaan voor {selectedClient?.name ?? "deze klant"}
                  </label>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Referentie <span className="font-normal text-muted-foreground">(optioneel)</span></h3>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Bijv. PO-12345 of inkoopordernummer"
                />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Leverweek</h3>
                <select
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {weekOptions.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* STEP 3 — Artikelen */}
          {step === 3 && (
            <div className="space-y-3">
              {/* Sub-tabs */}
              <div className="flex gap-1 border-b border-border">
                {([
                  { key: "staaltjes", label: "Staaltjes", count: quantities.size },
                  { key: "bundels", label: "Bundels", count: bundleQuantities.size },
                  { key: "collecties", label: "Collecties", count: 0 },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setArticleTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      articleTab === tab.key
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground leading-none">
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* TAB: Staaltjes */}
              {articleTab === "staaltjes" && (
                <>
                  <div className="flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
                      <Input
                        value={articleSearch}
                        onChange={(e) => setArticleSearch(e.target.value)}
                        placeholder="Zoek artikel..."
                        className="pl-8"
                      />
                    </div>
                    <select
                      value={filterQualityId}
                      onChange={(e) => setFilterQualityId(e.target.value)}
                      className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Alle kwaliteiten</option>
                      {qualityOptions.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.code} — {q.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {loadingArticles ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Laden...</p>
                  ) : (
                    <div className="overflow-hidden rounded-xl ring-1 ring-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Artikel</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Afm.</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Aantal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSamples.slice(0, 200).map((s) => {
                            const qty = quantities.get(s.id) ?? 0;
                            return (
                              <tr key={s.id} className="border-b border-border/50">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="h-5 w-5 shrink-0 rounded" style={{ backgroundColor: s.hex_color || "#e5e7eb" }} />
                                    <div className="min-w-0">
                                      <div className="font-mono text-[10px] text-muted-foreground">{s.article_number}</div>
                                      <div className="truncate text-card-foreground">
                                        {s.quality_name} <span className="text-muted-foreground">{s.color_code}</span>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{s.dimension_name}</td>
                                <td className="px-3 py-2 text-right">
                                  <div className="ml-auto flex items-center justify-end gap-1">
                                    <button onClick={() => setQty(s.id, qty - 1)} disabled={qty === 0} className="rounded border border-border p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><Minus size={12} /></button>
                                    <input type="number" min={0} value={qty} onChange={(e) => setQty(s.id, parseInt(e.target.value || "0", 10))} className="w-12 rounded border border-border bg-transparent px-1 py-0.5 text-center text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                                    <button onClick={() => setQty(s.id, qty + 1)} className="rounded border border-border p-1 text-muted-foreground hover:bg-muted"><Plus size={12} /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {filteredSamples.length > 200 && (
                    <p className="text-xs text-muted-foreground">Eerste 200 van {filteredSamples.length} resultaten getoond.</p>
                  )}
                </>
              )}

              {/* TAB: Bundels */}
              {articleTab === "bundels" && (
                <>
                  <div className="relative">
                    <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
                    <Input value={bundleSearch} onChange={(e) => setBundleSearch(e.target.value)} placeholder="Zoek bundel..." className="pl-8" />
                  </div>
                  <div className="overflow-hidden rounded-xl ring-1 ring-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bundel</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Afm.</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Aantal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBundles.map((b) => {
                          const qty = bundleQuantities.get(b.id) ?? 0;
                          return (
                            <tr key={b.id} className="border-b border-border/50">
                              <td className="px-3 py-2">
                                <div className="font-medium text-card-foreground">{b.name}</div>
                                <div className="text-xs text-muted-foreground">{b.quality_name} • {b.colors.length} kleur{b.colors.length === 1 ? "" : "en"}</div>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{b.dimension_name}</td>
                              <td className="px-3 py-2 text-right">
                                <div className="ml-auto flex items-center justify-end gap-1">
                                  <button onClick={() => setBundleQty(b.id, qty - 1)} disabled={qty === 0} className="rounded border border-border p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><Minus size={12} /></button>
                                  <input type="number" min={0} value={qty} onChange={(e) => setBundleQty(b.id, parseInt(e.target.value || "0", 10))} className="w-12 rounded border border-border bg-transparent px-1 py-0.5 text-center text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                                  <button onClick={() => setBundleQty(b.id, qty + 1)} className="rounded border border-border p-1 text-muted-foreground hover:bg-muted"><Plus size={12} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredBundles.length === 0 && (
                          <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">Geen bundels gevonden.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* TAB: Collecties */}
              {articleTab === "collecties" && (
                <>
                  <div className="relative">
                    <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
                    <Input value={bundleSearch} onChange={(e) => setBundleSearch(e.target.value)} placeholder="Zoek collectie..." className="pl-8" />
                  </div>
                  <div className="overflow-hidden rounded-xl ring-1 ring-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Collectie</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Bundels</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCollections.map((c) => (
                          <tr key={c.id} className="border-b border-border/50">
                            <td className="px-3 py-2">
                              <div className="font-medium text-card-foreground">{c.name}</div>
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{c.bundle_ids.length}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => applyCollection(c)}
                                className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                              >
                                + Toevoegen
                              </button>
                            </td>
                          </tr>
                        ))}
                        {filteredCollections.length === 0 && (
                          <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">Geen collecties gevonden.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">Klik op &quot;+ Toevoegen&quot; om alle bundels van een collectie toe te voegen. Pas daarna de aantallen aan via het tabje Bundels.</p>
                </>
              )}

              {/* Winkelwagen */}
              <div className="rounded-xl ring-1 ring-border overflow-hidden">
                <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>Selectie</span>
                  <span>
                    {quantities.size + bundleQuantities.size === 0
                      ? "Leeg"
                      : `${quantities.size + bundleQuantities.size} item${quantities.size + bundleQuantities.size === 1 ? "" : "s"}`}
                  </span>
                </div>
                {quantities.size === 0 && bundleQuantities.size === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">Nog niets geselecteerd. Kies staaltjes, bundels of een collectie hierboven.</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto divide-y divide-border/50">
                    {Array.from(bundleQuantities.entries()).map(([id, qty]) => {
                      const bundle = bundles.find((b) => b.id === id);
                      if (!bundle) return null;
                      return (
                        <div key={id} className="flex items-center gap-3 px-4 py-2 text-sm">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-card-foreground">{bundle.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{bundle.dimension_name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setBundleQty(id, qty - 1)} className="rounded border border-border p-0.5 text-muted-foreground hover:bg-muted"><Minus size={10} /></button>
                            <span className="w-8 text-center text-sm">{qty}</span>
                            <button onClick={() => setBundleQty(id, qty + 1)} className="rounded border border-border p-0.5 text-muted-foreground hover:bg-muted"><Plus size={10} /></button>
                            <button onClick={() => setBundleQty(id, 0)} className="ml-1 text-muted-foreground hover:text-red-500"><X size={14} /></button>
                          </div>
                        </div>
                      );
                    })}
                    {Array.from(quantities.entries()).map(([id, qty]) => {
                      const sample = samples.find((s) => s.id === id);
                      if (!sample) return null;
                      return (
                        <div key={id} className="flex items-center gap-3 px-4 py-2 text-sm">
                          <div className="h-4 w-4 shrink-0 rounded" style={{ backgroundColor: sample.hex_color || "#e5e7eb" }} />
                          <div className="flex-1 min-w-0 truncate">
                            <span className="font-medium text-card-foreground">{sample.quality_name}</span>
                            <span className="ml-1 text-xs text-muted-foreground">{sample.color_code} · {sample.dimension_name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setQty(id, qty - 1)} className="rounded border border-border p-0.5 text-muted-foreground hover:bg-muted"><Minus size={10} /></button>
                            <span className="w-8 text-center text-sm">{qty}</span>
                            <button onClick={() => setQty(id, qty + 1)} className="rounded border border-border p-0.5 text-muted-foreground hover:bg-muted"><Plus size={10} /></button>
                            <button onClick={() => setQty(id, 0)} className="ml-1 text-muted-foreground hover:text-red-500"><X size={14} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4 — Bevestig */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="rounded-xl bg-card ring-1 ring-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <h3 className="text-sm font-semibold">Sticker-opties</h3>
                </div>
                <div className="divide-y divide-border">
                  {/* Stap 1 */}
                  <div className="px-4 py-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Stap 1 — Stickers</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { val: true,  label: "Stickers aanmaken" },
                        { val: false, label: "Geen stickers" },
                      ].map(({ val, label }) => (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => setMakeStickers(val)}
                          className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors text-left ${makeStickers === val ? "bg-primary text-primary-foreground border-primary" : "bg-card text-card-foreground border-border hover:bg-muted"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Stap 2 */}
                  <div className={`px-4 py-3 space-y-2 transition-opacity ${makeStickers ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Stap 2 — Namen</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { val: "karpi" as const,  label: "Karpi namen" },
                        { val: "client" as const, label: "Klant eigen namen" },
                      ].map(({ val, label }) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setStickerNameType(val)}
                          className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors text-left ${stickerNameType === val ? "bg-primary text-primary-foreground border-primary" : "bg-card text-card-foreground border-border hover:bg-muted"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Stap 3 */}
                  <div className={`px-4 py-3 space-y-2 transition-opacity ${makeStickers ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Stap 3 — Prijzen</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { val: true,  label: "Prijzen tonen" },
                        { val: false, label: "Geen prijzen" },
                      ].map(({ val, label }) => (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => setShowPricesOnSticker(val)}
                          className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors text-left ${showPricesOnSticker === val ? "bg-primary text-primary-foreground border-primary" : "bg-card text-card-foreground border-border hover:bg-muted"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-card p-4 ring-1 ring-border">
                <h3 className="mb-3 text-sm font-medium">Samenvatting</h3>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div>
                    <span className="text-card-foreground font-medium">Klant:</span> {selectedClient?.name}
                    {selectedClient?.price_list_nr && (
                      <span className="ml-2 font-mono text-xs">({selectedClient.price_list_nr})</span>
                    )}
                  </div>
                  {reference && (
                    <div>
                      <span className="text-card-foreground font-medium">Referentie:</span> {reference}
                    </div>
                  )}
                  <div>
                    <span className="text-card-foreground font-medium">Leverweek:</span>{" "}
                    {weekOptions.find((w) => w.value === deliveryDate)?.label ?? deliveryDate}
                  </div>
                  <div>
                    <span className="text-card-foreground font-medium">Adres:</span>{" "}
                    {[shippingStreet, shippingPostalCode, shippingCity, shippingCountry].filter(Boolean).join(", ") || "—"}
                  </div>
                  <div>
                    <span className="text-card-foreground font-medium">Artikelen:</span>{" "}
                    {quantities.size} ({totalSamples} stalen)
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Notities (optioneel)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Optionele notitie..."
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
          <Button
            variant="outline"
            onClick={() => {
              if (step === 1) onOpenChange(false);
              else setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
            }}
            disabled={saving}
          >
            <ArrowLeft size={14} /> {step === 1 ? "Sluiten" : "Terug"}
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
              disabled={
                (step === 1 && !canNext1) ||
                (step === 2 && !canNext2) ||
                (step === 3 && !canNext3)
              }
            >
              Volgende <ArrowRight size={14} />
            </Button>
          ) : (
            <Button onClick={handleCreateOrder} disabled={saving}>
              {saving ? "Opslaan..." : "Order aanmaken"} <Check size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
