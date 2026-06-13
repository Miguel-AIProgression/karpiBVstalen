"use client";

import React, { useEffect, useState, useCallback } from "react";
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
    const co = data.company;
    const days = co?.payment_days ?? 14;

    const addrLines = (addr: typeof data.billingAddress) =>
      addr?.street ? [addr.street, [addr.postalCode, addr.city].filter(Boolean).join("  "), addr.country].filter(Boolean) : [];

    return (
      <div style={{ background: "#fff", color: "#000", fontFamily: "Arial, sans-serif", fontSize: "10px", lineHeight: "1.4" }}>

        {/* ── Kopbalk ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
          {/* Logo links */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <img src="/karpi-logo.svg" alt="Karpi Group" style={{ height: "48px", width: "auto" }} />
          </div>

          {/* Bedrijfsgegevens rechts */}
          {co && (
            <div style={{ textAlign: "right", fontSize: "9px", color: "#555", lineHeight: "1.5" }}>
              <div style={{ fontWeight: 700, fontSize: "10px", color: "#000" }}>{co.company_name ?? "Karpi BV"}</div>
              <div>{co.address_street}</div>
              <div>{[co.address_postal, co.address_city].filter(Boolean).join(" ")}</div>
              {co.phone && <div>t {co.phone}</div>}
              {co.email && <div>e {co.email}</div>}
            </div>
          )}
        </div>

        {/* ── FACTUUR-label + nummer ── */}
        <div style={{ borderTop: "2px solid #000", borderBottom: "1px solid #ccc", padding: "6px 0", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontWeight: 700, fontSize: "14px", letterSpacing: "0.05em" }}>FACTUUR</span>
          <span style={{ fontSize: "9px", color: "#666" }}>
            {inv ? `${inv.invoice_number}  ·  ${formatDate(inv.invoice_date)}` : <em>Concept  ·  {printDate}</em>}
          </span>
        </div>

        {/* ── Adressen + factuurinfo ── */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", gap: "16px" }}>
          {/* Factuuradres */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: "3px" }}>Factuuradres</div>
            <div style={{ fontWeight: 700, fontSize: "11px" }}>{data.clientName}</div>
            {data.clientNumber && <div style={{ fontSize: "9px", color: "#888" }}>Debiteur {data.clientNumber}</div>}
            {addrLines(data.billingAddress).map((l, i) => <div key={i} style={{ fontSize: "10px" }}>{l}</div>)}
          </div>

          {/* Afleveradres indien afwijkend */}
          {data.shippingAddress?.street && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: "3px" }}>Afleveradres</div>
              <div style={{ fontWeight: 700, fontSize: "11px" }}>{data.clientName}</div>
              {addrLines(data.shippingAddress).map((l, i) => <div key={i} style={{ fontSize: "10px" }}>{l}</div>)}
            </div>
          )}

          {/* Factuurdetails rechts */}
          <div style={{ textAlign: "right", fontSize: "9px", lineHeight: "1.8" }}>
            {data.clientNumber && <div><span style={{ color: "#888" }}>Uw debiteurnummer:</span> <strong>{data.clientNumber}</strong></div>}
            {inv && <div><span style={{ color: "#888" }}>Factuurnummer:</span> <strong>{inv.invoice_number}</strong></div>}
            {inv && <div><span style={{ color: "#888" }}>Factuurdatum:</span> <strong>{formatDate(inv.invoice_date)}</strong></div>}
            <div><span style={{ color: "#888" }}>Orderreferentie:</span> <strong>{data.orderNumber}{data.orderReference ? ` / ${data.orderReference}` : ""}</strong></div>
          </div>
        </div>

        {/* ── Regelstabel ── */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8px", fontSize: "10px" }}>
          <thead>
            <tr style={{ borderTop: "2px solid #000", borderBottom: "1px solid #000" }}>
              <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>Omschrijving</th>
              <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>Afm.</th>
              <th style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>Aantal</th>
              <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>Stukprijs</th>
              <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>Totaal excl. BTW</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <React.Fragment key={i}>
                {l.isGroupStart && l.groupLabel && (
                  <tr style={{ background: "#f5f5f5" }}>
                    <td colSpan={5} style={{ padding: "3px 6px", fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>
                      {l.tag === "Collectie" ? "Collectie" : "Bundel"}: {l.groupLabel}
                    </td>
                  </tr>
                )}
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "4px 6px", paddingLeft: l.groupLabel ? "14px" : "6px" }}>
                    <strong style={{ fontSize: "10px" }}>{l.label}</strong>
                    {l.articleNumber && (
                      <span style={{ fontSize: "8px", color: "#999", marginLeft: "6px" }}>{l.articleNumber}</span>
                    )}
                  </td>
                  <td style={{ padding: "4px 6px", fontSize: "9px", color: "#555", whiteSpace: "nowrap" }}>
                    {l.dimensionName ?? "—"}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "center", fontSize: "10px" }}>
                    {l.quantity}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontSize: "10px", color: "#555" }}>
                    {formatCents(l.unitPriceCents)}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, fontSize: "10px" }}>
                    {formatCents(l.priceCents)}
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* ── BTW-breakdown ── */}
        <div style={{ borderTop: "1px solid #ccc", display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
          <table style={{ fontSize: "10px", minWidth: "240px" }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "3px 8px", color: "#666" }}>Grondslag</td>
                <td style={{ padding: "3px 8px", color: "#666", textAlign: "center" }}>BTW %</td>
                <td style={{ padding: "3px 8px", color: "#666", textAlign: "right" }}>BTW bedrag</td>
                <td style={{ padding: "3px 8px", fontWeight: 700, textAlign: "right" }}>Te betalen</td>
              </tr>
              <tr style={{ borderBottom: "2px solid #000" }}>
                <td style={{ padding: "4px 8px" }}>{formatCents(subtotal)}</td>
                <td style={{ padding: "4px 8px", textAlign: "center" }}>{activeBtwPct}%</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{formatCents(btwCents)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700 }}>{formatCents(totalCents)}</td>
              </tr>
              <tr>
                <td colSpan={4} style={{ padding: "4px 8px", fontSize: "9px", color: "#555" }}>
                  Betalingscond.: {days} dagen netto
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Footer ── */}
        {co && (
          <div style={{ borderTop: "1px dashed #ccc", paddingTop: "6px", fontSize: "8px", color: "#888", textAlign: "center", lineHeight: "1.7" }}>
            {co.kvk_number && <span>k.v.k. {co.kvk_number}</span>}
            {co.btw_number && <span> &nbsp;|&nbsp; btw {co.btw_number}</span>}
            {co.bank_name && <span> &nbsp;|&nbsp; {co.bank_name}</span>}
            {co.iban && <span> &nbsp;|&nbsp; IBAN {co.iban}</span>}
            {co.bic && <span> &nbsp;|&nbsp; BIC {co.bic}</span>}
          </div>
        )}
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
