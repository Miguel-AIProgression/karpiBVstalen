// Herbereken opgeslagen facturen na de billing-fix.
//
// Oude facturen sloegen het subtotaal op als SOM van elke order-regel — een
// maatwerkcollectie van N staaltjes met €549 op elke regel werd zo N × €549.
// De nieuwe regel (src/lib/billing.ts): een collectie/bundel telt ÉÉN keer.
// Dit script herberekent subtotal_cents/btw_cents/total_cents van elke
// bestaande `invoices`-rij met diezelfde groepering en werkt de rij bij.
//
//   node scripts/recompute-invoices.mjs            # dry-run (toont verschillen)
//   node scripts/recompute-invoices.mjs --apply    # schrijft de correcties weg

import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Ontbrekende NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1); }

async function rest(path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const fmt = (c) => `€ ${(c / 100).toFixed(2).replace('.', ',')}`;

// Zelfde groepering als src/lib/billing.ts: collectie/bundel = één prijs (de
// eerste regel; binnen een groep zijn alle prijzen gelijk), losse stalen per
// regel. Telt elke groepsprijs één keer.
function billingSubtotalCents(lines, collNames, bundleNames) {
  const collFirst = new Map();
  const bundleFirst = new Map();
  let loose = 0;
  for (const l of lines) {
    const collName = l.collection_id ? collNames.get(l.collection_id) : null;
    const bundleName = l.bundle_id ? bundleNames.get(l.bundle_id) : null;
    if (l.collection_id && collName) {
      if (!collFirst.has(l.collection_id)) collFirst.set(l.collection_id, l.price_cents ?? 0);
    } else if (l.bundle_id && bundleName) {
      if (!bundleFirst.has(l.bundle_id)) bundleFirst.set(l.bundle_id, l.price_cents ?? 0);
    } else {
      loose += l.price_cents ?? 0;
    }
  }
  let sum = loose;
  for (const v of collFirst.values()) sum += v;
  for (const v of bundleFirst.values()) sum += v;
  return sum;
}

function calcBtw(subtotalCents, btwPct) {
  const btwCents = Math.round((subtotalCents * btwPct) / 100);
  return { btwCents, totalCents: subtotalCents + btwCents };
}

async function main() {
  // Namen-maps één keer ophalen (kleine dataset).
  const [colls, bundles] = await Promise.all([
    rest('collections?select=id,name'),
    rest('bundles?select=id,name'),
  ]);
  const collNames = new Map((colls ?? []).map((c) => [c.id, c.name]));
  const bundleNames = new Map((bundles ?? []).map((b) => [b.id, b.name]));

  const invoices = await rest('invoices?select=id,invoice_number,order_id,btw_pct,subtotal_cents,btw_cents,total_cents&order=invoice_number');
  if (!invoices || invoices.length === 0) { console.log('Geen opgeslagen facturen gevonden.'); return; }

  let changed = 0;
  for (const inv of invoices) {
    const lines = await rest(`order_lines?order_id=eq.${inv.order_id}&sample_id=not.is.null&select=id,quantity,sample_id,bundle_id,collection_id,price_cents`);
    const subtotal = billingSubtotalCents(lines ?? [], collNames, bundleNames);
    const { btwCents, totalCents } = calcBtw(subtotal, inv.btw_pct);

    const diff = subtotal !== inv.subtotal_cents || btwCents !== inv.btw_cents || totalCents !== inv.total_cents;
    if (!diff) {
      console.log(`= ${inv.invoice_number}  ${fmt(inv.subtotal_cents)} (ongewijzigd)`);
      continue;
    }
    changed++;
    console.log(`~ ${inv.invoice_number}  subtotaal ${fmt(inv.subtotal_cents)} → ${fmt(subtotal)}  |  totaal ${fmt(inv.total_cents)} → ${fmt(totalCents)}`);

    if (APPLY) {
      await rest(`invoices?id=eq.${inv.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ subtotal_cents: subtotal, btw_cents: btwCents, total_cents: totalCents }),
      });
    }
  }

  console.log('');
  console.log(`${invoices.length} factu${invoices.length === 1 ? 'ur' : 'ren'} bekeken, ${changed} te corrigeren.`);
  console.log(APPLY ? '✓ Correcties weggeschreven.' : 'Dry-run — draai met --apply om weg te schrijven.');
}

main().catch((e) => { console.error(e); process.exit(1); });
