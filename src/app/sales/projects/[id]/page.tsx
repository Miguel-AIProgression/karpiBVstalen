"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Package, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  status: string;
  notes: string | null;
  client_id: string;
  clients: { name: string } | null;
}

interface RequestRow {
  request_id: string;
  bundle_config_id: string;
  bundle_name: string;
  requested: number;
  reserved: number;
  shortage: number;
  available_stock: number;
  status: string;
  created_at: string;
}

interface BundleConfig {
  id: string;
  name: string;
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
  pending: <Clock size={14} />,
  ready: <CheckCircle size={14} />,
  fulfilled: <CheckCircle size={14} />,
  cancelled: <XCircle size={14} />,
};

export default function ProjectDetailPage() {
  const supabase = createClient();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [configs, setConfigs] = useState<BundleConfig[]>([]);

  // New request form
  const [showForm, setShowForm] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState("");
  const [quantity, setQuantity] = useState("");
  const [formStatus, setFormStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function loadProject() {
    const { data } = await supabase
      .from("projects")
      .select("id, name, status, notes, client_id, clients(name)")
      .eq("id", projectId)
      .single();
    setProject(data as any);

    if (data) {
      // Load bundle configs for this client
      const { data: cfgs } = await supabase
        .from("bundle_configs")
        .select("id, name")
        .eq("client_id", (data as any).client_id)
        .eq("active", true)
        .order("name");
      setConfigs(cfgs ?? []);
    }
  }

  async function loadRequests() {
    const { data } = await supabase
      .from("v_request_overview")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at");
    setRequests((data as RequestRow[]) ?? []);
  }

  useEffect(() => {
    loadProject();
    loadRequests();
    const channel = supabase
      .channel(`project-detail-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_requests" }, () => loadRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_reservations" }, () => loadRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_stock" }, () => loadRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    const qty = Math.round(Number(quantity));
    if (!qty || qty < 1 || !Number.isFinite(qty)) {
      setFormStatus("error");
      setErrorMsg("Voer een geldig aantal in (geheel getal, minimaal 1)");
      return;
    }
    setFormStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("bundle_requests").insert({
      project_id: projectId,
      bundle_config_id: selectedConfig,
      quantity: qty,
    });

    if (error) {
      setFormStatus("error");
      setErrorMsg(error.message);
    } else {
      setFormStatus("success");
      setQuantity("");
      setSelectedConfig("");
      setShowForm(false);
      loadRequests();
    }
  }

  async function updateRequestStatus(requestId: string, newStatus: string) {
    await supabase
      .from("bundle_requests")
      .update({ status: newStatus })
      .eq("id", requestId);
    loadRequests();
  }

  if (!project) {
    return <div className="text-sm text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/sales/projects"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Terug naar projecten
        </Link>
        <h2 className="font-display text-3xl tracking-tight text-foreground">{project.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{project.clients?.name}</p>
      </div>

      {/* Add request button */}
      <div className="flex gap-2">
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-2" />
          Verzoek toevoegen
        </Button>
      </div>

      {/* New request form */}
      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nieuw verzoek</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div className="space-y-2">
                <Label>Bundel-recept</Label>
                <Select value={selectedConfig} onValueChange={(v) => setSelectedConfig(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecteer bundel-recept" />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {configs.length === 0 && (
                  <p className="text-xs text-muted-foreground">Geen bundel-recepten voor deze klant.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Aantal bundels</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Aantal"
                  required
                />
              </div>
              {formStatus === "error" && <p className="text-sm text-red-600">{errorMsg}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={formStatus === "saving" || !selectedConfig || !quantity}>
                  {formStatus === "saving" ? "Opslaan..." : "Indienen"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Annuleren
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Requests table */}
      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
          Verzoeken
        </h3>
        {requests.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
            <Package size={32} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nog geen verzoeken voor dit project.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bundel-recept</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gevraagd</th>
                  <th className="px-4 py-3 text-right font-medium text-emerald-700">Gereserveerd</th>
                  <th className="px-4 py-3 text-right font-medium text-amber-700">Tekort</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Vrij op voorraad</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acties</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.request_id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-card-foreground">{req.bundle_name}</td>
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
                    <td className="px-4 py-3 text-right text-muted-foreground">{req.available_stock}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[req.status] ?? ""}`}>
                        {statusIcons[req.status]}
                        {statusLabels[req.status] ?? req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {req.status === "ready" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateRequestStatus(req.request_id, "fulfilled")}
                            className="text-xs"
                          >
                            Afhandelen
                          </Button>
                        )}
                        {(req.status === "pending" || req.status === "ready") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateRequestStatus(req.request_id, "cancelled")}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Annuleren
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
