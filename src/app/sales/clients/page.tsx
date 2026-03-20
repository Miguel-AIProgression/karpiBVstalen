"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft } from "lucide-react";

interface Client {
  id: string;
  name: string;
  client_number: string | null;
  client_type: string;
  contact_email: string | null;
  active: boolean;
}

interface QualityName {
  custom_name: string;
  qualities: {
    code: string;
    name: string;
  };
}

export default function ClientsPage() {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [qualityNames, setQualityNames] = useState<QualityName[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [qualitySearch, setQualitySearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name, client_number, client_type, contact_email, active")
      .order("name")
      .then(({ data }) => {
        setClients((data as Client[]) ?? []);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadQualityNames = useCallback(
    async (clientId: string) => {
      const { data } = await supabase
        .from("client_quality_names")
        .select("custom_name, qualities(code, name)")
        .eq("client_id", clientId)
        .order("custom_name");
      setQualityNames((data as QualityName[]) ?? []);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const selectClient = useCallback(
    (client: Client) => {
      setSelectedClient(client);
      setQualitySearch("");
      loadQualityNames(client.id);
    },
    [loadQualityNames]
  );

  const filteredClients = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.client_number && c.client_number.includes(q))
    );
  }, [clients, search]);

  const filteredQualityNames = useMemo(() => {
    if (!qualitySearch) return qualityNames;
    const q = qualitySearch.toLowerCase();
    return qualityNames.filter(
      (qn) =>
        qn.custom_name.toLowerCase().includes(q) ||
        qn.qualities.code.toLowerCase().includes(q) ||
        qn.qualities.name.toLowerCase().includes(q)
    );
  }, [qualityNames, qualitySearch]);

  // --- Detail view ---
  if (selectedClient) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            onClick={() => {
              setSelectedClient(null);
              setQualityNames([]);
            }}
          >
            <ArrowLeft className="inline h-4 w-4 mr-1" />
            Alle klanten
          </button>
        </div>

        <div className="space-y-1">
          <h2 className="font-display text-3xl tracking-tight text-foreground">
            {selectedClient.name}
          </h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {selectedClient.client_number && (
              <span className="font-mono">{selectedClient.client_number}</span>
            )}
            <Badge variant="outline" className="text-xs capitalize">
              {selectedClient.client_type}
            </Badge>
            {selectedClient.contact_email && (
              <span>{selectedClient.contact_email}</span>
            )}
          </div>
        </div>

        {/* Quality names section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Eigen productnamen
            </h3>
            <span className="text-xs text-muted-foreground">
              {qualityNames.length} kwaliteit{qualityNames.length !== 1 ? "en" : ""}
            </span>
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Zoek op naam of kwaliteit..."
              value={qualitySearch}
              onChange={(e) => setQualitySearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-white pl-9 pr-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[30%]">Klant-naam</TableHead>
                  <TableHead className="w-[15%]">Code</TableHead>
                  <TableHead>Karpi-naam</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQualityNames.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {qualitySearch
                        ? "Geen resultaten gevonden."
                        : "Geen eigen productnamen voor deze klant."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredQualityNames.map((qn) => (
                    <TableRow key={qn.qualities.code}>
                      <TableCell className="font-medium">
                        {qn.custom_name}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {qn.qualities.code}
                        </span>
                      </TableCell>
                      <TableCell>{qn.qualities.name}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  }

  // --- List view ---
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-3xl tracking-tight text-foreground">
          Klanten
        </h2>
        <p className="text-sm text-muted-foreground">
          {clients.length} klanten met eigen productnamen.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Zoek op naam of klantnummer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-white pl-9 pr-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[15%]">Nummer</TableHead>
                <TableHead>Naam</TableHead>
                <TableHead className="w-[15%]">Type</TableHead>
                <TableHead className="w-[10%] text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {search
                      ? "Geen klanten gevonden."
                      : "Nog geen klanten aangemaakt."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredClients.map((client) => (
                  <TableRow
                    key={client.id}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => selectClient(client)}
                  >
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {client.client_number ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {client.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {client.client_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          client.active ? "bg-green-500" : "bg-gray-300"
                        }`}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
