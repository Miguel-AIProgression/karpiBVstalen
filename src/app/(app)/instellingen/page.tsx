"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";

interface CompanySettings {
  company_name: string | null;
  address_street: string | null;
  address_postal: string | null;
  address_city: string | null;
  address_country: string | null;
  phone: string | null;
  email: string | null;
  sample_price_cents: number | null;
}

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export default function InstellingenPage() {
  const supabase = createClient();
  const [settings, setSettings] = useState<CompanySettings>({
    company_name: null, address_street: null, address_postal: null,
    address_city: null, address_country: null, phone: null, email: null,
    sample_price_cents: null,
  });
  const [samplePriceInput, setSamplePriceInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("company_settings" as any).select("*").eq("id", SETTINGS_ID).single();
    if (data) {
      const s = data as unknown as CompanySettings;
      setSettings(s);
      setSamplePriceInput(s.sample_price_cents != null ? (s.sample_price_cents / 100).toFixed(2) : "");
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function field(key: keyof Omit<CompanySettings, "sample_price_cents">) {
    return settings[key] ?? "";
  }

  function set(key: keyof Omit<CompanySettings, "sample_price_cents">, value: string) {
    setSettings((s) => ({ ...s, [key]: value || null }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    const priceCents = samplePriceInput ? Math.round(parseFloat(samplePriceInput.replace(",", ".")) * 100) : null;
    const { error: err } = await supabase.from("company_settings" as any).upsert({
      id: SETTINGS_ID,
      ...settings,
      sample_price_cents: priceCents && !isNaN(priceCents) ? priceCents : null,
      updated_at: new Date().toISOString(),
    });
    if (err) setError(err.message);
    else setSaved(true);
    setSaving(false);
  }

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Instellingen</h1>
        <p className="text-sm text-muted-foreground">Bedrijfsgegevens worden getoond op alle pakbonnen.</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bedrijfsgegevens</h2>

        <div className="space-y-1.5">
          <Label>Bedrijfsnaam</Label>
          <Input value={field("company_name")} onChange={(e) => set("company_name", e.target.value)} placeholder="Karpi BV" />
        </div>

        <div className="space-y-1.5">
          <Label>Straat + huisnummer</Label>
          <Input value={field("address_street")} onChange={(e) => set("address_street", e.target.value)} placeholder="Voorbeeldstraat 1" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Postcode</Label>
            <Input value={field("address_postal")} onChange={(e) => set("address_postal", e.target.value)} placeholder="1234 AB" />
          </div>
          <div className="space-y-1.5">
            <Label>Plaats</Label>
            <Input value={field("address_city")} onChange={(e) => set("address_city", e.target.value)} placeholder="Amsterdam" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Land</Label>
          <Input value={field("address_country")} onChange={(e) => set("address_country", e.target.value)} placeholder="Nederland" />
        </div>

        <div className="space-y-1.5">
          <Label>Telefoon</Label>
          <Input value={field("phone")} onChange={(e) => set("phone", e.target.value)} placeholder="+31 20 123 4567" />
        </div>

        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={field("email")} onChange={(e) => set("email", e.target.value)} placeholder="info@karpi.nl" />
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Verkoopprijzen</h2>
        <p className="text-xs text-muted-foreground">Deze prijs wordt gebruikt als factuurprijs voor losse stalen die niet via een collectie of bundel worden besteld.</p>
        <div className="space-y-1.5">
          <Label>Vaste staalprijs (€)</Label>
          <div className="relative max-w-[160px]">
            <span className="absolute left-3 top-2 text-sm text-muted-foreground">€</span>
            <Input
              className="pl-7"
              value={samplePriceInput}
              onChange={(e) => { setSamplePriceInput(e.target.value); setSaved(false); }}
              placeholder="5.00"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Opslaan…" : "Opslaan"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <Check size={14} /> Opgeslagen
          </span>
        )}
      </div>
    </div>
  );
}
