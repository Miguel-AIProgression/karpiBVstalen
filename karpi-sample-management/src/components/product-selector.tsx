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
  collectionId: string;
  qualityId: string;
  colorCodeId: string;
}

interface ProductSelectorProps {
  onSelect: (selection: ProductSelection) => void;
}

interface Collection { id: string; name: string; }
interface Quality { id: string; name: string; collection_id: string; }
interface ColorCode { id: string; code: string; name: string; quality_id: string; }

export function ProductSelector({ onSelect }: ProductSelectorProps) {
  const supabase = createClient();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [colorCodes, setColorCodes] = useState<ColorCode[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [selectedQuality, setSelectedQuality] = useState("");
  const [selectedColorCode, setSelectedColorCode] = useState("");

  useEffect(() => {
    supabase.from("collections").select("id, name").order("name")
      .then(({ data }) => setCollections(data ?? []));
  // supabase is a singleton — stable reference, intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCollection) { setQualities([]); return; }
    supabase.from("qualities").select("id, name, collection_id")
      .eq("collection_id", selectedCollection).order("name")
      .then(({ data }) => setQualities(data ?? []));
    setSelectedQuality("");
    setSelectedColorCode("");
  // supabase is a singleton — stable reference, intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollection]);

  useEffect(() => {
    if (!selectedQuality) { setColorCodes([]); return; }
    supabase.from("color_codes").select("id, code, name, quality_id")
      .eq("quality_id", selectedQuality).order("code")
      .then(({ data }) => setColorCodes(data ?? []));
    setSelectedColorCode("");
  // supabase is a singleton — stable reference, intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuality]);

  useEffect(() => {
    if (selectedCollection && selectedQuality && selectedColorCode) {
      onSelect({ collectionId: selectedCollection, qualityId: selectedQuality, colorCodeId: selectedColorCode });
    }
  }, [selectedCollection, selectedQuality, selectedColorCode, onSelect]);

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label>Collectie</Label>
        <Select value={selectedCollection} onValueChange={(v) => setSelectedCollection(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecteer collectie" />
          </SelectTrigger>
          <SelectContent>
            {collections.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Kwaliteit</Label>
        <Select value={selectedQuality} onValueChange={(v) => setSelectedQuality(v ?? "")} disabled={!selectedCollection}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecteer kwaliteit" />
          </SelectTrigger>
          <SelectContent>
            {qualities.map((q) => (
              <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Kleurcode</Label>
        <Select value={selectedColorCode} onValueChange={(v) => setSelectedColorCode(v ?? "")} disabled={!selectedQuality}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecteer kleur" />
          </SelectTrigger>
          <SelectContent>
            {colorCodes.map((cc) => (
              <SelectItem key={cc.id} value={cc.id}>{cc.code} — {cc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
