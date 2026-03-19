"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Location {
  id: string;
  aisle: string;
  rack: string;
  level: string;
  label: string;
}

export default function LocationsPage() {
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [aisle, setAisle] = useState("");
  const [rack, setRack] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  async function loadLocations() {
    const { data } = await supabase.from("locations").select("*").order("label");
    setLocations((data as Location[]) ?? []);
  }

  useEffect(() => { loadLocations(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const { error } = await supabase.from("locations").insert({ aisle, rack, level });
    if (error) {
      setStatus("error");
    } else {
      setStatus("success");
      setAisle(""); setRack(""); setLevel("");
      loadLocations();
    }
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Locatiebeheer</h2>
      <Card>
        <CardHeader><CardTitle>Nieuwe locatie toevoegen</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex items-end gap-4">
            <div className="space-y-2">
              <Label>Gangpad</Label>
              <Input value={aisle} onChange={(e) => setAisle(e.target.value)} placeholder="A" required />
            </div>
            <div className="space-y-2">
              <Label>Stelling</Label>
              <Input value={rack} onChange={(e) => setRack(e.target.value)} placeholder="1" required />
            </div>
            <div className="space-y-2">
              <Label>Laag</Label>
              <Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="1" required />
            </div>
            <Button type="submit" disabled={status === "saving"}>Toevoegen</Button>
          </form>
          {status === "success" && <p className="mt-2 text-sm text-green-600">Locatie toegevoegd!</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Alle locaties</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Gangpad</TableHead>
                <TableHead>Stelling</TableHead>
                <TableHead>Laag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((loc) => (
                <TableRow key={loc.id}>
                  <TableCell className="font-medium">{loc.label}</TableCell>
                  <TableCell>{loc.aisle}</TableCell>
                  <TableCell>{loc.rack}</TableCell>
                  <TableCell>{loc.level}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
