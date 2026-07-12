// Pure filter-/sorteer-/selectielogica voor de Facturatie-pagina. Los van React
// gehouden zodat dit met vitest getest kan worden — de pagina zelf heeft geen
// testrunner (zie CLAUDE.md werkwijze-afspraak).
import { formatCents } from "@/lib/invoice-data";

export interface InvoiceRow {
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
  client_name: string;
  client_number: string | null;
  order_number: string | null;
}

/** Creditnota = invoices-rij met credited_invoice_id gevuld (bedragen zijn dan <= 0). */
export function isCredit(inv: Pick<InvoiceRow, "credited_invoice_id">): boolean {
  return inv.credited_invoice_id !== null;
}

export type InvoiceTypeFilter = "all" | "debit" | "credit";
export type InvoiceStatusFilter = "all" | "sent" | "unsent";

export interface InvoiceFilters {
  search: string;
  type: InvoiceTypeFilter;
  status: InvoiceStatusFilter;
  /** Klantnaam, "" = alle klanten. */
  client: string;
  /** ISO-datum (yyyy-mm-dd) of "" voor geen ondergrens. */
  dateFrom: string;
  /** ISO-datum (yyyy-mm-dd) of "" voor geen bovengrens. */
  dateTo: string;
}

export const EMPTY_INVOICE_FILTERS: InvoiceFilters = {
  search: "",
  type: "all",
  status: "all",
  client: "",
  dateFrom: "",
  dateTo: "",
};

export function hasActiveInvoiceFilters(filters: InvoiceFilters): boolean {
  return (
    filters.search !== "" ||
    filters.type !== "all" ||
    filters.status !== "all" ||
    filters.client !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== ""
  );
}

function matchesInvoiceFilters(inv: InvoiceRow, filters: InvoiceFilters): boolean {
  const credit = isCredit(inv);
  if (filters.type === "debit" && credit) return false;
  if (filters.type === "credit" && !credit) return false;
  if (filters.status === "sent" && !inv.sent_at) return false;
  if (filters.status === "unsent" && inv.sent_at) return false;
  if (filters.client && inv.client_name !== filters.client) return false;
  if (filters.dateFrom && inv.invoice_date < filters.dateFrom) return false;
  if (filters.dateTo && inv.invoice_date > filters.dateTo) return false;
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    if (q) {
      const inNumber = inv.invoice_number.toLowerCase().includes(q);
      const inClient = inv.client_name.toLowerCase().includes(q);
      if (!inNumber && !inClient) return false;
    }
  }
  return true;
}

export function filterInvoices(invoices: InvoiceRow[], filters: InvoiceFilters): InvoiceRow[] {
  return invoices.filter((inv) => matchesInvoiceFilters(inv, filters));
}

export type InvoiceSortField = "invoice_number" | "invoice_date" | "total_cents" | null;
export type SortDir = "asc" | "desc";

/**
 * Default (field = null): invoice_date desc, tiebreak created_at desc.
 * Met een gekozen sorteerveld geldt `dir` gewoon op dat veld; bij invoice_date
 * blijft created_at de tiebreak (zelfde datum, meerdere facturen op een dag).
 */
export function sortInvoices(invoices: InvoiceRow[], field: InvoiceSortField, dir: SortDir): InvoiceRow[] {
  const sorted = [...invoices];
  if (!field) {
    sorted.sort(
      (a, b) => b.invoice_date.localeCompare(a.invoice_date) || b.created_at.localeCompare(a.created_at)
    );
    return sorted;
  }
  sorted.sort((a, b) => {
    let cmp = 0;
    if (field === "invoice_number") cmp = a.invoice_number.localeCompare(b.invoice_number);
    else if (field === "invoice_date") {
      cmp = a.invoice_date.localeCompare(b.invoice_date) || a.created_at.localeCompare(b.created_at);
    } else if (field === "total_cents") cmp = a.total_cents - b.total_cents;
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

/** Alleen debetfacturen mogen in de AFAS-CSV — credits zijn nooit selecteerbaar. */
export function selectableInvoiceIds(invoices: InvoiceRow[]): string[] {
  return invoices.filter((inv) => !isCredit(inv)).map((inv) => inv.id);
}

export type SelectAllState = "all" | "some" | "none";

/** Aansturing voor de select-all-checkbox in de tabelkop (incl. indeterminate). */
export function deriveSelectAllState(selectableIds: string[], selectedIds: Set<string>): SelectAllState {
  if (selectableIds.length === 0) return "none";
  const selectedCount = selectableIds.filter((id) => selectedIds.has(id)).length;
  if (selectedCount === 0) return "none";
  if (selectedCount === selectableIds.length) return "all";
  return "some";
}

/** order_id's van de geselecteerde facturen, voor de AFAS-CSV-export. */
export function orderIdsForSelection(invoices: InvoiceRow[], selectedIds: Set<string>): string[] {
  return invoices.filter((inv) => selectedIds.has(inv.id)).map((inv) => inv.order_id);
}

export function uniqueClientNames(invoices: InvoiceRow[]): string[] {
  return [...new Set(invoices.map((inv) => inv.client_name))].sort((a, b) => a.localeCompare(b, "nl"));
}

/**
 * Verwijdert ids uit een selectie die niet (meer) in de vers geladen lijst
 * voorkomen — na een herlaad (bv. na verwijderen/crediteren in de modal) mag de
 * CSV-selectie geen weeswaarden meer bevatten.
 */
export function pruneSelectedIds(selectedIds: Set<string>, freshInvoices: InvoiceRow[]): Set<string> {
  const existingIds = new Set(freshInvoices.map((inv) => inv.id));
  const next = new Set<string>();
  for (const id of selectedIds) {
    if (existingIds.has(id)) next.add(id);
  }
  return next;
}

/** Totaal met "− "-prefix (op de absolute waarde) en rood voor creditnota's. */
export function formatSignedInvoiceTotal(inv: Pick<InvoiceRow, "total_cents" | "credited_invoice_id">): string {
  if (isCredit(inv)) return "− " + formatCents(Math.abs(inv.total_cents));
  return formatCents(inv.total_cents);
}
