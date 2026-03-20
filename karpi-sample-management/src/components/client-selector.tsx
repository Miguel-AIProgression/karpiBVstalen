"use client";

interface ClientSelectorProps {
  onSelect: (clientId: string) => void;
  value?: string;
  label?: string;
}

export function ClientSelector({ label = "Klant" }: ClientSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <p className="text-sm text-muted-foreground">Klantbeheer wordt in een volgende fase opgebouwd.</p>
    </div>
  );
}
