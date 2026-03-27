"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProductSelection {
  qualityId: string;
  colorCodeId: string;
}

interface ProductSelectorProps {
  onSelect: (selection: ProductSelection) => void;
}

interface Quality { id: string; name: string; code: string; }
interface ColorCode { id: string; code: string; name: string; quality_id: string; }

export function ProductSelector({ onSelect }: ProductSelectorProps) {
  const supabase = createClient();
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [colorCodes, setColorCodes] = useState<ColorCode[]>([]);
  const [selectedQuality, setSelectedQuality] = useState("");
  const [selectedColorCode, setSelectedColorCode] = useState("");

  useEffect(() => {
    supabase.from("qualities").select("id, name, code")
      .eq("active", true).order("code")
      .then(({ data }) => setQualities(data ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedQuality) { setColorCodes([]); return; }
    supabase.from("color_codes").select("id, code, name, quality_id")
      .eq("quality_id", selectedQuality).eq("active", true).order("code")
      .then(({ data }) => setColorCodes(data ?? []));
    setSelectedColorCode("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuality]);

  useEffect(() => {
    if (selectedQuality && selectedColorCode) {
      onSelect({ qualityId: selectedQuality, colorCodeId: selectedColorCode });
    }
  }, [selectedQuality, selectedColorCode, onSelect]);

  const selectedQualityObj = qualities.find((q) => q.id === selectedQuality);
  const selectedColor = colorCodes.find((cc) => cc.id === selectedColorCode);
  const selectedColorLabel = selectedColor
    ? selectedColor.code === selectedColor.name
      ? selectedColor.code
      : `${selectedColor.code} — ${selectedColor.name}`
    : undefined;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Product</Label>
        <Select value={selectedQuality} onValueChange={(v) => setSelectedQuality(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecteer product">
              {selectedQualityObj ? `${selectedQualityObj.code} — ${selectedQualityObj.name}` : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {qualities.map((q) => (
              <SelectItem key={q.id} value={q.id}>{q.code} — {q.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Kleurcode</Label>
        <Select value={selectedColorCode} onValueChange={(v) => setSelectedColorCode(v ?? "")} disabled={!selectedQuality}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecteer kleur">
              {selectedColorLabel}
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
  );
}
