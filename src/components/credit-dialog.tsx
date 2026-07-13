"use client";

// Creditnota-dialoog (wayfinder-ticket 006). Twee modi: hele/deel-regels crediteren
// (op basis van de onveranderlijke invoice_lines-snapshot) of een vrij bedrag.
// Live totaal-preview spiegelt exact de RPC via src/lib/credit-calc.ts.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCents } from "@/lib/invoice-data";
import {
  creditAmountForLine,
  computeCreditTotals,
  remainingCreditCents,
  parseEuroInputToCents,
  type LineCreditSelection,
} from "@/lib/credit-calc";
import type { StoredInvoice } from "@/components/invoice-modal";

interface InvoiceLineRow {
  id: string;
  description: string;
  article_number: string | null;
  quantity: number;
  unit_price_cents: number | null;
  amount_cents: number;
  position: number;
}

interface CreditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: StoredInvoice;
  /** total_cents van eerder aangemaakte creditnota's op deze factuur (negatief). */
  existingCreditTotals: number[];
  /** Standaard-ontvangeradres van de klant/order — vooringevuld, aanpasbaar (feedback Nando 13-07). */
  defaultEmail: string | null;
  onCreated: () => void;
}

type Mode = "lines" | "free_amount";

export function CreditDialog({ open, onOpenChange, invoice, existingCreditTotals, defaultEmail, onCreated }: CreditDialogProps) {
  const supabase = createClient();

  const [lines, setLines] = useState<InvoiceLineRow[]>([]);
  const [loadingLines, setLoadingLines] = useState(true);
  const [linesError, setLinesError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("lines");

  const [checkedLines, setCheckedLines] = useState<Record<string, boolean>>({});
  const [creditQty, setCreditQty] = useState<Record<string, number>>({});

  const [freeAmountInput, setFreeAmountInput] = useState("");
  const [freeInclBtw, setFreeInclBtw] = useState(false);
  const [freeDescription, setFreeDescription] = useState("");

  const [reason, setReason] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [emailTo, setEmailTo] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mailError, setMailError] = useState<string | null>(null);
  const [resendingMail, setResendingMail] = useState(false);

  // Gevuld zodra de create-POST slaagt — blokkeert een tweede create vanuit
  // dezelfde dialog-sessie (C1) en schakelt de UI om naar het succes-blok.
  const [createdCreditId, setCreatedCreditId] = useState<string | null>(null);
  const [createdInvoiceNumber, setCreatedInvoiceNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Verse state bij elke opening — voorkomt stale selecties van een vorige credit.
    setCheckedLines({});
    setCreditQty({});
    setFreeAmountInput("");
    setFreeInclBtw(false);
    setFreeDescription("");
    setReason("");
    setSendEmail(true);
    setEmailTo(defaultEmail ?? "");
    setSubmitError(null);
    setMailError(null);
    setSubmitting(false);
    setResendingMail(false);
    setCreatedCreditId(null);
    setCreatedInvoiceNumber(null);
    setLinesError(null);

    let cancelled = false;
    setLoadingLines(true);
    supabase
      .from("invoice_lines" as any)
      .select("id, description, article_number, quantity, unit_price_cents, amount_cents, position")
      .eq("invoice_id", invoice.id)
      .order("position")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLinesError(error.message ?? "Fout bij ophalen factuurregels");
          setLines([]);
          setMode("free_amount");
          setLoadingLines(false);
          return;
        }
        const rows = (data ?? []) as unknown as InvoiceLineRow[];
        setLines(rows);
        const initialQty: Record<string, number> = {};
        rows.forEach(l => { initialQty[l.id] = l.quantity; });
        setCreditQty(initialQty);
        setMode(rows.length > 0 ? "lines" : "free_amount");
        setLoadingLines(false);
      });
    return () => { cancelled = true; };
  }, [open, invoice.id, supabase, defaultEmail]);

  const remaining = remainingCreditCents(invoice.total_cents, existingCreditTotals);

  const selections: LineCreditSelection[] = lines
    .filter(l => checkedLines[l.id])
    .map(l => ({
      line: { quantity: l.quantity, amountCents: l.amount_cents },
      creditQuantity: creditQty[l.id] ?? l.quantity,
    }));

  const parsedFreeAmountCents = parseEuroInputToCents(freeAmountInput);
  const freeAmountInvalid = freeAmountInput.trim() !== "" && parsedFreeAmountCents === null;
  const freeAmountCents = parsedFreeAmountCents ?? 0;

  const totals =
    mode === "lines"
      ? computeCreditTotals({
          mode: "lines",
          selections,
          original: {
            subtotalCents: invoice.subtotal_cents,
            btwCents: invoice.btw_cents,
            totalCents: invoice.total_cents,
            btwPct: invoice.btw_pct,
          },
        })
      : computeCreditTotals({
          mode: "free_amount",
          amountCents: freeAmountCents,
          inclBtw: freeInclBtw,
          btwPct: invoice.btw_pct,
        });

  const linesValid =
    mode === "lines" &&
    selections.length > 0 &&
    selections.every(s => s.creditQuantity > 0 && s.creditQuantity <= s.line.quantity);
  const freeValid =
    mode === "free_amount" && !freeAmountInvalid && freeAmountCents > 0 && freeDescription.trim() !== "";
  const withinLimit = Math.abs(totals.totalCents) <= remaining + 1;
  const canSubmit = (linesValid || freeValid) && withinLimit && !submitting && createdCreditId == null;

  function toggleLine(lineId: string, checked: boolean) {
    setCheckedLines(prev => ({ ...prev, [lineId]: checked }));
  }

  function setQty(lineId: string, qty: number) {
    setCreditQty(prev => ({ ...prev, [lineId]: qty }));
  }

  async function handleSubmit() {
    // Hard guard (C1): na een geslaagde create mag deze sessie er nooit een tweede
    // maken, ook niet via een dubbele klik of een hertekende knop.
    if (createdCreditId != null) return;

    setSubmitting(true);
    setSubmitError(null);
    setMailError(null);

    const body: Record<string, unknown> = { invoiceId: invoice.id };
    if (mode === "lines") {
      body.lineCredits = lines
        .filter(l => checkedLines[l.id])
        .map(l => ({ lineId: l.id, quantity: creditQty[l.id] ?? l.quantity }));
    } else {
      body.freeAmountCents = freeAmountCents;
      body.freeAmountInclBtw = freeInclBtw;
      body.freeDescription = freeDescription.trim();
    }
    if (reason.trim()) body.reason = reason.trim();

    const res = await fetch("/api/invoices/credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSubmitError(json.error ?? "Fout bij crediteren");
      setSubmitting(false);
      return;
    }

    // (M1) De route retourneert altijd { creditInvoiceId, invoiceNumber } — geen
    // fallback-vormen meer nodig.
    const creditInvoiceId: string = json.creditInvoiceId;
    setCreatedCreditId(creditInvoiceId);
    setCreatedInvoiceNumber(json.invoiceNumber ?? null);
    onCreated();

    if (sendEmail) {
      const mailRes = await fetch("/api/invoices/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: creditInvoiceId, to: emailTo.trim() }),
      });
      if (!mailRes.ok) {
        const mailJson = await mailRes.json().catch(() => ({}));
        setMailError(mailJson.error ?? "Creditnota is aangemaakt, maar mailen is mislukt.");
      }
    }

    setSubmitting(false);
  }

  /** Retry-knop in het succes-blok als het direct-mailen na de create faalde. */
  async function handleResendMail() {
    if (!createdCreditId) return;
    setResendingMail(true);
    setMailError(null);
    const res = await fetch("/api/invoices/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: createdCreditId, to: emailTo.trim() }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMailError(json.error ?? "Mailen is opnieuw mislukt.");
    }
    setResendingMail(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Creditnota — {invoice.invoice_number}</DialogTitle>
          <DialogDescription>
            {createdCreditId != null ? "Creditnota aangemaakt" : `Resterend crediteerbaar: ${formatCents(remaining)}`}
          </DialogDescription>
        </DialogHeader>

        {createdCreditId != null ? (
          // Succes-blok (C1): het formulier is weg zodra de create is gelukt — er is
          // geen weg terug naar een tweede create vanuit deze dialog-sessie.
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              Creditnota {createdInvoiceNumber ?? ""} aangemaakt.
            </div>
            {mailError && (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 flex flex-col items-start gap-2">
                <span>{mailError}</span>
                <Button size="sm" variant="outline" onClick={handleResendMail} disabled={resendingMail}>
                  {resendingMail ? "Bezig..." : "Opnieuw mailen"}
                </Button>
              </div>
            )}
          </div>
        ) : loadingLines ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : (
          <div className="flex flex-col gap-4">
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              className="flex gap-6"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="lines" disabled={lines.length === 0} />
                Regels crediteren
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="free_amount" />
                Vrij bedrag
              </label>
            </RadioGroup>

            {linesError ? (
              <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                Factuurregels ophalen is mislukt: {linesError}
              </p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                Deze factuur heeft nog geen regel-snapshot — crediteer via vrij bedrag.
              </p>
            ) : null}

            {mode === "lines" && lines.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="w-8 px-2 py-1.5"></th>
                      <th className="text-left px-2 py-1.5 font-medium">Omschrijving</th>
                      <th className="text-right px-2 py-1.5 font-medium w-24">Aantal</th>
                      <th className="text-right px-2 py-1.5 font-medium w-28">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => {
                      const checked = Boolean(checkedLines[l.id]);
                      const qty = creditQty[l.id] ?? l.quantity;
                      const preview = checked ? -creditAmountForLine({ quantity: l.quantity, amountCents: l.amount_cents }, qty) : 0;
                      return (
                        <tr key={l.id} className="border-t border-border">
                          <td className="px-2 py-1.5 align-top">
                            <Checkbox checked={checked} onCheckedChange={(v) => toggleLine(l.id, Boolean(v))} />
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            <div>{l.description}</div>
                            {l.article_number && <div className="text-xs text-muted-foreground">{l.article_number}</div>}
                          </td>
                          <td className="px-2 py-1.5 align-top text-right">
                            <Input
                              type="number"
                              min={0.01}
                              max={l.quantity}
                              step={0.01}
                              value={qty}
                              disabled={!checked}
                              onChange={(e) => setQty(l.id, Number(e.target.value))}
                              className="w-20 text-right ml-auto"
                            />
                            <div className="text-xs text-muted-foreground mt-0.5">max {l.quantity}</div>
                          </td>
                          <td className="px-2 py-1.5 align-top text-right font-medium">
                            {checked ? formatCents(preview) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {mode === "free_amount" && (
              <div className="flex flex-col gap-3">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label htmlFor="credit-free-amount">Bedrag (€)</Label>
                    <Input
                      id="credit-free-amount"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={freeAmountInput}
                      onChange={(e) => setFreeAmountInput(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm pb-1.5">
                    <Checkbox checked={freeInclBtw} onCheckedChange={(v) => setFreeInclBtw(Boolean(v))} />
                    Inclusief BTW
                  </label>
                </div>
                {freeAmountInvalid && (
                  <p className="text-sm text-red-600">Ongeldig bedrag — gebruik bv. 123,45.</p>
                )}
                <div>
                  <Label htmlFor="credit-free-description">Omschrijving *</Label>
                  <Input
                    id="credit-free-description"
                    value={freeDescription}
                    onChange={(e) => setFreeDescription(e.target.value)}
                    placeholder="Reden/omschrijving van dit creditbedrag"
                    maxLength={120}
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="credit-reason">Reden (optioneel)</Label>
              <Input id="credit-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            </div>

            <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm flex flex-col gap-0.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotaal</span><span>{formatCents(totals.subtotalCents)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">BTW</span><span>{formatCents(totals.btwCents)}</span></div>
              <div className="flex justify-between font-semibold"><span>Totaal</span><span>{formatCents(totals.totalCents)}</span></div>
              {!withinLimit && (
                <p className="text-red-600 mt-1">Overschrijdt het resterende factuurbedrag ({formatCents(remaining)}).</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(Boolean(v))} />
                Direct mailen naar klant
              </label>
              {sendEmail && (
                <Input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="naam@bedrijf.nl"
                  className="ml-6"
                />
              )}
            </div>

            {submitError && (
              <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{submitError}</div>
            )}
            {/* mailError wordt pas gezet ná een geslaagde create — op dat moment is
                createdCreditId al niet-null en toont het succes-blok hierboven 'm. */}
          </div>
        )}

        <DialogFooter>
          {createdCreditId != null ? (
            <Button onClick={() => onOpenChange(false)}>Sluiten</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Annuleren
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || loadingLines}>
                {submitting ? "Bezig..." : "Creditnota aanmaken"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
