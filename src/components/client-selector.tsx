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

interface Client {
  id: string;
  name: string;
}

interface ClientSelectorProps {
  onSelect: (clientId: string) => void;
  value?: string;
  label?: string;
}

export function ClientSelector({ onSelect, value, label = "Klant" }: ClientSelectorProps) {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setClients(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onSelect(v ?? "")}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecteer klant" />
        </SelectTrigger>
        <SelectContent>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
