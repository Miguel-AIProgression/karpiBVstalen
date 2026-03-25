"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, ArrowRight, ArrowLeft, Check } from "lucide-react";

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
}

interface OrderCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

/* ─── Component ──────────────────────────────────────── */

export function OrderCreateModal({ open, onOpenChange, onCreated }: OrderCreateModalProps) {
  const supabase = createClient();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Klant
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);

  // Step 2: Collectie
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<CollectionOption | null>(null);

  // Step 3: Levertijd
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");

  // Step 4: Bevestig
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
      .select("id, name, collection_bundles(id)")
      .eq("active", true)
      .order("name");
    const mapped: CollectionOption[] = (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      bundle_count: c.collection_bundles?.length ?? 0,
    }));
    setCollections(mapped);
  }, [supabase]);

  useEffect(() => {
    if (open) {
      loadClients();
      loadCollections();
    }
  }, [open, loadClients, loadCollections]);

  function resetAll() {
    setStep(1);
    setClientSearch("");
    setSelectedClient(null);
    setSelectedCollection(null);
    setDeliveryDate("");
    setNotes("");
    setError("");
    setSaving(false);
  }

  function handleClose() {
    resetAll();
    onOpenChange(false);
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

  const stepLabels = ["Kies klant", "Kies collectie", "Levertijd", "Bevestig"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-background p-6 ring-1 ring-border shadow-xl">
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
              {s < 4 && (
                <div className={`h-0.5 w-6 ${s < step ? "bg-green-300" : "bg-border"}`} />
              )}
            </div>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">{stepLabels[step - 1]}</span>
        </div>

        {/* Step 1: Kies klant */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="relative">
              <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
              <Input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Zoek klant..."
                className="pl-8"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredClients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedClient(c);
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

        {/* Step 3: Levertijd */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Levertijd *</label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
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

        {/* Step 4: Bevestig */}
        {step === 4 && (
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
                <span className="text-muted-foreground">Levertijd</span>
                <span className="font-medium text-card-foreground">
                  {deliveryDate
                    ? new Date(deliveryDate).toLocaleDateString("nl-NL", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : ""}
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
                onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)}
              >
                <ArrowLeft size={14} /> Vorige
              </Button>
            )}
          </div>
          <div>
            {step === 3 && (
              <Button
                size="sm"
                onClick={() => setStep(4)}
                disabled={!deliveryDate}
              >
                Volgende <ArrowRight size={14} />
              </Button>
            )}
            {step === 4 && (
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
