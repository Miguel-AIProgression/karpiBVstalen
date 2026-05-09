"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

interface Brand {
  id: string;
  name: string;
  active: boolean;
}

export default function MerkenPage() {
  const supabase = createClient();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadBrands = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("brands")
      .select("id, name, active")
      .order("name");
    setBrands(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadBrands(); }, [loadBrands]);

  async function saveNew() {
    if (!formName.trim()) return;
    setSaving(true);
    await supabase.from("brands").insert({ name: formName.trim(), active: true });
    setFormName("");
    setShowNewForm(false);
    await loadBrands();
    setSaving(false);
  }

  async function saveEdit() {
    if (!editingId || !formName.trim()) return;
    setSaving(true);
    await supabase.from("brands").update({ name: formName.trim() }).eq("id", editingId);
    setEditingId(null);
    await loadBrands();
    setSaving(false);
  }

  async function deleteBrand(brand: Brand) {
    if (!confirm(`Merk "${brand.name}" verwijderen? Gekoppelde stalen verliezen dit merk.`)) return;
    await supabase.from("sample_brands").delete().eq("brand_id", brand.id);
    await supabase.from("brands").delete().eq("id", brand.id);
    loadBrands();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">Merken</h2>
          <p className="mt-1 text-sm text-muted-foreground">Beheer merken en koppel ze aan stalen</p>
        </div>
        <Button onClick={() => { setShowNewForm(true); setFormName(""); }}>
          <Plus size={14} /> Nieuw merk
        </Button>
      </div>

      {showNewForm && (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border space-y-3">
          <h3 className="text-sm font-semibold">Nieuw merk</h3>
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Naam (bijv. Karpi)"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") saveNew(); if (e.key === "Escape") setShowNewForm(false); }}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveNew} disabled={saving || !formName.trim()}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowNewForm(false)}>Annuleren</Button>
          </div>
        </div>
      )}

      <div className="max-w-lg space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Merken</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : brands.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen merken.</p>
        ) : (
          <div className="space-y-1">
            {brands.map((brand) => (
              <div
                key={brand.id}
                className="flex items-center justify-between rounded-xl bg-card px-4 py-3 ring-1 ring-border"
              >
                {editingId === brand.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="h-7 text-sm"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <button onClick={saveEdit} className="text-green-600 hover:text-green-700">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-medium text-card-foreground">{brand.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingId(brand.id); setFormName(brand.name); }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteBrand(brand)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
