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

interface LocationPickerProps {
  onSelect: (locationId: string) => void;
  label?: string;
}

interface Location { id: string; label: string; }

export function LocationPicker({ onSelect, label = "Locatie" }: LocationPickerProps) {
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    supabase.from("locations").select("id, label").order("label")
      .then(({ data }) => setLocations(data ?? []));
  // supabase is a singleton — stable reference, intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(value: string | null) {
    const v = value ?? "";
    setSelected(v);
    onSelect(v);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={selected} onValueChange={handleChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecteer locatie" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>{loc.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
