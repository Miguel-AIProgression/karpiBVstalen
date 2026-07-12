"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, FileText, Check, X, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { InvoiceModal } from "@/components/invoice-modal";
import {
  isCredit,
  filterInvoices,
  sortInvoices,
  selectableInvoiceIds,
  deriveSelectAllState,
  orderIdsForSelection,
  uniqueClientNames,
  formatSignedInvoiceTotal,
  hasActiveInvoiceFilters,
  pruneSelectedIds,
  EMPTY_INVOICE_FILTERS,
  type InvoiceRow,
  type InvoiceFilters,
  type InvoiceTypeFilter,
  type InvoiceStatusFilter,
  type InvoiceSortField,
  type SortDir,
} from "./invoice-filters";

/* ─── Helpers ──────────────────────────────────────────── */

function formatDateNl(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** React ondersteunt `indeterminate` niet als prop — moet via DOM-ref. */
function useIndeterminateRef(indeterminate: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return ref;
}

interface RawInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  created_at: string;
  subtotal_cents: number;
  btw_cents: number;
  total_cents: number;
  btw_pct: number;
  sent_at: string | null;
  credited_invoice_id: string | null;
  credit_reason: string | null;
  order_id: string;
  client_id: string;
  clients: { name: string; client_number: string | null } | null;
  orders: { order_number: string } | null;
}

/* ─── Invoice Row ────────────────────────────────────── */

