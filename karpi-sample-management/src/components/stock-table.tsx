"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface StockRow {
  id: string;
  [key: string]: unknown;
}

interface StockTableProps {
  title: string;
  columns: { key: string; label: string }[];
  rows: StockRow[];
}

export function StockTable({ title, columns, rows }: StockTableProps) {
  return (
    <div>
      {title && <h3 className="text-lg font-semibold mb-3">{title}</h3>}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Geen voorraad gevonden.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (<TableHead key={col.key}>{col.label}</TableHead>))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((col) => (<TableCell key={col.key}>{String(row[col.key] ?? "")}</TableCell>))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
