#!/usr/bin/env node
/**
 * Backfill-script voor `invoice_lines` (wayfinder-ticket 006, snapshot-datalaag
 * uit `supabase/migrations/20260712_credit_invoices.sql`).
 *
 * Voor elke factuur ZONDER regel-snapshot: bouwt de regels via `loadInvoiceData`
 * (dezelfde live-berekening als de bestaande factuur-weergave) + `buildInvoiceLineRows`,
 * en vergelijkt de herrekende som met het geboekte `subtotal_cents`. Bij afwijking
 * (drift — bv. omdat order_lines ná facturatie gemuteerd zijn) wordt de factuur
 * OVERGESLAGEN en gerapporteerd, nooit gegokt.
 *
 * Gebruik:
 *   npx tsx scripts/backfill-invoice-lines.ts            # dry-run: alleen rapport, GEEN writes
 *   npx tsx scripts/backfill-invoice-lines.ts --apply     # schrijft de snapshot-regels echt weg
 *
 * Vereist .env.local met NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * NIET DRAAIEN vóór de migratie live staat — de tabel `invoice_lines` bestaat dan nog niet.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadInvoiceData } from "../src/lib/invoice-data";
import { buildInvoiceLineRows } from "../src/lib/invoice-snapshot";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");

interface InvoiceCandidate {
  id: string;
  invoice_number: string;
  order_id: string;
  client_id: string;
  subtotal_cents: number;
}

interface DriftEntry {
  invoice_number: string;
  geboektCents: number;
  herrekendCents: number;
  verschilCents: number;
}

function loadEnv(): Record<string, string> {
  const envPath = resolve(root, ".env.local");
  const envContent = readFileSync(envPath, "utf-8");
  return Object.fromEntries(
    envContent
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

async function fetchAllInvoices(admin: SupabaseClient): Promise<InvoiceCandidate[]> {
  const rows: InvoiceCandidate[] = [];
  const pageSize = 500;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("invoices")
      .select("id, invoice_number, order_id, client_id, subtotal_cents")
      .order("invoice_number")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as InvoiceCandidate[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchInvoiceIdsWithLines(admin: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("invoice_lines" as never)
      .select("invoice_id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as { invoice_id: string }[];
    for (const row of page) ids.add(row.invoice_id);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

function formatEuro(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env.local");
    process.exit(1);
  }
  const admin = createClient(url, key);

  console.log(`🧾 Backfill invoice_lines — modus: ${APPLY ? "APPLY (schrijft weg)" : "DRY-RUN (alleen rapport, geen writes)"}\n`);

  const [invoices, idsWithLines] = await Promise.all([
    fetchAllInvoices(admin),
    fetchInvoiceIdsWithLines(admin),
  ]);

  const candidates = invoices.filter((inv) => !idsWithLines.has(inv.id));
  console.log(
    `Gevonden: ${invoices.length} facturen totaal, ${idsWithLines.size} hebben al een snapshot, ` +
      `${candidates.length} kandidaat voor backfill.\n`
  );

  let backfilled = 0;
  let drift = 0;
  let overgeslagen = 0;
  const driftReport: DriftEntry[] = [];

  for (const inv of candidates) {
    const data = await loadInvoiceData(admin, inv.order_id, inv.client_id);
    if (!data) {
      overgeslagen += 1;
      console.log(`⚠️  ${inv.invoice_number}: orderdata niet gevonden (order ${inv.order_id}) — overgeslagen.`);
      continue;
    }

    const rows = buildInvoiceLineRows(inv.id, data);
    const herrekendCents = rows.reduce((sum, r) => sum + r.amount_cents, 0);
    const geboektCents = inv.subtotal_cents;

    if (herrekendCents !== geboektCents) {
      drift += 1;
      driftReport.push({
        invoice_number: inv.invoice_number,
        geboektCents,
        herrekendCents,
        verschilCents: herrekendCents - geboektCents,
      });
      console.log(
        `⚠️  ${inv.invoice_number}: DRIFT — geboekt ${formatEuro(geboektCents)}, herrekend ${formatEuro(herrekendCents)} ` +
          `(verschil ${formatEuro(herrekendCents - geboektCents)}) — overgeslagen.`
      );
      continue;
    }

    if (APPLY) {
      const { error } = await admin.from("invoice_lines" as never).insert(rows as never);
      if (error) {
        overgeslagen += 1;
        console.log(`❌ ${inv.invoice_number}: insert mislukt — ${error.message}`);
        continue;
      }
    }

    backfilled += 1;
    console.log(
      `✅ ${inv.invoice_number}: ${rows.length} regel(s) ${APPLY ? "weggeschreven" : "klaar om weg te schrijven"} ` +
        `(${formatEuro(herrekendCents)}).`
    );
  }

  console.log("\n— Samenvatting —");
  console.log(`Totaal facturen:        ${invoices.length}`);
  console.log(`Al gesnapshot:          ${idsWithLines.size}`);
  console.log(`Kandidaten:             ${candidates.length}`);
  console.log(`Gebackfilled:           ${backfilled}${APPLY ? "" : " (dry-run, niet weggeschreven)"}`);
  console.log(`Drift (overgeslagen):   ${drift}`);
  console.log(`Overig overgeslagen:    ${overgeslagen}`);

  if (driftReport.length > 0) {
    console.log("\nDrift-detail (geboekt vs. herrekend subtotal_cents):");
    for (const d of driftReport) {
      console.log(
        `  ${d.invoice_number}: geboekt ${d.geboektCents}, herrekend ${d.herrekendCents}, verschil ${d.verschilCents}`
      );
    }
  }

  if (!APPLY) {
    console.log("\nℹ️  Dry-run: er is niets weggeschreven. Draai met --apply om de snapshot-regels echt te backfillen.");
  }
}

main().catch((e) => {
  console.error("❌ Onverwachte fout:", e);
  process.exit(1);
});
