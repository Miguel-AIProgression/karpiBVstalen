"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ClientSelector } from "@/components/client-selector";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ClipboardList, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";

interface RequestRow {
  request_id: string;
  project_id: string;
  project_name: string;
  client_name: string;
  bundle_name: string;
  requested: number;
  reserved: number;
  shortage: number;
  available_stock: number;
  status: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  ready: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  pending: "In afwachting",
  ready: "Klaar",
  fulfilled: "Afgehandeld",
  cancelled: "Geannuleerd",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock size={12} />,
  ready: <CheckCircle size={12} />,
  fulfilled: <CheckCircle size={12} />,
  cancelled: <XCircle size={12} />,
};

export default function AllRequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [filterClient, setFilterClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("pending");

  async function loadRequests() {
    let query = supabase
      .from("v_request_overview")
      .select("*")
      .order("created_at", { ascending: true });

    if (filterStatus && filterStatus !== "all") query = query.eq("status", filterStatus);
    if (filterClient && filterClient !== "all") query = query.eq("client_id", filterClient);

    const { data } = await query;
    setRequests((data as RequestRow[]) ?? []);
  }

  useEffect(() => {
    loadRequests();
    const channel = supabase
      .channel("all-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_requests" }, () => loadRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_reservations" }, () => loadRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_stock" }, () => loadRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClient, filterStatus]);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-3xl tracking-tight text-foreground">Alle verzoeken</h2>
        <p className="mt-1 text-sm text-muted-foreground">Overzicht van alle bundelverzoeken</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="w-64">
          <ClientSelector onSelect={setFilterClient} value={filterClient} label="Filter op klant" />
        </div>
        <div className="w-48 space-y-2">
          <Label>Status</Label>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">In afwachting</SelectItem>
              <SelectItem value="ready">Klaar</SelectItem>
              <SelectItem value="fulfilled">Afgehandeld</SelectItem>
              <SelectItem value="cancelled">Geannuleerd</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {requests.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <ClipboardList size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Geen verzoeken gevonden.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Klant</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Project</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bundel-recept</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gevraagd</th>
                <th className="px-4 py-3 text-right font-medium text-emerald-700">Gereserveerd</th>
                <th className="px-4 py-3 text-right font-medium text-amber-700">Tekort</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.request_id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 text-card-foreground">{req.client_name}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/sales/projects/${req.project_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {req.project_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-card-foreground">{req.bundle_name}</td>
                  <td className="px-4 py-3 text-right text-card-foreground">{req.requested}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      {req.reserved}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {req.shortage > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        <AlertTriangle size={12} />
                        {req.shortage}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[req.status] ?? ""}`}>
                      {statusIcons[req.status]}
                      {statusLabels[req.status] ?? req.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
