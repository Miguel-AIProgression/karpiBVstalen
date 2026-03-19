"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface PipelineRow {
  quality_name: string;
  color_code: string;
  color_name: string;
  dimension_name: string;
  raw_stock_total: number;
  finished_stock_total: number;
}

export default function DeliveryPage() {
  const supabase = createClient();
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);

  useEffect(() => {
    supabase.from("v_pipeline_status").select("*").order("quality_name")
      .then(({ data }) => setPipeline((data as PipelineRow[]) ?? []));
  // supabase is a singleton — stable reference, intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Levertijden & Pipeline</h2>
      <Card>
        <CardHeader><CardTitle>Pipeline-overzicht per product</CardTitle></CardHeader>
        <CardContent>
          {pipeline.length === 0 ? (
            <p className="text-sm text-gray-500">Geen data beschikbaar.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kwaliteit</TableHead>
                  <TableHead>Kleur</TableHead>
                  <TableHead>Maat</TableHead>
                  <TableHead>Gesneden</TableHead>
                  <TableHead>Afgewerkt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pipeline.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.quality_name}</TableCell>
                    <TableCell>{row.color_code} — {row.color_name}</TableCell>
                    <TableCell>{row.dimension_name}</TableCell>
                    <TableCell><span className="inline-block rounded bg-orange-100 px-2 py-1 text-orange-800">{row.raw_stock_total}</span></TableCell>
                    <TableCell><span className="inline-block rounded bg-yellow-100 px-2 py-1 text-yellow-800">{row.finished_stock_total}</span></TableCell>
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
