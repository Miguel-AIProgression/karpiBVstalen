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

interface BundleConfig { id: string; name: string; }

export default function BundleAssemblyPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [configs, setConfigs] = useState<BundleConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    supabase.from("bundle_configs").select("id, name").eq("active", true).order("name")
      .then(({ data }) => setConfigs(data ?? []));
  // supabase is a singleton — stable reference, intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const { error } = await supabase.from("bundle_batches").insert({
      bundle_config_id: selectedConfig,
      location_id: locationId,
      quantity: qty,
      assembled_by: user.id,
    });

    if (error) {
      setStatus("error");
      setErrorMsg(
        error.message.includes("Insufficient")
          ? "Onvoldoende afgewerkte voorraad voor deze bundel!"
          : error.message
      );
    } else {
      setStatus("success");
      setQuantity("");
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Bundels samenstellen</h2>
      <Card>
        <CardHeader><CardTitle>Nieuwe bundel-batch</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Bundel-configuratie</Label>
              <Select value={selectedConfig} onValueChange={(v) => setSelectedConfig(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecteer bundel" />
                </SelectTrigger>
                <SelectContent>
                  {configs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <LocationPicker onSelect={setLocationId} />
            <div className="space-y-2">
              <Label>Aantal bundels</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Aantal bundels"
                required
              />
            </div>
            {status === "error" && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}
            {status === "success" && (
              <p className="text-sm text-green-600">Bundels succesvol samengesteld!</p>
            )}
            <Button
              type="submit"
              disabled={status === "saving" || !selectedConfig || !locationId || !quantity}
            >
              {status === "saving" ? "Opslaan..." : "Samenstellen"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
