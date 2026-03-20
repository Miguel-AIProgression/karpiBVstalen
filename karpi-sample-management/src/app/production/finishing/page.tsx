"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FinishingSelector } from "@/components/finishing-selector";
import { LocationPicker } from "@/components/location-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";

interface RawStockEntry {
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  location_id: string;
  quantity: number;
  quality_name: string;
  collection_name: string;
  color_code: string;
  color_name: string;
  dimension_name: string;
  location_label: string;
}

export default function FinishingBatchPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [rawStock, setRawStock] = useState<RawStockEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState("");
  const [finishingTypeId, setFinishingTypeId] = useState("");
  const [targetLocationId, setTargetLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    supabase
      .from("raw_stock")
      .select(`
        quality_id, color_code_id, dimension_id, location_id, quantity,
        qualities(name, collections(name)),
        color_codes(code, name),
        sample_dimensions(name),
        locations(label)
      `)
      .gt("quantity", 0)
      .order("quality_id")
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entries: RawStockEntry[] = (data ?? []).map((r: any) => ({
          quality_id: r.quality_id,
          color_code_id: r.color_code_id,
          dimension_id: r.dimension_id,
          location_id: r.location_id,
          quantity: r.quantity,
          quality_name: r.qualities?.name ?? "",
          collection_name: r.qualities?.collections?.name ?? "",
          color_code: r.color_codes?.code ?? "",
          color_name: r.color_codes?.name ?? "",
          dimension_name: r.sample_dimensions?.name ?? "",
          location_label: r.locations?.label ?? "",
        }));
        setRawStock(entries);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = selectedIndex !== "" ? rawStock[Number(selectedIndex)] : null;

  function formatStockLabel(entry: RawStockEntry) {
    const color = entry.color_code === entry.color_name
      ? entry.color_code
      : `${entry.color_code} — ${entry.color_name}`;
    return `${entry.collection_name} / ${entry.quality_name} / ${color} / ${entry.dimension_name} — ${entry.location_label} (${entry.quantity} st.)`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selected) return;
    const qty = Math.round(Number(quantity));
    if (!qty || qty < 1 || !Number.isFinite(qty)) {
      setStatus("error");
      setErrorMsg("Voer een geldig aantal in (geheel getal, minimaal 1)");
      return;
    }
    if (qty > selected.quantity) {
      setStatus("error");
      setErrorMsg(`Er zijn maar ${selected.quantity} stuks beschikbaar op deze locatie`);
      return;
    }

    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("finishing_batches").insert({
      quality_id: selected.quality_id,
      color_code_id: selected.color_code_id,
      dimension_id: selected.dimension_id,
      finishing_type_id: finishingTypeId,
      source_location_id: selected.location_id,
      target_location_id: targetLocationId,
      quantity: qty,
      finished_by: user.id,
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("success");
      setQuantity("");
      // Refresh raw stock
      setSelectedIndex("");
      supabase
        .from("raw_stock")
        .select(`
          quality_id, color_code_id, dimension_id, location_id, quantity,
          qualities(name, collections(name)),
          color_codes(code, name),
          sample_dimensions(name),
          locations(label)
        `)
        .gt("quantity", 0)
        .order("quality_id")
        .then(({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const entries: RawStockEntry[] = (data ?? []).map((r: any) => ({
            quality_id: r.quality_id,
            color_code_id: r.color_code_id,
            dimension_id: r.dimension_id,
            location_id: r.location_id,
            quantity: r.quantity,
            quality_name: r.qualities?.name ?? "",
            collection_name: r.qualities?.collections?.name ?? "",
            color_code: r.color_codes?.code ?? "",
            color_name: r.color_codes?.name ?? "",
            dimension_name: r.sample_dimensions?.name ?? "",
            location_label: r.locations?.label ?? "",
          }));
          setRawStock(entries);
        });
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Afwerk-batch registreren</h2>
      <Card>
        <CardHeader><CardTitle>Nieuwe afwerk-batch</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Gesneden voorraad</Label>
              <Select value={selectedIndex} onValueChange={(v) => { setSelectedIndex(v ?? ""); setFinishingTypeId(""); setQuantity(""); setStatus("idle"); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecteer gesneden voorraad">
                    {selected ? formatStockLabel(selected) : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {rawStock.map((entry, i) => (
                    <SelectItem key={`${entry.quality_id}-${entry.color_code_id}-${entry.dimension_id}-${entry.location_id}`} value={String(i)}>
                      {formatStockLabel(entry)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selected && (
              <>
                <div className="rounded-md bg-muted/50 p-4 text-sm space-y-1">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Collectie</span>
                    <span className="font-medium">{selected.collection_name}</span>
                    <span className="text-muted-foreground">Kwaliteit</span>
                    <span className="font-medium">{selected.quality_name}</span>
                    <span className="text-muted-foreground">Kleurcode</span>
                    <span className="font-medium">
                      {selected.color_code === selected.color_name ? selected.color_code : `${selected.color_code} — ${selected.color_name}`}
                    </span>
                    <span className="text-muted-foreground">Maat</span>
                    <span className="font-medium">{selected.dimension_name}</span>
                    <span className="text-muted-foreground">Locatie (bron)</span>
                    <span className="font-medium">{selected.location_label}</span>
                    <span className="text-muted-foreground">Beschikbaar</span>
                    <span className="font-medium">{selected.quantity} stuks</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FinishingSelector qualityId={selected.quality_id} onSelect={setFinishingTypeId} />
                  <div className="space-y-2">
                    <Label>Aantal</Label>
                    <Input
                      type="number"
                      min="1"
                      max={selected.quantity}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder={`Max ${selected.quantity}`}
                      required
                    />
                  </div>
                </div>
                <LocationPicker onSelect={setTargetLocationId} label="Naar locatie (afgewerkt)" />
              </>
            )}

            {status === "error" && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}
            {status === "success" && (
              <p className="text-sm text-green-600">Afwerk-batch succesvol geregistreerd!</p>
            )}
            <Button
              type="submit"
              disabled={
                status === "saving" ||
                !selected ||
                !finishingTypeId ||
                !targetLocationId ||
                !quantity
              }
            >
              {status === "saving" ? "Opslaan..." : "Registreren"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
