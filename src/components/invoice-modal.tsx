"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { X, Printer, Mail, FileText, Check, ArrowLeft, ReceiptText, Trash2, Repeat } from "lucide-react";
import { loadInvoiceData, formatCents, formatDate, calcBtw } from "@/lib/invoice-data";
import { loadInvoiceRenderData, type StoredInvoiceForRender } from "@/lib/invoice-snapshot";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { remainingCreditCents } from "@/lib/credit-calc";
import { defaultBtwPct } from "@/lib/btw";
import { CreditDialog } from "@/components/credit-dialog";
import { DeleteInvoiceDialog } from "@/components/delete-invoice-dialog";
import { SupersedeInvoiceDialog } from "@/components/supersede-invoice-dialog";

export interface StoredInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  btw_pct: number;
  subtotal_cents: number;
  btw_cents: number;
  total_cents: number;
  sent_at: string | null;
}

/** Een creditnota (invoices-rij met credited_invoice_id gevuld) zoals getoond in de "Creditnota's"-sectie. */
export interface CreditInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  btw_pct: number;
  subtotal_cents: number;
  btw_cents: number;
  total_cents: number;
  credit_reason: string | null;
  sent_at: string | null;
  /** Secundaire sorteersleutel (M5) — meerdere credits op dezelfde invoice_date blijven zo in aanmaakvolgorde. */
  created_at: string;
}

