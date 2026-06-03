"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Printer, Mail, FileText, Check } from "lucide-react";
import { loadInvoiceData, formatCents, formatDate, calcBtw, type InvoiceData } from "@/lib/invoice-data";

interface StoredInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  btw_pct: number;
  subtotal_cents: number;
  btw_cents: number;
  total_cents: number;
  sent_at: string | null;
}

interface InvoiceModalProps {
  orderId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceModal({ orderId, clientId, open, onOpenChange }: InvoiceModalProps) {
  const supabase = createClient();

  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [storedInvoice, setStoredInvoice] = useState<StoredInvoice | null>(null);
  const [btwPct, setBtwPct] = useState<0 | 9 | 21>(21);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [error, setError] = useState("");
  const [printDate] = useState(() =>
    new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" })
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [data, { data: inv }] = await Promise.all([
      loadInvoiceData(supabase, orderId, clientId),
      supabase.from("invoices").select("*").eq("order_id", orderId).maybeSingle(),
    ]);
    setInvoiceData(data);
    if (inv) {
      setStoredInvoice(inv as StoredInvoice);
      setBtwPct(inv.btw_pct as 0 | 9 | 21);
    }
    setLoading(false);
  }, [supabase, orderId, clientId]);

  useEffect(() => { if (open) load(); }, [open, load]);

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
    // Herlaad om sent_at bij te werken
    await load();
  }

  if (!open) return null;

  const activeBtwPct = storedInvoice?.btw_pct ?? btwPct;
  const subtotal = storedInvoice?.subtotal_cents ?? invoiceData?.subtotalCents ?? 0;
  const { btwCents, totalCents } = calcBtw(subtotal, activeBtwPct);
  const btwLabel = activeBtwPct === 0 ? "BTW (0% — vrijgesteld)" : `BTW (${activeBtwPct}%)`;

  function InvoiceDocument() {
    if (!invoiceData) return null;
    const data = invoiceData;
    const inv = storedInvoice;
    const addressBlock = (addr: typeof data.billingAddress) =>
      addr?.street
        ? [addr.street, [addr.postalCode, addr.city].filter(Boolean).join(" "), addr.country].filter(Boolean)
        : [];

    return (
      <div className="bg-white text-black text-[11px] leading-tight">
        {/* Header */}
        <div className="border-b-2 border-black pb-2 mb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Factuur</span>
              {inv
                ? <span className="text-sm font-bold text-gray-800">{inv.invoice_number}</span>
                : <span className="text-sm font-bold text-gray-400 italic">Concept</span>}
              {data.orderReference && <span className="text-[10px] text-gray-500">Ref: {data.orderReference}</span>}
              {inv && <span className="text-[10px] text-gray-400">Datum: {formatDate(inv.invoice_date)}</span>}
              <span className="text-[10px] text-gray-400">Afdruk: {printDate}</span>
            </div>
            <img src="/karpi-logo.svg" alt="Karpi Group" className="h-8 w-auto shrink-0 ml-4" />
          </div>

          <div className="flex items-start justify-between mt-1.5">
            <div className="flex gap-6">
              <div>
                <p style={{fontSize:"8px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"#9ca3af",marginBottom:"2px"}}>Factuuradres</p>
                <p className="text-[12px] font-bold">{data.clientName}</p>
                {data.clientNumber && <p className="text-[9px] text-gray-400">Debiteur {data.clientNumber}</p>}
                {addressBlock(data.billingAddress).map((l, i) => (
                  <p key={i} className="text-[10px] text-gray-600">{l}</p>
                ))}
              </div>
              {data.shippingAddress?.street && (
                <div>
                  <p style={{fontSize:"8px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"#9ca3af",marginBottom:"2px"}}>Afleveradres</p>
                  <p className="text-[12px] font-bold">{data.clientName}</p>
                  {addressBlock(data.shippingAddress).map((l, i) => (
                    <p key={i} className="text-[10px] text-gray-600">{l}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right text-[9px] text-gray-400 leading-snug ml-4 shrink-0">
              {data.company && (
                <>
                  <p>{[data.company.address_street, [data.company.address_postal, data.company.address_city].filter(Boolean).join(" ")].filter(Boolean).join("  ·  ")}</p>
                  <p>{[data.company.phone, data.company.email].filter(Boolean).join("  ·  ")}</p>
                </>
              )}
              <p className="mt-0.5">Order: {data.orderNumber}</p>
            </div>
          </div>
        </div>

        {/* Regeloverzicht */}
        <table className="w-full border-collapse mb-3">
          <thead>
            <tr className="border-b border-black text-[10px] uppercase tracking-wide text-gray-500">
              <th className="py-1 text-left font-medium">Omschrijving</th>
              <th className="py-1 text-right font-medium">Bedrag excl. BTW</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1.5">
                  <span className="text-[9px] text-gray-400 mr-2 uppercase">{l.tag}</span>
                  {l.label}
                </td>
                <td className="py-1.5 text-right font-medium">{formatCents(l.priceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* BTW-breakdown */}
        <div className="border-t-2 border-black pt-2">
          <table className="w-full max-w-xs ml-auto text-[11px]">
            <tbody>
              <tr>
                <td className="py-0.5 text-gray-500">Subtotaal excl. BTW</td>
                <td className="py-0.5 text-right">{formatCents(subtotal)}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-500">{btwLabel}</td>
                <td className="py-0.5 text-right">{formatCents(btwCents)}</td>
              </tr>
              <tr className="border-t border-black font-bold">
                <td className="pt-1">Totaal incl. BTW</td>
                <td className="pt-1 text-right">{formatCents(totalCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .invoice-print-root, .invoice-print-root * { visibility: visible !important; }
          .invoice-print-root {
            position: absolute !important; left: 0; top: 0; width: 100%;
          }
          .invoice-a4 { width: 210mm; min-height: 297mm; padding: 15mm 18mm; box-sizing: border-box; }
          @page { size: A4; margin: 0; }
        }
        @media screen { .invoice-print-root { display: none !important; } }
      `}</style>

      {/* Print-root */}
      <div className="invoice-print-root">
        <div className="invoice-a4">
          <InvoiceDocument />
        </div>
      </div>

      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-background ring-1 ring-border shadow-xl">

          {/* Modal header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-muted-foreground" />
              <div>
                <h2 className="text-lg font-semibold leading-tight">
                  {storedInvoice ? storedInvoice.invoice_number : "Factuur aanmaken"}
                </h2>
                {storedInvoice?.sent_at && (
                  <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                    <Check size={11} /> Verstuurd op {formatDate(storedInvoice.sent_at.slice(0, 10))}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendEmail}
                  disabled={sending}
                >
                  {sending ? "Versturen..." : sentOk ? <><Check size={14} /> Verstuurd</> : <><Mail size={14} /> Verstuur per e-mail</>}
                </Button>
              )}

              <Button size="sm" variant="outline" onClick={() => window.print()} disabled={loading || !invoiceData}>
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

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <p className="text-center text-sm text-muted-foreground">Laden...</p>
            ) : !invoiceData ? (
              <p className="text-center text-sm text-muted-foreground">Geen data gevonden.</p>
            ) : (
              <div
                className="mx-auto rounded-lg border border-border bg-white shadow-sm"
                style={{ width: "210mm", minHeight: "297mm", padding: "15mm 18mm", boxSizing: "border-box" }}
              >
                <InvoiceDocument />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
