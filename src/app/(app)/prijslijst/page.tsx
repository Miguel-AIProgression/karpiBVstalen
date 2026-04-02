"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Save,
  Settings2,
  X,
  Check,
  RotateCcw,
  Calculator,
  Sparkles,
  Info,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface Quality {
  id: string;
  name: string;
  code: string;
  base_price: number | null;
  notes: string | null;
  active: boolean;
}

interface CarpetDimension {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  active: boolean;
}

interface QualityCarpetDimension {
  quality_id: string;
  carpet_dimension_id: string;
  active: boolean;
}

interface BasePrice {
  id: string;
  quality_id: string;
  carpet_dimension_id: string | null;
  price_cents: number;
  unit: string;
}

/* ─── Component ──────────────────────────────────────── */

export default function PrijslijstPage() {
  const supabase = createClient();
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [dimensions, setDimensions] = useState<CarpetDimension[]>([]);
  const [qualityDimLinks, setQualityDimLinks] = useState<QualityCarpetDimension[]>([]);
  const [basePrices, setBasePrices] = useState<BasePrice[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Track which quality is in "customize dimensions" mode
  const [customizingQuality, setCustomizingQuality] = useState<string | null>(null);
  // Track dimension toggle edits: key = `${quality_id}:${dim_id}`, value = active
  const [dimToggles, setDimToggles] = useState<Record<string, boolean>>({});

  // Edits: key = `${quality_id}:${carpet_dimension_id || 'null'}`, value = price string
  const [edits, setEdits] = useState<Record<string, string>>({});

  // Calculator state per quality: key = quality_id
  const [calcOpen, setCalcOpen] = useState<string | null>(null);
  const [calcInkoopprijs, setCalcInkoopprijs] = useState<Record<string, string>>({});
  const [calcFactor, setCalcFactor] = useState<Record<string, number>>({});
  const [showConditions, setShowConditions] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [qRes, dRes, qdRes, bpRes] = await Promise.all([
      supabase.from("qualities").select("*").eq("active", true).order("name"),
      supabase.from("carpet_dimensions").select("*").eq("active", true).order("width_cm").order("height_cm"),
      supabase.from("quality_carpet_dimensions").select("quality_id, carpet_dimension_id, active"),
      supabase.from("quality_base_prices").select("*"),
    ]);
    setQualities((qRes.data as Quality[]) ?? []);
    setDimensions((dRes.data as CarpetDimension[]) ?? []);
    setQualityDimLinks((qdRes.data as QualityCarpetDimension[]) ?? []);
    setBasePrices((bpRes.data as BasePrice[]) ?? []);
    setEdits({});
    setDimToggles({});
    setCustomizingQuality(null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  /* ─── Helpers ────────────────────────────────────── */

  const priceKey = (qualityId: string, dimId: string | null) =>
    `${qualityId}:${dimId ?? "null"}`;

  const getPrice = (qualityId: string, dimId: string | null): number | null => {
    const bp = basePrices.find(
      (p) => p.quality_id === qualityId && p.carpet_dimension_id === dimId
    );
    return bp ? bp.price_cents : null;
  };

  const formatCents = (cents: number) =>
    (cents / 100).toFixed(2).replace(".", ",");

  const handleEdit = (qualityId: string, dimId: string | null, value: string) => {
    setEdits((prev) => ({ ...prev, [priceKey(qualityId, dimId)]: value }));
  };

  const getDisplayValue = (qualityId: string, dimId: string | null): string => {
    const key = priceKey(qualityId, dimId);
    if (key in edits) return edits[key];
    const cents = getPrice(qualityId, dimId);
    return cents !== null ? formatCents(cents) : "";
  };

  const hasChanges = Object.keys(edits).length > 0;

  /* ─── Calculator helpers ───────────────────────── */

  const roundToNearest5or9 = (n: number): number => {
    const rounded = Math.round(n);
    const base = Math.floor(rounded / 10) * 10;
    const candidates = [base - 1, base + 5, base + 9]; // eindigt op 9, 5, 9
    let best = candidates[0];
    let bestDist = Math.abs(rounded - best);
    for (const c of candidates) {
      const dist = Math.abs(rounded - c);
      if (dist < bestDist) { best = c; bestDist = dist; }
    }
    return best;
  };

  const calcRoundedPrice = (inkoopM2: number, factor: number, areaCm2: number): number => {
    // Verkoopprijs incl. BTW = inkoopprijs/m² × oppervlakte × factor
    const areM2 = areaCm2 / 10000;
    const inkoop = inkoopM2 * areM2;
    const calculated = inkoop * factor;
    return roundToNearest5or9(calculated);
  };

  const calcM2Price = (inkoopM2: number, factor: number): number => {
    const calculated = inkoopM2 * factor;
    return roundToNearest5or9(calculated);
  };

  const applyCalculatedPrices = (qualityId: string) => {
    const inkoopStr = calcInkoopprijs[qualityId] ?? "";
    const inkoop = parseFloat(inkoopStr.replace(",", ".")) || 0;
    if (inkoop <= 0) return;
    const factor = calcFactor[qualityId] ?? 2.5;
    const dims = getDimsForQuality(qualityId);

    const newEdits: Record<string, string> = {};
    for (const dim of dims) {
      const area = dim.width_cm * dim.height_cm;
      const price = calcRoundedPrice(inkoop, factor, area);
      newEdits[priceKey(qualityId, dim.id)] = formatCents(price * 100);
    }
    // Afwijkende maten (m²)
    const m2Price = calcM2Price(inkoop, factor);
    newEdits[priceKey(qualityId, null)] = formatCents(m2Price * 100);

    setEdits((prev) => ({ ...prev, ...newEdits }));
  };

  /**
   * Get dimensions to show for a quality:
   * - If quality has quality_carpet_dimensions entries → use only the active ones
   * - Otherwise → show ALL dimensions (= standaard template)
   */
  const getDimsForQuality = (qualityId: string): CarpetDimension[] => {
    const links = qualityDimLinks.filter((l) => l.quality_id === qualityId);
    if (links.length === 0) {
      // Geen koppelingen: toon geen dimensies (gebruik afmetingen aanpassen om toe te voegen)
      return [];
    }
    // Toon alleen actief gekoppelde dimensies, rechthoekig eerst dan rond
    const activeDimIds = links
      .filter((l) => l.active)
      .map((l) => l.carpet_dimension_id);
    return dimensions
      .filter((d) => activeDimIds.includes(d.id))
      .sort((a, b) => {
        const aRond = a.name.includes("ROND");
        const bRond = b.name.includes("ROND");
        const aOrg = a.name.includes("organisch");
        const bOrg = b.name.includes("organisch");
        const aGroup = aRond ? 2 : aOrg ? 1 : 0;
        const bGroup = bRond ? 2 : bOrg ? 1 : 0;
        if (aGroup !== bGroup) return aGroup - bGroup;
        return a.width_cm - b.width_cm || a.height_cm - b.height_cm;
      });
  };

  const isDimActiveForQuality = (qualityId: string, dimId: string): boolean => {
    const toggleKey = `${qualityId}:${dimId}`;
    if (toggleKey in dimToggles) return dimToggles[toggleKey];

    const links = qualityDimLinks.filter((l) => l.quality_id === qualityId);
    if (links.length === 0) return true; // default: all active
    const link = links.find((l) => l.carpet_dimension_id === dimId);
    return link ? link.active : false;
  };

  const toggleDim = (qualityId: string, dimId: string) => {
    const key = `${qualityId}:${dimId}`;
    setDimToggles((prev) => ({
      ...prev,
      [key]: !isDimActiveForQuality(qualityId, dimId),
    }));
  };

  /* ─── Save ───────────────────────────────────────── */

  const handleSave = async () => {
    setSaving(true);

    // Save price edits
    for (const [key, val] of Object.entries(edits)) {
      const [qualityId, dimIdStr] = key.split(":");
      const dimId = dimIdStr === "null" ? null : dimIdStr;
      const parsed = parseFloat(val.replace(",", "."));
      if (isNaN(parsed)) continue;
      const cents = Math.round(parsed * 100);
      const unit = dimId ? "piece" : "m2";

      const existing = basePrices.find(
        (p) => p.quality_id === qualityId && p.carpet_dimension_id === dimId
      );
      if (existing) {
        await supabase
          .from("quality_base_prices")
          .update({ price_cents: cents, unit })
          .eq("id", existing.id);
      } else {
        await supabase.from("quality_base_prices").insert({
          quality_id: qualityId,
          carpet_dimension_id: dimId,
          price_cents: cents,
          unit,
        });
      }
    }

    // Save dimension toggle edits
    for (const [key, active] of Object.entries(dimToggles)) {
      const [qualityId, dimId] = key.split(":");
      const existingLink = qualityDimLinks.find(
        (l) => l.quality_id === qualityId && l.carpet_dimension_id === dimId
      );
      if (existingLink) {
        await supabase
          .from("quality_carpet_dimensions")
          .update({ active })
          .eq("quality_id", qualityId)
          .eq("carpet_dimension_id", dimId);
      } else {
        // When customizing for first time, insert links for ALL dims for this quality
        const links = qualityDimLinks.filter((l) => l.quality_id === qualityId);
        if (links.length === 0) {
          // First customization: create entries for all dimensions
          const inserts = dimensions.map((d) => ({
            quality_id: qualityId,
            carpet_dimension_id: d.id,
            active: d.id === dimId ? active : true,
          }));
          await supabase.from("quality_carpet_dimensions").insert(inserts);
          // Update local state to prevent re-inserting
          setQualityDimLinks((prev) => [...prev, ...inserts]);
        } else {
          await supabase.from("quality_carpet_dimensions").insert({
            quality_id: qualityId,
            carpet_dimension_id: dimId,
            active,
          });
        }
      }
    }

    await load();
    setSaving(false);
  };

  /* ─── Filter ─────────────────────────────────────── */

  const hasPrices = (q: Quality) =>
    basePrices.some((bp) => bp.quality_id === q.id);

  const filtered = qualities
    .filter(
      (q) =>
        q.name.toLowerCase().includes(search.toLowerCase()) ||
        q.code.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const aHas = hasPrices(a);
      const bHas = hasPrices(b);
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  /* ─── Render ─────────────────────────────────────── */

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prijslijst</h1>
          <p className="text-sm text-muted-foreground">
            Inkoopprijzen per kwaliteit en tapijtmaat
          </p>
        </div>
        <Button onClick={handleSave} disabled={(!hasChanges && Object.keys(dimToggles).length === 0) || saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Opslaan..." : "Opslaan"}
        </Button>
      </div>

      {/* Search + Voorwaarden */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Zoek kwaliteit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <button
          onClick={() => setShowConditions(true)}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          <Info className="h-3.5 w-3.5" />
          Voorwaarden
        </button>
      </div>

      {/* Voorwaarden modal */}
      {showConditions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowConditions(false)}>
          <div className="bg-card rounded-xl border border-border shadow-lg p-6 max-w-md w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Leverings- &amp; betalingsvoorwaarden</h2>
              <button onClick={() => setShowConditions(false)} className="rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium mb-1">Leveringscondities</p>
                <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
                  <li>Bestellingen &lt; &euro;500: &euro;35 vrachtkosten</li>
                  <li>Bestellingen &ge; &euro;500: franco huis</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Betalingsvoorwaarden</p>
                <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
                  <li>14 dagen netto</li>
                  <li>Prijzen exclusief BTW</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Afwijkende maten (maatwerk)</p>
                <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
                  <li>Minimale afmeting: ca. 090&times;160 cm</li>
                  <li>Maximale breedte: ca. 395 cm</li>
                  <li>Levertijd: ca. 3-4 weken</li>
                  <li>Afwerking: breedband en feston (smal) mogelijk</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Staalprijs</p>
                <p className="text-muted-foreground">&euro;5,00 per stuk (20&times;20 cm)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Laden...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">Geen kwaliteiten gevonden.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((quality) => {
            const dims = getDimsForQuality(quality.id);
            const isCustomizing = customizingQuality === quality.id;
            const hasOverrides = qualityDimLinks.some((l) => l.quality_id === quality.id);

            return (
              <div
                key={quality.id}
                className="rounded-xl border border-border bg-card"
              >
                {/* Quality header */}
                <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                  <span className="font-semibold">{quality.name}</span>
                  <span className="text-sm text-muted-foreground">
                    ({quality.code})
                  </span>
                  {quality.base_price !== null && (
                    <span className="text-xs text-muted-foreground">
                      Inkoopprijs: &euro;{quality.base_price.toFixed(2).replace(".", ",")}
                    </span>
                  )}
                  {quality.notes && (
                    <span className="text-xs text-muted-foreground italic">
                      {quality.notes}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {hasOverrides && !isCustomizing && (
                      <span className="text-xs text-muted-foreground">
                        Aangepaste maten
                      </span>
                    )}
                    <button
                      onClick={() =>
                        setCalcOpen(calcOpen === quality.id ? null : quality.id)
                      }
                      className={`rounded-md p-1.5 transition-colors ${
                        calcOpen === quality.id
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      title="Prijzen berekenen"
                    >
                      <Calculator className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        setCustomizingQuality(isCustomizing ? null : quality.id)
                      }
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Afmetingen aanpassen"
                    >
                      <Settings2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Price calculator panel */}
                {calcOpen === quality.id && (() => {
                  const inkoopStr = calcInkoopprijs[quality.id] ?? (quality.base_price?.toString() ?? "");
                  const inkoop = parseFloat(inkoopStr.replace(",", ".")) || 0;
                  const factor = calcFactor[quality.id] ?? 2.5;

                  return (
                    <div className="border-b border-border bg-muted/30 px-5 py-4 space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Calculator size={16} />
                        Adviesprijs berekenen
                      </div>

                      {/* Factor berekening */}
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">
                            Inkoopprijs /m&sup2; (excl. BTW)
                          </label>
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">&euro;</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0,00"
                              value={inkoopStr}
                              onChange={(e) =>
                                setCalcInkoopprijs((prev) => ({
                                  ...prev,
                                  [quality.id]: e.target.value,
                                }))
                              }
                              className="w-28"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Factor</label>
                          <select
                            value={factor}
                            onChange={(e) =>
                              setCalcFactor((prev) => ({
                                ...prev,
                                [quality.id]: parseFloat(e.target.value),
                              }))
                            }
                            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value={2.5}>&times;2.5</option>
                            <option value={3.0}>&times;3.0</option>
                          </select>
                        </div>
                        {inkoop > 0 && (
                          <Button
                            size="sm"
                            onClick={() => applyCalculatedPrices(quality.id)}
                          >
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                            Alle prijzen invullen
                          </Button>
                        )}
                      </div>

                      {/* Preview */}
                      {inkoop > 0 && (
                        <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                          <p className="text-xs font-medium text-green-700 mb-2">Voorbeeld berekening:</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
                            {dims.map((dim) => {
                              const area = dim.width_cm * dim.height_cm;
                              const price = calcRoundedPrice(inkoop, factor, area);
                              return (
                                <div key={dim.id} className="text-green-800">
                                  <span className="text-green-600 text-xs">{dim.name}</span>
                                  <br />
                                  <span className="font-semibold">&euro; {price.toFixed(2).replace(".", ",")}</span>
                                </div>
                              );
                            })}
                            <div className="text-green-800">
                              <span className="text-green-600 text-xs">Afwijkend /m&sup2;</span>
                              <br />
                              <span className="font-semibold">&euro; {calcM2Price(inkoop, factor).toFixed(2).replace(".", ",")}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Dimension customization panel */}
                {isCustomizing && (
                  <div className="border-b border-border bg-muted/30 px-5 py-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Afmetingen voor deze kwaliteit
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[...dimensions].sort((a, b) => {
                        const aRond = a.name.includes("ROND");
                        const bRond = b.name.includes("ROND");
                        const aOrg = a.name.includes("organisch");
                        const bOrg = b.name.includes("organisch");
                        // Rechthoekig eerst, dan organisch, dan rond
                        const aGroup = aRond ? 2 : aOrg ? 1 : 0;
                        const bGroup = bRond ? 2 : bOrg ? 1 : 0;
                        if (aGroup !== bGroup) return aGroup - bGroup;
                        return a.width_cm - b.width_cm || a.height_cm - b.height_cm;
                      }).map((dim) => {
                        const active = isDimActiveForQuality(quality.id, dim.id);
                        return (
                          <button
                            key={dim.id}
                            onClick={() => toggleDim(quality.id, dim.id)}
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm border transition-colors ${
                              active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground line-through"
                            }`}
                          >
                            {active ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                            {dim.name}
                          </button>
                        );
                      })}
                    </div>
                    {hasOverrides && (
                      <button
                        onClick={async () => {
                          // Reset to default: delete all quality_carpet_dimensions for this quality
                          await supabase
                            .from("quality_carpet_dimensions")
                            .delete()
                            .eq("quality_id", quality.id);
                          // Clear local toggles for this quality
                          setDimToggles((prev) => {
                            const next = { ...prev };
                            for (const key of Object.keys(next)) {
                              if (key.startsWith(quality.id + ":")) delete next[key];
                            }
                            return next;
                          });
                          setQualityDimLinks((prev) =>
                            prev.filter((l) => l.quality_id !== quality.id)
                          );
                        }}
                        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Standaard maten herstellen
                      </button>
                    )}
                  </div>
                )}

                {/* Price rows — sticker-style layout */}
                <div className="divide-y divide-border">
                  {dims.map((dim) => (
                    <div
                      key={dim.id}
                      className="flex items-center px-5 py-2.5"
                    >
                      <span className="w-32 text-sm">{dim.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">&euro;</span>
                        <Input
                          type="text"
                          placeholder="0,00"
                          value={getDisplayValue(quality.id, dim.id)}
                          onChange={(e) =>
                            handleEdit(quality.id, dim.id, e.target.value)
                          }
                          className="w-28 text-right"
                        />
                        <span className="text-xs text-muted-foreground w-8">/St.</span>
                      </div>
                    </div>
                  ))}

                  {/* Afwijkende maten — altijd zichtbaar */}
                  <div className="flex items-center px-5 py-2.5 bg-muted/20">
                    <span className="w-32 text-sm text-muted-foreground">
                      Afwijkende maten
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-muted-foreground">&euro;</span>
                      <Input
                        type="text"
                        placeholder="0,00"
                        value={getDisplayValue(quality.id, null)}
                        onChange={(e) =>
                          handleEdit(quality.id, null, e.target.value)
                        }
                        className="w-28 text-right"
                      />
                      <span className="text-xs text-muted-foreground w-8">/m&sup2;</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