interface InvoiceModalProps {
  orderId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Welk document momenteel in de PDF-preview staat. */
type Previewing = { type: "invoice" } | { type: "credit"; id: string };

export function InvoiceModal({ orderId, clientId, open, onOpenChange }: InvoiceModalProps) {
  const supabase = createClient();
  const { role } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [storedInvoice, setStoredInvoice] = useState<StoredInvoice | null>(null);
  const [credits, setCredits] = useState<CreditInvoiceRow[]>([]);
  const [btwPct, setBtwPct] = useState<0 | 9 | 21>(21);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [error, setError] = useState("");

  const [previewing, setPreviewing] = useState<Previewing>({ type: "invoice" });
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [creditMailBusy, setCreditMailBusy] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [supersedeDialogOpen, setSupersedeDialogOpen] = useState(false);
  // Zet de BTW-select maar één keer op de ICL-default per modal-opening — anders
  // duwt elke rerun van de PDF-preview-effect (die dezelfde live data ophaalt) de
  // gebruikers-override weer terug naar de default (zie de preview-effect hieronder).
  const btwDefaultSetRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    // Altijd de debetfactuur — creditnota's hangen aan credited_invoice_id en
    // mogen deze .maybeSingle() nooit laten breken op "meerdere rijen".
    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("order_id", orderId)
      .is("credited_invoice_id", null)
      .is("superseded_at", null)
      .maybeSingle();

    if (invErr) {
      setError("Factuurgegevens ophalen is mislukt");
      setStoredInvoice(null);
      setCredits([]);
      setPreviewing({ type: "invoice" });
      setLoading(false);
      return;
    }

    if (inv) {
      setStoredInvoice(inv as StoredInvoice);
      setBtwPct(inv.btw_pct as 0 | 9 | 21);
      const { data: creditRows, error: creditErr } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, btw_pct, subtotal_cents, btw_cents, total_cents, credit_reason, sent_at, created_at")
        .eq("credited_invoice_id", inv.id)
        .order("invoice_date")
        .order("created_at");
      if (creditErr) {
        setError("Creditnota's ophalen is mislukt");
        setCredits([]);
      } else {
        setCredits((creditRows ?? []) as unknown as CreditInvoiceRow[]);
      }
    } else {
      setStoredInvoice(null);
      setCredits([]);
    }
    setPreviewing({ type: "invoice" });
    setLoading(false);
  }, [supabase, orderId]);

  useEffect(() => {
    if (!open) return;
    // (M8) Transiënte verzend-status is sessie-lokaal — een heropening moet 'm
    // niet meeslepen uit de vorige keer dat deze modal openstond.
    setSentOk(false);
    setCreditMailBusy(null);
    btwDefaultSetRef.current = false;
    load();
  }, [open, load]);

  // PDF-preview regenereren zodra de bron verandert (factuur opgeslagen, BTW
  // gewijzigd vóór opslaan, of gebruiker schakelt tussen factuur/creditnota).
  // Zelfde render-seam (loadInvoiceRenderData) als de PDF- en mail-route.
  useEffect(() => {
    if (!open || loading) return;
    let cancelled = false;
    setPdfLoading(true);

    (async () => {
      try {
        let bytes: Uint8Array | null = null;

        if (previewing.type === "credit") {
          const credit = credits.find(c => c.id === previewing.id);
          if (credit && storedInvoice) {
            const renderData = await loadInvoiceRenderData(supabase, {
              ...credit,
              order_id: orderId,
              client_id: clientId,
            } satisfies StoredInvoiceForRender);
            if (renderData) {
              bytes = generateInvoicePdf({
                invoiceNumber: credit.invoice_number,
                invoiceDate: credit.invoice_date,
                btwPct: credit.btw_pct,
                data: renderData.data,
                btwCents: renderData.btwCents,
                totalCents: renderData.totalCents,
                documentType: "credit",
                originalInvoiceNumber: storedInvoice.invoice_number,
                creditReason: credit.credit_reason ?? undefined,
              });
            }
          }
        } else if (storedInvoice) {
          const renderData = await loadInvoiceRenderData(supabase, {
            ...storedInvoice,
            order_id: orderId,
            client_id: clientId,
          } satisfies StoredInvoiceForRender);
          if (renderData) {
            bytes = generateInvoicePdf({
              invoiceNumber: storedInvoice.invoice_number,
              invoiceDate: storedInvoice.invoice_date,
              btwPct: storedInvoice.btw_pct,
              data: renderData.data,
              btwCents: renderData.btwCents,
              totalCents: renderData.totalCents,
              documentType: "invoice",
            });
          }
        } else {
          // Nog niet opgeslagen: live data + de lokaal gekozen BTW (zoals voorheen).
          const liveData = await loadInvoiceData(supabase, orderId, clientId);
          if (liveData) {
            // ICL-default: éénmalig per modal-opening de BTW-select vullen op basis
            // van land + btw-nummer van de klant (defaultBtwPct, btw.ts) — de
            // gebruiker kan dit daarna altijd overriden (btwDefaultSetRef voorkomt
            // dat een volgende preview-rerun de override weer terugzet).
            if (!btwDefaultSetRef.current) {
              btwDefaultSetRef.current = true;
              const icl = defaultBtwPct({
                country: liveData.billingAddress?.country ?? null,
                vatNumber: liveData.clientVatNumber,
              }) as 0 | 9 | 21;
              if (icl !== btwPct) setBtwPct(icl);
            }
            const { btwCents, totalCents } = calcBtw(liveData.subtotalCents, btwPct);
            bytes = generateInvoicePdf({
              invoiceNumber: "CONCEPT",
              invoiceDate: new Date().toISOString().slice(0, 10),
              btwPct,
              data: liveData,
              btwCents,
              totalCents,
              documentType: "invoice",
            });
          }
        }

        if (cancelled || !bytes) return;
        // TS 5.9 + lib.dom: Uint8Array<ArrayBufferLike> vs BlobPart's ArrayBufferView<ArrayBuffer>
        // is een generics-mismatch zonder runtime-verschil — cast is veilig.
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        setPdfUrl(URL.createObjectURL(blob));
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, storedInvoice, credits, previewing, btwPct, orderId, clientId, supabase]);

  // Blob-URL's zijn niet-vrijblijvend geheugen — ruim de vorige altijd op zodra
  // er een nieuwe komt, en bij unmount.
  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  async function handleCreate() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/invoices/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, clientId, btwPct }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Fout bij aanmaken"); setSaving(false); return; }
    setStoredInvoice(json.invoice);
    setSaving(false);
  }

  async function handleSendEmail() {
    if (!storedInvoice) return;
    setSending(true);
    setError("");
    const res = await fetch("/api/invoices/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: storedInvoice.id }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Fout bij versturen"); setSending(false); return; }
    setSentOk(true);
    setSending(false);
    await load();
  }

  async function handleSendCreditEmail(creditId: string) {
    setCreditMailBusy(creditId);
    setError("");
    const res = await fetch("/api/invoices/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: creditId }),
    });
    const json = await res.json().catch(() => ({}));
    setCreditMailBusy(null);
    if (!res.ok) { setError(json.error ?? "Fout bij versturen creditnota"); return; }
    await load();
  }

  // Na een geslaagde verwijdering bestaat storedInvoice niet meer — herladen
  // laat load() de lege staat vaststellen (geen debetfactuur meer voor deze
  // order) zodat de bestaande "Factuur opslaan"-knop het opnieuw-genereren-pad wordt.
  async function handleDeleted() {
    setStoredInvoice(null);
    await load();
  }

  // Na succesvol vervangen filtert de load()-query 'm weg (superseded_at gezet)
  // — zelfde terugval als handleDeleted naar de "Factuur opslaan"-staat, vanwaar
  // een nieuwe factuur voor deze order aangemaakt kan worden.
  async function handleSuperseded() {
    setStoredInvoice(null);
    await load();
  }

  function handlePrint() {
    if (!pdfUrl) return;
    const win = iframeRef.current?.contentWindow;
    try {
      if (win) { win.focus(); win.print(); return; }
    } catch {
      // val terug op nieuw tabblad als de iframe-print onverhoopt faalt
    }
    window.open(pdfUrl, "_blank");
  }

  if (!open) return null;

  const creditBeingViewed = previewing.type === "credit"
    ? credits.find(c => c.id === previewing.id) ?? null
    : null;
  const headerNumber = creditBeingViewed
    ? creditBeingViewed.invoice_number
    : storedInvoice
      ? storedInvoice.invoice_number
      : "Factuur aanmaken";
  const headerSentAt = creditBeingViewed ? creditBeingViewed.sent_at : storedInvoice?.sent_at ?? null;

  const remaining = storedInvoice
    ? remainingCreditCents(storedInvoice.total_cents, credits.map(c => c.total_cents))
    : 0;
  const canCredit = Boolean(storedInvoice?.sent_at) && (role === "sales" || role === "admin") && remaining > 1;
  const canDelete = Boolean(storedInvoice && !storedInvoice.sent_at) && (role === "sales" || role === "admin");
  // Vervangen mag zodra de factuur volledig gecrediteerd is (zelfde ±1 cent-marge
  // als de supersede_invoice-RPC) — spiegelbeeld van canCredit's `remaining > 1`.
  const canSupersede = Boolean(storedInvoice) && (role === "sales" || role === "admin") && remaining <= 1;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-background ring-1 ring-border shadow-xl">

          {/* Modal header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {creditBeingViewed ? <ReceiptText size={18} className="text-muted-foreground" /> : <FileText size={18} className="text-muted-foreground" />}
              <div>
                <h2 className="text-lg font-semibold leading-tight">{headerNumber}</h2>
                {headerSentAt && (
                  <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                    <Check size={11} /> Verstuurd op {formatDate(headerSentAt.slice(0, 10))}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {previewing.type === "invoice" && (
                <>
                  {/* BTW selector — alleen bewerkbaar vóór opslaan */}
                  {!storedInvoice && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-muted-foreground">BTW:</span>
                      <select
                        value={btwPct}
                        onChange={e => setBtwPct(Number(e.target.value) as 0 | 9 | 21)}
                        className="rounded border border-border bg-card px-2 py-1 text-sm focus:outline-none"
                      >
                        <option value={21}>21%</option>
                        <option value={9}>9%</option>
                        <option value={0}>0% (vrijgesteld)</option>
                      </select>
                    </div>
                  )}
                  {storedInvoice && (
                    <span className="text-xs text-muted-foreground rounded bg-muted px-2 py-1">BTW {storedInvoice.btw_pct}%</span>
                  )}

                  {!storedInvoice ? (
                    <Button size="sm" onClick={handleCreate} disabled={saving || loading}>
                      {saving ? "Opslaan..." : "Factuur opslaan"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={handleSendEmail} disabled={sending}>
                      {sending ? "Versturen..." : sentOk ? <><Check size={14} /> Verstuurd</> : <><Mail size={14} /> Verstuur per e-mail</>}
                    </Button>
                  )}

                  {canCredit && (
                    <Button size="sm" variant="outline" onClick={() => setCreditDialogOpen(true)}>
                      Crediteren
                    </Button>
                  )}

                  {canDelete && (
                    <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                      <Trash2 size={14} /> Factuur verwijderen
                    </Button>
                  )}

                  {canSupersede && (
                    <Button size="sm" variant="outline" onClick={() => setSupersedeDialogOpen(true)}>
                      <Repeat size={14} /> Vervangen door nieuwe factuur
                    </Button>
                  )}
                </>
              )}

              <Button size="sm" variant="outline" onClick={handlePrint} disabled={loading || !pdfUrl}>
                <Printer size={14} /> Afdrukken
              </Button>

              <button onClick={() => onOpenChange(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Foutmelding */}
          {error && (
            <div className="mx-6 mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Creditnota's-sectie */}
          {storedInvoice && (
            <div className="px-6 pt-4">
              <h3 className="text-sm font-semibold mb-2">Creditnota&apos;s</h3>
              {credits.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nog geen creditnota&apos;s op deze factuur.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {credits.map(c => (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm ${previewing.type === "credit" && previewing.id === c.id ? "border-primary bg-muted/40" : "border-border"}`}
                    >
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => setPreviewing({ type: "credit", id: c.id })}
                      >
                        <span className="font-medium">{c.invoice_number}</span>
                        <span className="text-muted-foreground ml-2">{formatCents(c.total_cents)}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {c.sent_at ? `Verstuurd op ${formatDate(c.sent_at.slice(0, 10))}` : "Nog niet verstuurd"}
                        </span>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => handleSendCreditEmail(c.id)}
                          disabled={creditMailBusy === c.id}
                        >
                          <Mail size={12} /> {creditMailBusy === c.id ? "..." : "Mail"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-6">
            {previewing.type === "credit" && storedInvoice && (
              <button
                type="button"
                className="mb-2 flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => setPreviewing({ type: "invoice" })}
              >
                <ArrowLeft size={12} /> Terug naar factuur {storedInvoice.invoice_number}
              </button>
            )}
            {loading ? (
              <p className="text-center text-sm text-muted-foreground">Laden...</p>
            ) : !pdfUrl ? (
              <p className="text-center text-sm text-muted-foreground">{pdfLoading ? "PDF genereren..." : "Geen data gevonden."}</p>
            ) : (
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                title="Factuur-preview"
                className="mx-auto block w-full rounded-lg border border-border bg-white"
                style={{ height: "70vh" }}
              />
            )}
          </div>
        </div>
      </div>

      {storedInvoice && (
        <CreditDialog
          open={creditDialogOpen}
          onOpenChange={setCreditDialogOpen}
          invoice={storedInvoice}
          existingCreditTotals={credits.map(c => c.total_cents)}
          onCreated={load}
        />
      )}

      {storedInvoice && (
        <DeleteInvoiceDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          invoiceId={storedInvoice.id}
          invoiceNumber={storedInvoice.invoice_number}
          onDeleted={handleDeleted}
        />
      )}

      {storedInvoice && (
        <SupersedeInvoiceDialog
          open={supersedeDialogOpen}
          onOpenChange={setSupersedeDialogOpen}
          invoiceId={storedInvoice.id}
          invoiceNumber={storedInvoice.invoice_number}
          onSuperseded={handleSuperseded}
        />
      )}
    </>
  );
}
