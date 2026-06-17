// Imports prijslijst 0210 lines (piece-prices) via PostgREST.
// Reads Excel directly; resolves quality+dim codes; POSTs to price_list_lines.
// NB: m² (maatwerk) prijzen worden geskipt — vereisen migratie 20260503_price_lists_v3_m2.sql.

import XLSX from 'xlsx';
import fs from 'node:fs';

const FILE = 'Prijslijst 210 BENELUX 1-4-26.xlsx';
const LIST_NR = '0210';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

function decompose(desc) {
  let m = String(desc).match(/^([A-Z]+?)(\d+)(MAATWERK|MAATWK)$/);
  if (m) return { quality: m[1], unit: 'm2', dim_name: null };

  m = String(desc).match(/^([A-Z]+?)(\d+)([A-Z]{2})(.*)$/);
  if (!m) return null;
  const [, quality, , , dimRaw] = m;

  if (dimRaw === 'MAATWERK' || dimRaw === 'MAATWK')
    return { quality, unit: 'm2', dim_name: null };

  const round3 = dimRaw.match(/^(\d{3})000$/);
  if (round3) return { quality, unit: 'piece', dim_name: `${round3[1]} ROND` };

  const rnd = dimRaw.match(/^(\d+)RND$/);
  if (rnd) return { quality, unit: 'piece', dim_name: `${String(rnd[1]).padStart(3, '0')} ROND` };

  if (/^\d{6}$/.test(dimRaw)) {
    const w = parseInt(dimRaw.slice(0, 3), 10);
    const h = parseInt(dimRaw.slice(3), 10);
    if (w > h) {
      return { quality, unit: 'piece', dim_name: `${String(h).padStart(3, '0')}x${String(w).padStart(3, '0')} organisch` };
    }
    return { quality, unit: 'piece', dim_name: `${String(w).padStart(3, '0')}x${String(h).padStart(3, '0')}` };
  }
  return null;
}

function readPriceList(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const out = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[2] == null || r[4] == null) continue;
    const d = decompose(r[2]);
    if (!d) { out.push({ skip: true, reason: 'unparseable', desc: r[2] }); continue; }
    const price = Math.round(Number(r[4]) * 100);
    if (!Number.isFinite(price) || price <= 0) {
      out.push({ skip: true, reason: 'zero-price', desc: r[2] });
      continue;
    }
    out.push({ ...d, price_cents: price, src_desc: r[2] });
  }
  return out;
}

function dedupe(parsed) {
  const map = new Map();
  for (const p of parsed) {
    if (p.skip) continue;
    const key = `${p.quality}|${p.dim_name ?? ''}|${p.unit}`;
    let e = map.get(key);
    if (!e) { e = { prices: new Map() }; map.set(key, e); }
    e.prices.set(p.price_cents, (e.prices.get(p.price_cents) ?? 0) + 1);
  }
  const resolved = [];
  for (const [key, e] of map) {
    const [quality, dim_name, unit] = key.split('|');
    const sorted = [...e.prices.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    resolved.push({ quality, dim_name: dim_name || null, unit, price_cents: sorted[0][0] });
  }
  return resolved;
}

async function rest(path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function fetchAll(path) {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const chunk = await rest(`${path}${path.includes('?') ? '&' : '?'}offset=${from}&limit=${PAGE}`);
    out.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function main() {
  console.log(`Reading ${FILE}...`);
  const parsed = readPriceList(FILE);
  const ok = parsed.filter((p) => !p.skip);
  const skipped = parsed.filter((p) => p.skip);
  const resolved = dedupe(ok);
  const piece = resolved.filter((r) => r.unit === 'piece');
  const m2 = resolved.filter((r) => r.unit === 'm2');
  console.log(`Parsed: ${parsed.length} | OK: ${ok.length} | skipped: ${skipped.length}`);
  console.log(`Resolved: ${resolved.length} (piece=${piece.length}, m2=${m2.length})`);

  console.log('Fetching qualities and carpet_dimensions...');
  const qualities = await fetchAll('qualities?select=id,code');
  const dims = await fetchAll('carpet_dimensions?select=id,name,active');
  const qById = new Map(qualities.map((q) => [q.code, q.id]));
  const dById = new Map(dims.filter((d) => d.active).map((d) => [d.name, d.id]));
  console.log(`Loaded ${qualities.length} qualities, ${dims.length} carpet_dimensions`);

  const rowsToInsert = [];
  const missing = [];
  for (const r of piece) {
    const qid = qById.get(r.quality);
    const did = dById.get(r.dim_name);
    if (!qid) { missing.push({ ...r, reason: 'quality not found' }); continue; }
    if (!did) { missing.push({ ...r, reason: 'dim not found' }); continue; }
    rowsToInsert.push({
      price_list_nr: LIST_NR,
      quality_id: qid,
      carpet_dimension_id: did,
      price_cents: r.price_cents,
    });
  }
  console.log(`To insert (piece): ${rowsToInsert.length} | missing: ${missing.length} | skipping m² (vereist v3 migration): ${m2.length}`);
  if (missing.length) {
    console.log('Missing details:');
    for (const m of missing.slice(0, 20)) console.log('  ', JSON.stringify(m));
  }

  if (process.argv[2] !== '--apply') {
    console.log('\nDry-run. Re-run met --apply om te POSTen.');
    return;
  }

  console.log('\nInserting via PostgREST (batches of 100)...');
  const BATCH = 100;
  let inserted = 0;
  let conflicted = 0;
  for (let i = 0; i < rowsToInsert.length; i += BATCH) {
    const batch = rowsToInsert.slice(i, i + BATCH);
    try {
      const result = await rest('price_list_lines', {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
        body: JSON.stringify(batch),
      });
      inserted += result?.length ?? 0;
      conflicted += batch.length - (result?.length ?? 0);
      process.stdout.write(`.`);
    } catch (e) {
      console.error(`\nBatch ${i / BATCH} failed:`, e.message);
      throw e;
    }
  }
  console.log(`\nDone. Inserted: ${inserted} | duplicates (ignored): ${conflicted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