function InvoiceTableRow({
  inv,
  selected,
  onSelect,
  onOpen,
}: {
  inv: InvoiceRow;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (orderId: string, clientId: string) => void;
}) {
  const credit = isCredit(inv);
  return (
    <tr
      className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30 ${selected ? "bg-primary/5" : ""}`}
      onClick={() => onOpen(inv.order_id, inv.client_id)}
    >
      <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
        {!credit && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(inv.id, e.target.checked)}
            className="rounded border-border"
          />
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
            credit ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-700"
          }`}
        >
          {credit ? "Credit" : "Debet"}
        </span>
      </td>
      <td className="px-4 py-3 font-mono font-medium text-card-foreground">{inv.invoice_number}</td>
      <td className="px-4 py-3 text-card-foreground">{formatDateNl(inv.invoice_date)}</td>
      <td className="px-4 py-3">
        {inv.order_number ? (
          <Link
            href={`/orders/${inv.order_id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-primary hover:underline"
          >
            {inv.order_number}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-card-foreground">{inv.client_name}</td>
      <td className="px-4 py-3">
        {inv.sent_at ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <Check size={12} /> {formatDateNl(inv.sent_at.slice(0, 10))}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <X size={12} /> Niet gemaild
          </span>
        )}
      </td>
      <td className={`px-4 py-3 text-right font-medium ${credit ? "text-red-600" : "text-card-foreground"}`}>
        {formatSignedInvoiceTotal(inv)}
      </td>
      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <Button variant="outline" size="sm" onClick={() => onOpen(inv.order_id, inv.client_id)}>
          Bekijk
        </Button>
      </td>
    </tr>
  );
}

/* ─── Component ──────────────────────────────────────── */

export default function FacturatiePage() {
  const supabase = createClient();

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InvoiceFilters>(EMPTY_INVOICE_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<InvoiceSortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [csvExporting, setCsvExporting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalOrderId, setModalOrderId] = useState<string | null>(null);
  const [modalClientId, setModalClientId] = useState<string | null>(null);

  /* ─── Data loading ─── */

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await (supabase as any)
      .from("invoices")
      .select(
        "id, invoice_number, invoice_date, created_at, subtotal_cents, btw_cents, total_cents, btw_pct, sent_at, credited_invoice_id, credit_reason, order_id, client_id, clients(name, client_number), orders(order_number)"
      )
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000); // ponytail: plafond 2000; paginering pas als de lijst daar ooit overheen groeit

    if (error) {
      setLoadError(error.message ?? "Facturen ophalen is mislukt");
      setLoading(false);
      return;
    }

    const mapped: InvoiceRow[] = ((data ?? []) as RawInvoiceRow[]).map((row) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      created_at: row.created_at,
      subtotal_cents: row.subtotal_cents,
      btw_cents: row.btw_cents,
      total_cents: row.total_cents,
      btw_pct: row.btw_pct,
      sent_at: row.sent_at,
      credited_invoice_id: row.credited_invoice_id,
      credit_reason: row.credit_reason,
      order_id: row.order_id,
      client_id: row.client_id,
      client_name: row.clients?.name ?? "Onbekend",
      client_number: row.clients?.client_number ?? null,
      order_number: row.orders?.order_number ?? null,
    }));

    setInvoices(mapped);
    // Prune tegen de vers geladen lijst: na verwijderen/crediteren in de modal
    // mogen er geen wees-ids in de CSV-selectie achterblijven.
    setSelectedIds((prev) => pruneSelectedIds(prev, mapped));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  /* ─── Sorting ─── */

  const toggleSort = (field: InvoiceSortField) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortField(null);
        setSortDir("asc");
      }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: InvoiceSortField }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  /* ─── Filtering & sorting ─── */

  const uniqueClients = useMemo(() => uniqueClientNames(invoices), [invoices]);
  const filtered = useMemo(() => filterInvoices(invoices, filters), [invoices, filters]);
  const sorted = useMemo(() => sortInvoices(filtered, sortField, sortDir), [filtered, sortField, sortDir]);

  /* ─── Selectie ─── */

  const selectableIds = useMemo(() => selectableInvoiceIds(sorted), [sorted]);
  const selectAllState = useMemo(
    () => deriveSelectAllState(selectableIds, selectedIds),
    [selectableIds, selectedIds]
  );
  const selectAllRef = useIndeterminateRef(selectAllState === "some");

  function handleSelectRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleSelectAllToggle() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selectAllState === "all") {
        for (const id of selectableIds) next.delete(id);
      } else {
        for (const id of selectableIds) next.add(id);
      }
      return next;
    });
  }

  /* ─── AFAS CSV-export ─── */

  async function handleCsvExport() {
    if (csvExporting) return;
    setCsvExporting(true);
    try {
      const orderIds = orderIdsForSelection(invoices, selectedIds);
      const res = await fetch("/api/invoices/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds, btwPct: 21 }),
      });
      if (!res.ok) {
        alert("CSV export mislukt");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `afas-facturen-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setCsvExporting(false);
    }
  }

  /* ─── Detail-modal ─── */

  function openInvoiceModal(orderId: string, clientId: string) {
    setModalOrderId(orderId);
    setModalClientId(clientId);
    setModalOpen(true);
  }

  function handleModalOpenChange(open: boolean) {
    setModalOpen(open);
    if (!open) {
      // sent_at/credits kunnen in de modal gewijzigd zijn — lijst herladen.
      loadInvoices();
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">Facturen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoices.length} factu{invoices.length === 1 ? "ur" : "ren"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCsvExport} disabled={selectedIds.size === 0 || csvExporting}>
            <Download size={14} /> {csvExporting ? "Bezig..." : `AFAS CSV (${selectedIds.size})`}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Zoekbalk */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={16} className="absolute left-2.5 top-2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Zoek op factuurnr of klant…"
            className="pl-8"
          />
        </div>

        {/* Type knoppen */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {(["all", "debit", "credit"] as InvoiceTypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilters((f) => ({ ...f, type: t }))}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filters.type === t
                  ? t === "credit"
                    ? "bg-purple-600 text-white"
                    : t === "debit"
                      ? "bg-gray-700 text-white"
                      : "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-foreground/5"
              }`}
            >
              {t === "all" ? "Alle types" : t === "debit" ? "Debet" : "Credit"}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as InvoiceStatusFilter }))}
          className={`rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring ${filters.status !== "all" ? "border-primary bg-primary/5 font-medium text-primary" : "border-border bg-card text-card-foreground"}`}
        >
          <option value="all">Alle</option>
          <option value="sent">Gemaild</option>
          <option value="unsent">Niet gemaild</option>
        </select>

        {/* Klant filter */}
        <select
          value={filters.client}
          onChange={(e) => setFilters((f) => ({ ...f, client: e.target.value }))}
          className={`rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring ${filters.client ? "border-primary bg-primary/5 font-medium text-primary" : "border-border bg-card text-card-foreground"}`}
        >
          <option value="">Alle klanten</option>
          {uniqueClients.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {/* Datum van/tot */}
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            className="w-auto"
          />
          <span className="text-sm text-muted-foreground">t/m</span>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            className="w-auto"
          />
        </div>

        {/* Filter wissen */}
        {hasActiveInvoiceFilters(filters) && (
          <button
            onClick={() => setFilters(EMPTY_INVOICE_FILTERS)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            title="Filters wissen"
          >
            <X size={14} /> Wis filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      ) : loadError ? (
        <div className="rounded-2xl bg-red-50 p-8 text-center ring-1 ring-red-200">
          <p className="text-sm text-red-700">Facturen ophalen is mislukt: {loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={loadInvoices}>
            Opnieuw proberen
          </Button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <FileText size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {invoices.length === 0 ? "Nog geen facturen." : "Geen facturen gevonden voor deze filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="pl-4 pr-2 py-3 w-8">
                    <input
                      type="checkbox"
                      ref={selectAllRef}
                      checked={selectAllState === "all"}
                      onChange={handleSelectAllToggle}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("invoice_number")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Factuurnr <SortIcon field="invoice_number" />
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("invoice_date")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Datum <SortIcon field="invoice_date" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Order</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Klant</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Gemaild</th>
                  <th
                    className="px-4 py-3 text-right font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("total_cents")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Totaal <SortIcon field="total_cents" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Acties</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((inv) => (
                  <InvoiceTableRow
                    key={inv.id}
                    inv={inv}
                    selected={selectedIds.has(inv.id)}
                    onSelect={handleSelectRow}
                    onOpen={openInvoiceModal}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      {!loading && sorted.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {sorted.length} factu{sorted.length === 1 ? "ur" : "ren"} gevonden
        </div>
      )}

      {/* Modal */}
      {modalOrderId && modalClientId && (
        <InvoiceModal
          orderId={modalOrderId}
          clientId={modalClientId}
          open={modalOpen}
          onOpenChange={handleModalOpenChange}
        />
      )}
    </div>
  );
}
