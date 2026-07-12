"use client";

// Verwijder-bevestiging voor een niet-gemailde factuur (wayfinder-ticket 007).
// Alleen zichtbaar/aanroepbaar voor sales/admin op een factuur zonder sent_at —
// de knop in invoice-modal.tsx bewaakt die voorwaarde al, deze dialoog bewaakt
// verder niets extra's (server-side guard = checkInvoiceDeletable in de DELETE-route).
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

interface DeleteInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  onDeleted: () => void;
}

export function DeleteInvoiceDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  onDeleted,
}: DeleteInvoiceDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      setError(json.error ?? "Fout bij verwijderen");
      return;
    }
    onOpenChange(false);
    onDeleted();
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Factuur verwijderen?</AlertDialogTitle>
          <AlertDialogDescription>
            Factuur {invoiceNumber} wordt definitief verwijderd. Dit kan niet ongedaan worden gemaakt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Annuleren</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { handleDelete(); }}
            disabled={deleting}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {deleting ? "Verwijderen..." : "Verwijderen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
