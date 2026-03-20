"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

interface Quality { id: string; name: string; code: string; }
interface ColorCode { id: string; code: string; name: string; }

export default function CutBatchPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [colorCodes, setColorCodes] = useState<ColorCode[]>([]);
  const [selectedQuality, setSelectedQuality] = useState("");
  const [selectedColorCode, setSelectedColorCode] = useState("");
  const [dimensionId, setDimensionId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [dimensions, setDimensions] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    supabase.from("qualities").select("id, name, code").eq("active", true).order("code")
      .then(({ data }) => setQualities(data ?? []));
    supabase.from("sample_dimensions").select("id, name").order("name")
      .then(({ data }) => setDimensions(data ?? []));
  // supabase is a singleton — stable reference, intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedQuality) { setColorCodes([]); return; }
    supabase.from("color_codes").select("id, code, name")
      .eq("quality_id", selectedQuality).eq("active", true).order("code")
      .then(({ data }) => setColorCodes(data ?? []));
    setSelectedColorCode("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuality]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const qty = Math.round(Number(quantity));
    if (!qty || qty < 1 || !Number.isFinite(qty)) {
      setStatus("error");
      setErrorMsg("Voer een geldig aantal in (geheel getal, minimaal 1)");
      return;
    }

    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("cut_batches").insert({
      quality_id: selectedQuality,
      color_code_id: selectedColorCode,
      dimension_id: dimensionId,
      location_id: locationId,
      quantity: qty,
      cut_by: user.id,
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("success");
      setQuantity("");
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Snij-batch registreren</h2>
      <Card>
        <CardHeader><CardTitle>Nieuwe snij-batch</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kwaliteit</Label>
                <Select value={selectedQuality} onValueChange={(v) => setSelectedQuality(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecteer kwaliteit">
                      {qualities.find((q) => q.id === selectedQuality)?.code}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {qualities.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.code}{q.code !== q.name ? ` — ${q.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kleurcode</Label>
                <Select value={selectedColorCode} onValueChange={(v) => setSelectedColorCode(v ?? "")} disabled={!selectedQuality}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecteer kleur">
                      {colorCodes.find((cc) => cc.id === selectedColorCode)?.code}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {colorCodes.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        {cc.code === cc.name ? cc.code : `${cc.code} — ${cc.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Maat</Label>
                <Select value={dimensionId} onValueChange={(v) => setDimensionId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecteer maat">
                      {dimensions.find((d) => d.id === dimensionId)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {dimensions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Aantal</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Aantal staaltjes"
                  required
                />
              </div>
            </div>
            <LocationPicker onSelect={setLocationId} />
            {status === "error" && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}
            {status === "success" && (
              <p className="text-sm text-green-600">Snij-batch succesvol geregistreerd!</p>
            )}
            <Button
              type="submit"
              disabled={
                status === "saving" ||
                !selectedQuality ||
                !selectedColorCode ||
                !dimensionId ||
                !locationId ||
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
