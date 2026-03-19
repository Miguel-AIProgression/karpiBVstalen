"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PipelineView } from "@/components/pipeline-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface BundleAvailability {
  bundle_config_id: string;
  bundle_name: string;
  bundles_ready: number;
  bundles_makeable: number;
}

export default function AvailabilityPage() {
  const supabase = createClient();
  const [availability, setAvailability] = useState<BundleAvailability[]>([]);

  async function loadAvailability() {
    const { data } = await supabase.from("v_bundle_availability").select("*").order("bundle_name");
    setAvailability((data as BundleAvailability[]) ?? []);
  }

  useEffect(() => {
    loadAvailability();
    const channel = supabase
      .channel("bundle-availability")
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_stock" }, () => loadAvailability())
      .on("postgres_changes", { event: "*", schema: "public", table: "finished_stock" }, () => loadAvailability())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // supabase is a singleton — stable reference, intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Beschikbaarheid</h2>
      <PipelineView />
      <Card>
        <CardHeader><CardTitle>Bundel-beschikbaarheid</CardTitle></CardHeader>
        <CardContent>
          {availability.length === 0 ? (
            <p className="text-sm text-gray-500">Geen bundel-configuraties gevonden.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bundel</TableHead>
                  <TableHead>Klaar</TableHead>
                  <TableHead>Maakbaar uit voorraad</TableHead>
                  <TableHead>Totaal beschikbaar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availability.map((row) => (
                  <TableRow key={row.bundle_config_id}>
                    <TableCell className="font-medium">{row.bundle_name}</TableCell>
                    <TableCell><span className="inline-block rounded bg-green-100 px-2 py-1 text-green-800">{row.bundles_ready}</span></TableCell>
                    <TableCell><span className="inline-block rounded bg-yellow-100 px-2 py-1 text-yellow-800">{row.bundles_makeable}</span></TableCell>
                    <TableCell className="font-bold">{row.bundles_ready + row.bundles_makeable}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
