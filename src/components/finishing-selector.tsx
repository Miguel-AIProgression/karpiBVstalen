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

interface FinishingSelectorProps {
  qualityId: string;
  onSelect: (finishingTypeId: string) => void;
}

interface FinishingType { id: string; name: string; }

export function FinishingSelector({ qualityId, onSelect }: FinishingSelectorProps) {
  const supabase = createClient();
  const [finishingTypes, setFinishingTypes] = useState<FinishingType[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!qualityId) { setFinishingTypes([]); return; }
    supabase.from("quality_finishing_rules")
      .select("finishing_type_id, finishing_types(id, name)")
      .eq("quality_id", qualityId).eq("is_allowed", true)
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const types = (data ?? []).map((r: any) => r.finishing_types).filter(Boolean);
        setFinishingTypes(types);
      });
    setSelected("");
  // supabase is a singleton — stable reference, intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualityId]);

  function handleChange(value: string | null) {
    const v = value ?? "";
    setSelected(v);
    onSelect(v);
  }

  return (
    <div className="space-y-2">
      <Label>Afwerking</Label>
      <Select value={selected} onValueChange={handleChange} disabled={!qualityId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecteer afwerking" />
        </SelectTrigger>
        <SelectContent>
          {finishingTypes.map((ft) => (
            <SelectItem key={ft.id} value={ft.id}>{ft.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
