"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

interface FinishingType {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

interface LinkedSample {
  id: string;
  article_number: string;
  quality_name: string;
  color_code: string;
  dimension_name: string;
}

export default function AfwerkingenPage() {
  const supabase = createClient();

  const [finishings, setFinishings] = useState<FinishingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FinishingType | null>(null);
  const [linkedSamples, setLinkedSamples] = useState<LinkedSample[]>([]);
  const [allSamples, setAllSamples] = useState<LinkedSample[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);

  // New / edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadFinishings = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("finishing_types")
      .select("id, name, description, active")
      .order("name");
    setFinishings(data ?? []);
    setLoading(false);
  }, [supabase]);

  const loadLinkedSamples = useCallback(async (finishingId: string) => {
    setLoadingSamples(true);
    const { data } = await supabase
      .from("samples")
      .select("id, article_number, qualities(name), color_codes(code), sample_dimensions(name)")
      .eq("finishing_type_id", finishingId)
      .eq("active", true)
      .order("article_number");
    setLinkedSamples(
      (data ?? []).map((s: any) => ({
        id: s.id,
        article_number: s.article_number,
        quality_name: s.qualities?.name ?? "",
        color_code: s.color_codes?.code ?? "",
        dimension_name: s.sample_dimensions?.name ?? "",
      }))
    );
    setLoadingSamples(false);
  }, [supabase]);

  const loadAllSamples = useCallback(async () => {
    const { data } = await supabase
      .from("samples")
      .select("id, article_number, qualities(name), color_codes(code), sample_dimensions(name)")
      .eq("active", true)
      .order("article_number");
    setAllSamples(
      (data ?? []).map((s: any) => ({
        id: s.id,
        article_number: s.article_number,
        quality_name: s.qualities?.name ?? "",
        color_code: s.color_codes?.code ?? "",
        dimension_name: s.sample_dimensions?.name ?? "",
      }))
    );
  }, [supabase]);

  useEffect(() => { loadFinishings(); loadAllSamples(); }, [loadFinishings, loadAllSamples]);

  useEffect(() => {
    if (selected) loadLinkedSamples(selected.id);
    else setLinkedSamples([]);
  }, [selected, loadLinkedSamples]);

  async function saveNew() {
    if (!formName.trim()) return;
    setSaving(true);
    await supabase.from("finishing_types").insert({ name: formName.trim(), description: formDesc.trim() || null, active: true });
    setFormName(""); setFormDesc(""); setShowNewForm(false);
    await loadFinishings();
    setSaving(false);
  }

  async function saveEdit() {
    if (!editingId || !formName.trim()) return;
    setSaving(true);
    await supabase.from("finishing_types").update({ name: formName.trim(), description: formDesc.trim() || null }).eq("id", editingId);
    setEditingId(null);
    await loadFinishings();
    setSaving(false);
  }

  async function deleteFinishing(ft: FinishingType) {
    if (!confirm(`Afwerking "${ft.name}" verwijderen?`)) return;
    await supabase.from("samples").update({ finishing_type_id: null }).eq("finishing_type_id", ft.id);
    await supabase.from("finishing_types").delete().eq("id", ft.id);
    if (selected?.id === ft.id) setSelected(null);
    loadFinishings();
  }

  async function linkSample(sampleId: string) {
    if (!selected) return;
    await supabase.from("samples").update({ finishing_type_id: selected.id }).eq("id", sampleId);
    loadLinkedSamples(selected.id);
  }

  async function unlinkSample(sampleId: string) {
    await supabase.from("samples").update({ finishing_type_id: null }).eq("id", sampleId);
    if (selected) loadLinkedSamples(selected.id);
  }

  const linkedIds = new Set(linkedSamples.map((s) => s.id));
  const unlinkledSamples = allSamples.filter((s) => !linkedIds.has(s.id));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">Afwerkingen</h2>
          <p className="mt-1 text-sm text-muted-foreground">Beheer afwerkingstypes en koppel ze aan stalen</p>
        </div>
        <Button onClick={() => { setShowNewForm(true); setFormName(""); setFormDesc(""); }}>
          <Plus size={14} /> Nieuwe afwerking
        </Button>
      </div>

      {/* Nieuw formulier */}
      {showNewForm && (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border space-y-3">
          <h3 className="text-sm font-semibold">Nieuwe afwerking</h3>
          <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Naam (bijv. Blindzoom)" autoFocus />
          <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Omschrijving (optioneel)" />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveNew} disabled={saving || !formName.trim()}>{saving ? "Opslaan..." : "Opslaan"}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowNewForm(false)}>Annuleren</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Afwerkingen lijst */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Afwerkingstypes</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : finishings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen afwerkingen.</p>
          ) : (
            <div className="space-y-1">
              {finishings.map((ft) => (
                <div
                  key={ft.id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 ring-1 cursor-pointer transition-colors ${
                    selected?.id === ft.id ? "bg-primary/5 ring-primary/30" : "bg-card ring-border hover:bg-muted/50"
                  }`}
                  onClick={() => setSelected(selected?.id === ft.id ? null : ft)}
                >
                  {editingId === ft.id ? (
                    <div className="flex flex-1 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="h-7 text-sm" autoFocus />
                      <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className="h-7 text-sm" placeholder="Omschrijving" />
                      <button onClick={saveEdit} className="text-green-600 hover:text-green-700"><Check size={16} /></button>
                      <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-sm font-medium text-card-foreground">{ft.name}</div>
                        {ft.description && <div className="text-xs text-muted-foreground">{ft.description}</div>}
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditingId(ft.id); setFormName(ft.name); setFormDesc(ft.description ?? ""); }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        ><Pencil size={14} /></button>
                        <button
                          onClick={() => deleteFinishing(ft)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        ><Trash2 size={14} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Gekoppelde stalen */}
        {selected && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Stalen gekoppeld aan <span className="text-foreground">{selected.name}</span>
            </h3>

            {/* Gekoppeld */}
            <div className="space-y-1">
              {loadingSamples ? (
                <p className="text-sm text-muted-foreground">Laden...</p>
              ) : linkedSamples.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Geen stalen gekoppeld.</p>
              ) : (
                linkedSamples.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 ring-1 ring-green-200">
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-muted-foreground">{s.article_number}</span>
                      <span className="ml-2 text-sm text-card-foreground">{s.quality_name} {s.color_code}</span>
                      <span className="ml-1 text-xs text-muted-foreground">{s.dimension_name}</span>
                    </div>
                    <button onClick={() => unlinkSample(s.id)} className="ml-2 shrink-0 text-muted-foreground hover:text-destructive" title="Ontkoppelen">
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Koppelen */}
            {unlinkledSamples.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Staal toevoegen</p>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl ring-1 ring-border p-2">
                  {unlinkledSamples.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => linkSample(s.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <Plus size={12} className="shrink-0 text-muted-foreground" />
                      <span className="font-mono text-xs text-muted-foreground">{s.article_number}</span>
                      <span className="text-card-foreground">{s.quality_name} {s.color_code}</span>
                      <span className="text-xs text-muted-foreground">{s.dimension_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!selected && (
          <div className="flex items-center justify-center rounded-2xl border-2 border-dashed border-border p-8">
            <p className="text-sm text-muted-foreground">Klik op een afwerking om de gekoppelde stalen te zien</p>
          </div>
        )}
      </div>
    </div>
  );
}
