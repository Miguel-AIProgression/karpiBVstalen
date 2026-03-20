"use client";

import React from "react";
import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, AlertCircle } from "lucide-react";

interface Quality { id: string; name: string; code: string; }
interface ColorCode { id: string; code: string; name: string; quality_id: string; }

interface ProductsTabProps {
  qualities: Quality[];
  colorCodes: ColorCode[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function ProductsTab({ qualities, colorCodes, loading, error, onRetry }: ProductsTabProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (error) {
    return (
      <div className="rounded-xl bg-card p-8 text-center ring-1 ring-border">
        <AlertCircle size={32} className="mx-auto mb-3 text-red-500/50" />
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>Opnieuw proberen</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-10" />
            <TableHead>Kwaliteit</TableHead>
            <TableHead>Code</TableHead>
            <TableHead className="text-center">Kleuren</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell />
              {[1, 2, 3].map((j) => (
                <TableCell key={j}><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Producten worden beheerd via Productie &rarr; Overzicht. Hier zie je een overzicht.
      </p>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-10" />
            <TableHead>Kwaliteit</TableHead>
            <TableHead>Code</TableHead>
            <TableHead className="text-center">Kleuren</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {qualities.map((q) => {
            const colors = colorCodes.filter((cc) => cc.quality_id === q.id);
            const expanded = expandedRows.has(q.id);
            return (
              <React.Fragment key={q.id}>
                <TableRow className="cursor-pointer" onClick={() => toggleExpand(q.id)}>
                  <TableCell className="w-10">
                    {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-medium">{q.name}</TableCell>
                  <TableCell className="text-muted-foreground">{q.code}</TableCell>
                  <TableCell className="text-center">{colors.length}</TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell />
                    <TableCell colSpan={3} className="pt-0">
                      <div className="flex flex-wrap gap-1.5 py-1">
                        {colors.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Geen kleuren</p>
                        ) : colors.map((c) => (
                          <span key={c.id} className="inline-flex items-center rounded-md bg-muted/50 px-2.5 py-1 text-xs ring-1 ring-border/40">
                            {c.code} — {c.name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
