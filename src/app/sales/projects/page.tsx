"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ClientSelector } from "@/components/client-selector";
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
import Link from "next/link";
import { FolderOpen, Plus, ArrowUpRight } from "lucide-react";

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  clients: { name: string } | null;
  request_count: number;
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  completed: "bg-gray-100 text-gray-600",
  archived: "bg-amber-100 text-amber-800",
};

const statusLabels: Record<string, string> = {
  active: "Actief",
  completed: "Afgerond",
  archived: "Gearchiveerd",
};

export default function ProjectsPage() {
  const supabase = createClient();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [filterClient, setFilterClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");

  // New project form
  const [showForm, setShowForm] = useState(false);
  const [newClientId, setNewClientId] = useState("");
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function loadProjects() {
    let query = supabase
      .from("projects")
      .select("id, name, status, created_at, clients(name)")
      .order("created_at", { ascending: false });

    if (filterClient && filterClient !== "all") query = query.eq("client_id", filterClient);
    if (filterStatus && filterStatus !== "all") query = query.eq("status", filterStatus);

    const { data } = await query;
    const rows = (data ?? []) as any[];

    // Count requests per project
    const projectIds = rows.map((r) => r.id);
    const { data: reqCounts } = await supabase
      .from("bundle_requests")
      .select("project_id")
      .in("project_id", projectIds);

    const countMap: Record<string, number> = {};
    (reqCounts ?? []).forEach((r: any) => {
      countMap[r.project_id] = (countMap[r.project_id] ?? 0) + 1;
    });

    setProjects(
      rows.map((r) => ({ ...r, request_count: countMap[r.id] ?? 0 }))
    );
  }

  useEffect(() => {
    loadProjects();
    const channel = supabase
      .channel("projects-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => loadProjects())
      .on("postgres_changes", { event: "*", schema: "public", table: "bundle_requests" }, () => loadProjects())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClient, filterStatus]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientId || !newName.trim()) return;
    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("projects").insert({
      client_id: newClientId,
      name: newName.trim(),
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("success");
      setNewName("");
      setNewClientId("");
      setShowForm(false);
      loadProjects();
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl tracking-tight text-foreground">Projecten</h2>
          <p className="mt-1 text-sm text-muted-foreground">Klant-projecten en hun verzoeken</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-2" />
          Nieuw project
        </Button>
      </div>

      {/* New project form */}
      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nieuw project</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <ClientSelector onSelect={setNewClientId} value={newClientId} />
              <div className="space-y-2">
                <Label>Projectnaam</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Bijv. Stalenset Q2 2026"
                  required
                />
              </div>
              {status === "error" && <p className="text-sm text-red-600">{errorMsg}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={status === "saving" || !newClientId || !newName.trim()}>
                  {status === "saving" ? "Opslaan..." : "Aanmaken"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Annuleren
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

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
              <SelectItem value="active">Actief</SelectItem>
              <SelectItem value="completed">Afgerond</SelectItem>
              <SelectItem value="archived">Gearchiveerd</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Projects list */}
      {projects.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
          <FolderOpen size={32} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Geen projecten gevonden.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <Link key={project.id} href={`/sales/projects/${project.id}`} className="group block">
              <div className="flex items-center justify-between rounded-xl bg-card px-5 py-4 ring-1 ring-border transition-all duration-200 hover:shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <FolderOpen size={18} className="text-primary" />
                  </div>
                  <div>
                    <span className="font-medium text-card-foreground">{project.name}</span>
                    <div className="text-xs text-muted-foreground">{project.clients?.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {project.request_count} verzoek{project.request_count !== 1 ? "en" : ""}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[project.status] ?? ""}`}>
                    {statusLabels[project.status] ?? project.status}
                  </span>
                  <ArrowUpRight size={16} className="text-muted-foreground/30 transition-all group-hover:text-primary" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
