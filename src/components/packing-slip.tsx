"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Printer } from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface SlipBundle {
  bundleId: string;
  bundleName: string;
  collectionName: string | null;
  karpiNaam: string | null;
  karpiQualityName: string;
  clientQualityName: string | null;
  dimensionName: string;
  colors: { code: string; name: string; articleNumber: string; karpiNaam: string | null; qualityName: string; finishingType: string | null; quantity: number; location: string | null }[];
  quantity: number;
  location: string | null;
}

interface SlipLooseLine {
  articleNumber: string;
  karpiQualityName: string;
  clientQualityName: string | null;
  colorCode: string;
  colorName: string;
  dimensionName: string;
  quantity: number;
  location: string | null;
}

interface CompanySettings {
  company_name: string | null;
  address_street: string | null;
  address_postal: string | null;
  address_city: string | null;
  address_country: string | null;
  phone: string | null;
  email: string | null;
}

interface InvoiceLine {
  label: string;
  tag: "Collectie" | "Bundel" | "Staal";
  priceCents: number | null;
}

interface SlipData {
  orderNumber: string;
  clientName: string;
  clientNumber: string | null;
  clientAddress: { street: string | null; postalCode: string | null; city: string | null; country: string | null } | null;
  deliveryDate: string;
  reference: string | null;
  notes: string | null;
  bundles: SlipBundle[];
  looseLines: SlipLooseLine[];
  invoiceLines: InvoiceLine[];
  company: CompanySettings | null;
}

interface PackingSlipProps {
  orderId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ─── Helpers ──────────────────────────────────────────── */

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
}

/* ─── Component ──────────────────────────────────────── */

