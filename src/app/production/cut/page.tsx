"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProductSelector } from "@/components/product-selector";
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

export default function CutBatchPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [product, setProduct] = useState({ collectionId: "", qualityId: "", colorCodeId: "" });
  const [dimensionId, setDimensionId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [dimensions, setDimensions] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    supabase.from("sample_dimensions").select("id, name").order("name")
      .then(({ data }) => setDimensions(data ?? []));
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

    const { error } = await supabase.from("cut_batches").insert({
      quality_id: product.qualityId,
      color_code_id: product.colorCodeId,
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
            <ProductSelector onSelect={setProduct} />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Maat</Label>
                <Select value={dimensionId} onValueChange={(v) => setDimensionId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecteer maat" />
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
                !product.qualityId ||
                !product.colorCodeId ||
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
