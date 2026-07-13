"use client";

// Vervang-bevestiging voor een volledig gecrediteerde factuur (ICL/vervang-flow,
// migratie 20260713_icl_en_herfactureren.sql — RPC supersede_invoice). Alleen
// zichtbaar/aanroepbaar voor sales/admin op een factuur met remainingCreditCents
// ≤ 1 cent — de knop in invoice-modal.tsx bewaakt die voorwaarde al, deze dialoog
// bewaakt verder niets extra's (server-side guard = de supersede_invoice-RPC via
// de POST-route). Zelfde patroon als delete-invoice-dialog.tsx.
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SupersedeInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  onSuperseded: () => void;
}

export function SupersedeInvoiceDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  onSuperseded,
}: SupersedeInvoiceDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoiceId}/supersede`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Fout bij vervangen");
      return;
    }
    onOpenChange(false);
    onSuperseded();
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Factuur vervangen?</AlertDialogTitle>
          <AlertDialogDescription>
            Factuur {invoiceNumber} is volledig gecrediteerd en wordt gemarkeerd als vervangen.
            Daarna kan een nieuwe factuur voor deze order aangemaakt worden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuleren</AlertDialogCancel>
          <AlertDialogAction onClick={() => { handleConfirm(); }} disabled={busy}>
            {busy ? "Bezig..." : "Vervangen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