export function PackingSlip({ orderId, clientId, open, onOpenChange }: PackingSlipProps) {
  const supabase = createClient();
  const [data, setData] = useState<SlipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [printDate, setPrintDate] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    // 1. Order basis + klantinfo + bedrijfsinstellingen
    const [{ data: orderRow }, { data: addrRow }, { data: companyRow }] = await Promise.all([
      supabase.from("orders").select("order_number, delivery_date, notes, reference, clients(name, client_number)").eq("id", orderId).single(),
      supabase.from("client_addresses").select("street, postal_code, city, country").eq("client_id", clientId).eq("is_primary", true).maybeSingle(),
      supabase.from("company_settings" as any).select("company_name, address_street, address_postal, address_city, address_country, phone, email").eq("id", "00000000-0000-0000-0000-000000000001").maybeSingle(),
    ]);
    if (!orderRow) { setLoading(false); return; }

    // 2. Order lines met sample + bundle info
    const { data: linesRaw } = await supabase
      .from("order_lines")
      .select(`
        id, quantity, sample_id, bundle_id, collection_id, price_cents,
        samples(article_number, quality_id, location, description,
          qualities(name, code),
          color_codes(code, name),
          sample_dimensions(name),
          finishing_types(name)
        )
      `)
      .eq("order_id", orderId)
      .not("sample_id", "is", null)
      .order("bundle_id")
      .order("created_at");

    const lines = (linesRaw ?? []) as any[];

    // 3. Bundelnamen + collectienamen
    const bundleIds = [...new Set(lines.map((l) => l.bundle_id).filter(Boolean))] as string[];
    const collectionIds = [...new Set(lines.map((l) => l.collection_id).filter(Boolean))] as string[];
    const bundleNameMap = new Map<string, string>();
    const collectionNameMap = new Map<string, string>();
    if (bundleIds.length > 0) {
      const { data: bundles } = await supabase
        .from("bundles")
        .select("id, name, bundle_colors(position, color_codes(code))")
        .in("id", bundleIds);
      for (const b of bundles ?? []) {
        bundleNameMap.set(b.id, b.name);
        bundleColorOrder.set(b.id, (b.bundle_colors ?? [])
          .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
          .map((bc: any) => bc.color_codes?.code ?? ""));
      }
    }
    if (collectionIds.length > 0) {
      const { data: colls } = await supabase.from("collections").select("id, name").in("id", collectionIds);
      for (const c of colls ?? []) collectionNameMap.set(c.id, c.name);
    }

    // 4. Klant eigen namen
    const qualityIds = [...new Set(lines.map((l) => l.samples?.quality_id).filter(Boolean))] as string[];
    const customNameMap = new Map<string, string>();
    if (qualityIds.length > 0) {
      const { data: customNames } = await supabase
        .from("client_quality_names")
        .select("quality_id, custom_name")
        .eq("client_id", clientId)
        .in("quality_id", qualityIds);
      for (const cn of customNames ?? []) customNameMap.set(cn.quality_id, cn.custom_name);
    }

    // 5. Groepeer per bundel
    const bundleMap = new Map<string, SlipBundle>();
    const looseLines: SlipLooseLine[] = [];

    for (const line of lines) {
      const s = line.samples;
      if (!s) continue;
      const qty = line.quantity ?? 1;
      const karpiName = s.qualities?.name ?? "?";
      const clientName = customNameMap.get(s.quality_id) ?? null;
      const dimName = s.sample_dimensions?.name ?? "";
      const location = s.location ?? null;

      if (line.bundle_id) {
        if (!bundleMap.has(line.bundle_id)) {
          bundleMap.set(line.bundle_id, {
            bundleId: line.bundle_id,
            bundleName: bundleNameMap.get(line.bundle_id) ?? "Bundel",
            collectionName: line.collection_id ? (collectionNameMap.get(line.collection_id) ?? null) : null,
            karpiNaam: s.description ?? null,
            karpiQualityName: karpiName,
            clientQualityName: clientName,
            dimensionName: dimName,
            colors: [],
            quantity: qty,
            location,
          });
        }
        bundleMap.get(line.bundle_id)!.colors.push({
          code: s.color_codes?.code ?? "",
          name: s.color_codes?.name ?? "",
          articleNumber: s.article_number,
          karpiNaam: s.description ?? null,
          qualityName: karpiName,
          finishingType: s.finishing_types?.name ?? null,
          quantity: qty,
          location: s.location ?? null,
        });
      } else {
        looseLines.push({
          articleNumber: s.article_number,
          karpiQualityName: karpiName,
          clientQualityName: clientName,
          colorCode: s.color_codes?.code ?? "",
          colorName: s.color_codes?.name ?? "",
          dimensionName: dimName,
          quantity: qty,
          location,
        });
      }
    }

    // Sorteer kleuren binnen bundel op bundel-volgorde
    const bundles = Array.from(bundleMap.values()).map((b) => {
      const order = bundleColorOrder.get(b.bundleId) ?? [];
      if (order.length > 0) {
        b.colors.sort((a, z) => {
          const ai = order.indexOf(a.code);
          const zi = order.indexOf(z.code);
          return (ai === -1 ? 999 : ai) - (zi === -1 ? 999 : zi);
        });
      }
      return b;
    });

    // Invoice lines bouwen (gegroepeerd per collectie / bundel / los staal)
    const invoiceCollections = new Map<string, { name: string; priceCents: number | null }>();
    const invoiceBundles = new Map<string, { name: string; priceCents: number | null }>();
    const invoiceLoose: { name: string; priceCents: number | null; qty: number }[] = [];
    for (const line of lines) {
      const s = line.samples;
      if (!s) continue;
      if (line.collection_id) {
        if (!invoiceCollections.has(line.collection_id)) {
          invoiceCollections.set(line.collection_id, { name: collectionNameMap.get(line.collection_id) ?? "Collectie", priceCents: line.price_cents ?? null });
        }
      } else if (line.bundle_id) {
        if (!invoiceBundles.has(line.bundle_id)) {
          invoiceBundles.set(line.bundle_id, { name: bundleNameMap.get(line.bundle_id) ?? "Bundel", priceCents: line.price_cents ?? null });
        }
      } else {
        const qualName = (customNameMap.get(s.quality_id) ?? s.qualities?.name ?? "?");
        invoiceLoose.push({ name: `${qualName} ${s.color_codes?.code ?? ""}`.trim(), priceCents: line.price_cents ?? null, qty: line.quantity ?? 1 });
      }
    }
    const invoiceLines: InvoiceLine[] = [
      ...Array.from(invoiceCollections.values()).map(r => ({ label: r.name, tag: "Collectie" as const, priceCents: r.priceCents })),
      ...Array.from(invoiceBundles.values()).map(r => ({ label: r.name, tag: "Bundel" as const, priceCents: r.priceCents })),
      ...invoiceLoose.map(r => ({ label: `${r.name} ×${r.qty}`, tag: "Staal" as const, priceCents: r.priceCents != null ? r.priceCents * r.qty : null })),
    ];

    setData({
      orderNumber: (orderRow as any).order_number,
      clientName: (orderRow as any).clients?.name ?? "Onbekend",
      clientNumber: (orderRow as any).clients?.client_number ?? null,
      clientAddress: addrRow ? {
        street: addrRow.street ?? null,
        postalCode: addrRow.postal_code ?? null,
        city: addrRow.city ?? null,
        country: addrRow.country ?? null,
      } : null,
      deliveryDate: (orderRow as any).delivery_date,
      reference: (orderRow as any).reference ?? null,
      notes: (orderRow as any).notes,
      bundles,
      looseLines,
      invoiceLines,
      company: (companyRow as CompanySettings | null) ?? null,
    });
    setLoading(false);
  }, [supabase, orderId, clientId]);

  useEffect(() => {
    if (open) {
      loadData();
      setPrintDate(new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" }));
    }
  }, [open, loadData]);

  if (!open) return null;

  const totalStalen = (data?.bundles ?? []).reduce((s, b) => s + b.colors.length * b.quantity, 0)
    + (data?.looseLines ?? []).reduce((s, l) => s + l.quantity, 0);
  const totalBundles = data?.bundles.length ?? 0;

  function SlipContent({ mode }: { mode: "intern" | "klant" }) {
    if (!data) return null;
    return (
      <div className="packing-slip-content bg-white text-black text-[11px] leading-tight">
        {/* Header — compact 2-kolom */}
        <div className="border-b-2 border-black pb-2 mb-3">
          {/* Rij 1: pakbon label + ordernummer + datum | logo */}
          <div className="flex items-start justify-between">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{mode === "klant" ? "Pakbon" : "Pakbon Intern"}</span>
              <span className="text-sm font-bold text-gray-800">{data.orderNumber}</span>
              {data.reference && <span className="text-[10px] text-gray-500">Ref: {data.reference}</span>}
              <span className="text-[10px] text-gray-400">Levering: {formatDate(data.deliveryDate)}</span>
              <span className="text-[10px] text-gray-400">Afdruk: {printDate}</span>
            </div>
            <img src="/karpi-logo.svg" alt="Karpi Group" className="h-8 w-auto shrink-0 ml-4" />
          </div>

          {/* Rij 2: klant links | karpi gegevens rechts */}
          <div className="flex items-start justify-between mt-1.5">
            {/* Klantblok */}
            <div>
              <p className="text-base font-bold leading-tight">{data.clientName}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {[
                  data.clientNumber ? `Debiteur ${data.clientNumber}` : null,
                  data.clientAddress?.street,
                  [data.clientAddress?.postalCode, data.clientAddress?.city].filter(Boolean).join(" "),
                  data.clientAddress?.country,
                ].filter(Boolean).join("  ·  ")}
              </p>
            </div>

            {/* Karpi-blok */}
            <div className="text-right text-[9px] text-gray-400 leading-snug ml-4 shrink-0">
              {data.company && (
                <>
                  <p>{[data.company.address_street, [data.company.address_postal, data.company.address_city].filter(Boolean).join(" ")].filter(Boolean).join("  ·  ")}</p>
                  <p>{[data.company.phone, data.company.email].filter(Boolean).join("  ·  ")}</p>
                </>
              )}
              <p className="mt-0.5 text-gray-300">{totalBundles} bundels · {totalStalen} stalen</p>
            </div>
          </div>
        </div>

        {/* Bundels — gegroepeerd per collectie, als picklist */}
        {data.bundles.length > 0 && (() => {
          const collGroups = new Map<string, SlipBundle[]>();
          for (const b of data.bundles) {
            const key = b.collectionName ?? "";
            if (!collGroups.has(key)) collGroups.set(key, []);
            collGroups.get(key)!.push(b);
          }
          const totalStk = data.bundles.reduce((s, b) => s + b.colors.length * b.quantity, 0);
          return (
            <div className="mb-3">
              {Array.from(collGroups.entries()).map(([collName, bundles]) => (
                <div key={collName}>
                  {/* Collectie-header alleen als er echt een collectie is */}
                  {collName && (
                    <div style={{background:"#f3f4f6",padding:"3px 8px",borderRadius:"3px",marginBottom:"6px"}}>
                      <span style={{fontSize:"8px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#9ca3af"}}>Collectie  </span>
                      <span style={{fontSize:"11px",fontWeight:700,color:"#111827"}}>{collName}</span>
                    </div>
                  )}

                  {bundles.map((b) => {
                    const bundleStalen = b.colors.reduce((s, c) => s + c.quantity, 0) * b.quantity;
                    return (
                    <div key={b.bundleId} style={{marginBottom:"10px",breakInside:"avoid"}}>
                      {/* Bundel-header */}
                      <div className="flex items-center justify-between border-b border-gray-400 pb-0.5 mb-1">
                        <div className="flex items-center gap-2">
                          <span style={{fontSize:"11px",fontWeight:700}}>{b.bundleName}</span>
                          {b.quantity > 1 && (
                            <span style={{fontSize:"9px",fontWeight:700,background:"#111",color:"#fff",padding:"1px 5px",borderRadius:"3px"}}>× {b.quantity}</span>
                          )}
                          <span style={{fontSize:"9px",color:"#6b7280"}}>{bundleStalen} staal{bundleStalen !== 1 ? "en" : ""}</span>
                        </div>
                        <span style={{fontSize:"9px",color:"#9ca3af",border:"1px solid #d1d5db",padding:"1px 6px",borderRadius:"3px"}}>□ afgevinkt</span>
                      </div>

                      {/* Stalen in bundel */}
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:"10px"}}>
                        <thead>
                          <tr style={{borderBottom:"1px solid #e5e7eb",color:"#9ca3af",fontSize:"8px",textTransform:"uppercase",letterSpacing:"0.05em"}}>
                            <th style={{width:"18px",textAlign:"right",paddingRight:"6px",fontWeight:600}}>#</th>
                            {mode === "intern" && <th style={{textAlign:"left",fontWeight:600,paddingRight:"8px"}}>Artikelnr</th>}
                            <th style={{textAlign:"left",fontWeight:600,paddingRight:"8px"}}>Kwaliteit</th>
                            <th style={{textAlign:"left",fontWeight:600}}>Kleur</th>
                            {b.colors.some(c => c.quantity > 1) && <th style={{textAlign:"center",fontWeight:600,width:"30px"}}>Stk</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {b.colors.map((c, ci) => (
                            <tr key={ci} style={{borderBottom:"1px solid #f3f4f6"}}>
                              <td style={{textAlign:"right",paddingRight:"6px",color:"#9ca3af",paddingTop:"2px",paddingBottom:"2px"}}>{ci + 1}.</td>
                              {mode === "intern" && (
                                <td style={{fontFamily:"monospace",fontSize:"9px",color:"#6b7280",paddingRight:"8px",paddingTop:"2px",paddingBottom:"2px"}}>{c.articleNumber}</td>
                              )}
                              <td style={{fontWeight:600,paddingRight:"8px",paddingTop:"2px",paddingBottom:"2px"}}>
                                {c.qualityName}
                                {mode === "intern" && c.finishingType && <span style={{fontWeight:400,color:"#9ca3af",fontSize:"9px"}}> ({c.finishingType})</span>}
                              </td>
                              <td style={{paddingTop:"2px",paddingBottom:"2px"}}>
                                <span style={{fontFamily:"monospace",fontWeight:700}}>{c.code}</span>
                                <span style={{color:"#6b7280",marginLeft:"4px"}}>{c.name}</span>
                                {c.quantity > 1 && <span style={{fontSize:"9px",fontWeight:700,background:"#111",color:"#fff",padding:"0 4px",borderRadius:"2px",marginLeft:"4px"}}>×{c.quantity}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    );
                  })}
                </div>
              ))}
              <div style={{borderTop:"2px solid #111",paddingTop:"3px",display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:"10px"}}>
                <span>Totaal bundels</span>
                <span>{totalStk} stalen</span>
              </div>
            </div>
          );
        })()}

        {/* Losse stalen — picklist stijl */}
        {data.looseLines.length > 0 && (
          <div style={{marginTop: data.bundles.length > 0 ? "10px" : "0"}}>
            <div style={{fontSize:"8px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"#6b7280",borderBottom:"2px solid #111",paddingBottom:"2px",marginBottom:"4px"}}>
              Losse stalen
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"10px"}}>
              <thead>
                <tr style={{borderBottom:"1px solid #e5e7eb",color:"#9ca3af",fontSize:"8px",textTransform:"uppercase",letterSpacing:"0.05em"}}>
                  {mode === "intern" && <th style={{textAlign:"left",fontWeight:600,paddingBottom:"2px",paddingRight:"8px"}}>Artikelnr</th>}
                  <th style={{textAlign:"left",fontWeight:600,paddingBottom:"2px",paddingRight:"8px"}}>Kwaliteit</th>
                  <th style={{textAlign:"left",fontWeight:600,paddingBottom:"2px",paddingRight:"8px"}}>Kleur</th>
                  <th style={{textAlign:"left",fontWeight:600,paddingBottom:"2px",paddingRight:"8px"}}>Afm.</th>
                  <th style={{textAlign:"center",fontWeight:600,paddingBottom:"2px",width:"30px"}}>Stk</th>
                </tr>
              </thead>
              <tbody>
                {data.looseLines.map((l, i) => (
                  <tr key={i} style={{borderBottom:"1px solid #f3f4f6"}}>
                    {mode === "intern" && <td style={{fontFamily:"monospace",fontSize:"9px",color:"#6b7280",paddingTop:"2px",paddingBottom:"2px",paddingRight:"8px"}}>{l.articleNumber}</td>}
                    <td style={{fontWeight:600,paddingTop:"2px",paddingBottom:"2px",paddingRight:"8px"}}>{l.clientQualityName ?? l.karpiQualityName}</td>
                    <td style={{paddingTop:"2px",paddingBottom:"2px",paddingRight:"8px"}}>
                      <span style={{fontFamily:"monospace",fontWeight:700}}>{l.colorCode}</span>
                      <span style={{color:"#6b7280",marginLeft:"4px"}}>{l.colorName}</span>
                    </td>
                    <td style={{color:"#6b7280",paddingTop:"2px",paddingBottom:"2px",paddingRight:"8px"}}>{l.dimensionName}</td>
                    <td style={{textAlign:"center",fontWeight:700,paddingTop:"2px",paddingBottom:"2px"}}>{l.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Notities */}
        {data.notes && (
          <div className="mt-3 border-t border-gray-300 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Opmerkingen</p>
            <p className="mt-0.5">{data.notes}</p>
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
          .packing-slip-print-root, .packing-slip-print-root * { visibility: visible !important; }
          .packing-slip-print-root {
            position: absolute !important; left: 0; top: 0; width: 100%;
          }
          .packing-slip-a4 {
            width: 210mm;
            min-height: 297mm;
            padding: 12mm 15mm;
            box-sizing: border-box;
            page-break-after: always;
          }
          @page { size: A4; margin: 0; }
        }
        @media screen { .packing-slip-print-root { display: none !important; } }
      `}</style>

      {/* Print-root: intern op pagina 1, klant op pagina 2 — elk altijd A4 */}
      <div className="packing-slip-print-root" ref={printRef}>
        <div className="packing-slip-a4">
          <SlipContent mode="intern" />
        </div>
        <div className="packing-slip-a4">
          <SlipContent mode="klant" />
        </div>
      </div>

      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-background ring-1 ring-border shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Pakbon — {data?.orderNumber}</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => window.print()} disabled={loading || !data}>
                <Printer size={14} /> Afdrukken (intern + klant)
              </Button>
              <button onClick={() => onOpenChange(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <p className="text-center text-sm text-muted-foreground">Laden...</p>
            ) : !data ? (
              <p className="text-center text-sm text-muted-foreground">Geen data gevonden.</p>
            ) : (
              <>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagina 1 — Intern</p>
                  <div className="rounded-lg border border-border bg-white shadow-sm overflow-hidden"
                    style={{ width: '210mm', minHeight: '297mm', padding: '12mm 15mm', boxSizing: 'border-box' }}>
                    <SlipContent mode="intern" />
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagina 2 — Klant</p>
                  <div className="rounded-lg border border-border bg-white shadow-sm overflow-hidden"
                    style={{ width: '210mm', minHeight: '297mm', padding: '12mm 15mm', boxSizing: 'border-box' }}>
                    <SlipContent mode="klant" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Module-level cache voor bundel kleur-volgorde
const bundleColorOrder = new Map<string, string[]>();
