"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Package, Minus, Check, X, AlertTriangle } from "lucide-react";
import { DeactivateDialog } from "@/components/compose/deactivate-dialog";

/* ─── Types ──────────────────────────────────────────── */

interface ExtraData {
  id: string;
  name: string;
  type: string;
  description: string | null;
  min_stock: number;
  active: boolean;
  total_stock: number;
}

interface ExtraStockEntry {
  extra_id: string;
  location_id: string;
  location_label: string;
  quantity: number;
}

const EXTRA_TYPES = [
  { value: "display", label: "Display" },
  { value: "roede", label: "Roede" },
  { value: "bandenset", label: "Bandenset" },
  { value: "overig", label: "Overig" },
] as const;

function typeLabel(type: string): string {
  return EXTRA_TYPES.find((t) => t.value === type)?.label ?? type;
}

/* ─── Component ──────────────────────────────────────── */

export function ExtrasTab() {
  const supabase = createClient();

  const [extras, setExtras] = useState<ExtraData[]>([]);
  const [extraStock, setExtraStock] = useState<ExtraStockEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // New extra form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("display");
  const [newDescription, setNewDescription] = useState("");
  const [newMinStock, setNewMinStock] = useState(0);
  const [saving, setSaving] = useState(false);

  // Edit extra
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMinStock, setEditMinStock] = useState(0);

  // Stock editing
  const [editStockId, setEditStockId] = useState<string | null>(null);
  const [editStockValue, setEditStockValue] = useState(0);

  /* ─── Data loading ─── */

  const loadData = useCallback(async () => {
    setLoading(true);
    const [
      { data: extrasData },
      { data: stockData },
    ] = await Promise.all([
      supabase
        .from("extras")
        .select("*")
        .eq("active", true)
        .order("type")
        .order("name"),
      supabase
        .from("extras_stock")
        .select("extra_id, location_id, quantity, locations(label)"),
    ]);

    // Map stock
    const mappedStock: ExtraStockEntry[] = (stockData ?? []).map((s: any) => ({
      extra_id: s.extra_id,
      location_id: s.location_id,
      quantity: s.quantity,
      location_label: s.locations?.label ?? "?",
    }));

    // Aggregate stock totals per extra
    const stockTotals = new Map<string, number>();
    for (const s of mappedStock) {
      stockTotals.set(s.extra_id, (stockTotals.get(s.extra_id) ?? 0) + s.quantity);
    }

    const mappedExtras: ExtraData[] = (extrasData ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
      min_stock: e.min_stock,
      active: e.active,
      total_stock: stockTotals.get(e.id) ?? 0,
    }));

    setExtras(mappedExtras);
    setExtraStock(mappedStock);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Handlers ─── */

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("extras").insert({
      name: newName.trim(),
      type: newType,
      description: newDescription.trim() || null,
      min_stock: newMinStock,
    });
    setSaving(false);
    if (error) {
      alert("Fout bij aanmaken: " + error.message);
      return;
    }
    setNewName("");
    setNewType("display");
    setNewDescription("");
    setNewMinStock(0);
    setShowNewForm(false);
    loadData();
  }

  function startEdit(extra: ExtraData) {
    setEditingId(extra.id);
    setEditName(extra.name);
    setEditType(extra.type);
    setEditDescription(extra.description ?? "");
    setEditMinStock(extra.min_stock);
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    await supabase.from("extras").update({
      name: editName.trim(),
      type: editType,
      description: editDescription.trim() || null,
      min_stock: editMinStock,
    }).eq("id", editingId);
    setSaving(false);
    setEditingId(null);
    loadData();
  }

  async function handleDeactivate(id: string) {
    await supabase.from("extras").update({ active: false }).eq("id", id);
    loadData();
  }

  async function handleSaveStock(extraId: string) {
    // Get or create stock entry (use first location or default)
    const existing = extraStock.filter((s) => s.extra_id === extraId);

    if (existing.length > 0) {
      // Update the first location's stock
      const diff = editStockValue - extras.find((e) => e.id === extraId)!.total_stock;
      const entry = existing[0];
      await supabase
        .from("extras_stock")
        .update({ quantity: entry.quantity + diff })
        .eq("extra_id", extraId)
        .eq("location_id", entry.location_id);
    } else {
      // Get default location
      const { data: locations } = await supabase
        .from("locations")
        .select("id")
        .limit(1)
        .single();

      if (locations) {
        await supabase.from("extras_stock").insert({
          extra_id: extraId,
          location_id: locations.id,
          quantity: editStockValue,
        });
      }
    }

    setEditStockId(null);
    loadData();
  }

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Displays, roedes, bandensets en andere extra&apos;s op voorraad.
          Extra&apos;s krijgen geen sticker bij orders.
        </p>
        <Button onClick={() => setShowNewForm(true)} disabled={showNewForm}>
          <Plus size={14} /> Nieuwe extra
        </Button>
      </div>

      {/* New extra form */}
      {showNewForm && (
        <div className="rounded-xl bg-amber-50/50 ring-1 ring-amber-200/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Naam (bijv. Display groot)"
              className="h-8 w-56"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowNewForm(false); }}
            />
            <Select value={newType} onValueChange={(v) => { if (v) setNewType(v); }}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXTRA_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Omschrijving (optioneel)"
              className="h-8 w-48"
            />
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground">Min:</label>
              <Input
                type="number"
                min={0}
                value={newMinStock}
                onChange={(e) => setNewMinStock(parseInt(e.target.value) || 0)}
                className="h-8 w-16"
              />
            </div>
            <div className="ml-auto flex gap-1">
              <Button size="sm" className="h-8" disabled={saving || !newName.trim()} onClick={handleCreate}>
                {saving ? "Opslaan..." : "Aanmaken"}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setShowNewForm(false)}>
                Annuleer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {extras.length === 0 && !showNewForm ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <Package size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Nog geen extra&apos;s aangemaakt. Klik op &apos;+ Nieuwe extra&apos; om te beginnen.
          </p>
        </div>
      ) : extras.length > 0 && (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Naam</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Omschrijving</th>
                <th className="px-4 py-3 text-right font-medium text-green-700">Op voorraad</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Min.</th>
                <th className="px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody>
              {extras.map((extra) => {
                const isEditing = editingId === extra.id;
                const isLow = extra.total_stock <= extra.min_stock;
                const rowBg = extra.total_stock <= 0 ? "bg-red-50" : isLow ? "bg-amber-50" : "";

                if (isEditing) {
                  return (
                    <tr key={extra.id} className="border-b border-border/50 bg-amber-50/50">
                      <td className="px-4 py-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-7 w-full"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditingId(null); }}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Select value={editType} onValueChange={(v) => { if (v) setEditType(v); }}>
                          <SelectTrigger className="h-7 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EXTRA_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="h-7 w-full"
                          placeholder="Omschrijving"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {extra.total_stock}
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={editMinStock}
                          onChange={(e) => setEditMinStock(parseInt(e.target.value) || 0)}
                          className="h-7 w-16 ml-auto"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="sm" className="h-6 text-xs px-2" disabled={saving} onClick={handleSaveEdit}>
                            <Check size={12} />
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}>
                            <X size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={extra.id} className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${rowBg}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-card-foreground">{extra.name}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                        {typeLabel(extra.type)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {extra.description || <span className="text-muted-foreground/30">&mdash;</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {editStockId === extra.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setEditStockValue((v) => Math.max(0, v - 1))}
                            className="rounded p-0.5 hover:bg-muted"
                          >
                            <Minus size={14} />
                          </button>
                          <Input
                            type="number"
                            min={0}
                            value={editStockValue}
                            onChange={(e) => setEditStockValue(parseInt(e.target.value) || 0)}
                            className="h-7 w-16 text-center"
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveStock(extra.id); if (e.key === "Escape") setEditStockId(null); }}
                          />
                          <button
                            onClick={() => setEditStockValue((v) => v + 1)}
                            className="rounded p-0.5 hover:bg-muted"
                          >
                            <Plus size={14} />
                          </button>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-1.5 ml-1" onClick={() => handleSaveStock(extra.id)}>
                            <Check size={12} />
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-1.5" onClick={() => setEditStockId(null)}>
                            <X size={12} />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditStockId(extra.id); setEditStockValue(extra.total_stock); }}
                          className="inline-flex min-w-[2rem] justify-center rounded px-1.5 py-0.5 text-xs font-semibold hover:ring-2 hover:ring-border cursor-pointer"
                          style={{
                            backgroundColor: extra.total_stock > 0 ? undefined : undefined,
                          }}
                          title="Klik om voorraad aan te passen"
                        >
                          {extra.total_stock > 0 ? (
                            <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800">
                              {extra.total_stock}
                            </span>
                          ) : (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">
                              0
                            </span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs text-muted-foreground">{extra.min_stock}</span>
                        {isLow && <AlertTriangle size={12} className="text-amber-500" />}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => startEdit(extra)}
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                          Bewerken
                        </button>
                        <DeactivateDialog itemType="Extra" itemName={extra.name} onConfirm={() => handleDeactivate(extra.id)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {extras.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {extras.length} extra{extras.length !== 1 ? "'s" : ""} gevonden
        </div>
      )}
    </div>
  );
}
