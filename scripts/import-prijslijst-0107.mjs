// Imports prijslijst 0107 ("HEADLAM per 16-2-2026", advies_prijslt0107_a.xlsx).
// Kolomindeling wijkt af van 210-217: omschrijving = kolom B (idx 1), prijs = kolom D (idx 3).
// Modi:
//   --analyse  : dump qualities/dims/conflicts/skipped (geen DB)
//   --check    : vergelijk parsed qualities+dims met DB (REST, read-only)
//   --emit     : schrijf supabase/migrations/<...>_price_list_0107_lines.sql
//   --apply    : POST direct via PostgREST (service role)

import XLSX from 'xlsx';
import fs from 'node:fs';

const FILE = 'advies_prijslt0107_a.xlsx';
const LIST_NR = '0107';
const DESC_COL = 1; // kolom B
const PRICE_COL = 3; // kolom D
const FIRST_DATA_ROW = 3; // rij 0=titel, 1=meta, 2=header

const ARG = process.argv[2];

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
  // 1. quality + nummer + (MAATWERK|MAATWK)
  let m = String(desc).match(/^([A-Z]+?)(\d+)(MAATWERK|MAATWK)$/);
  if (m) return { quality: m[1], unit: 'm2', dim_name: null };

  // 2. quality + nummer + scheidingsteken (2 tekens, eerste = letter) + tail
  // Eerste teken letter (XX/KK/FE), tweede mag cijfer (P1/P2/P3 = print-varianten).
  // SEAO heeft ALLEEN P1/P2/P3-regels voor zijn stuks-prijzen — zonder dit verliezen we die.
  m = String(desc).match(/^([A-Z]+?)(\d+)([A-Z][A-Z0-9])(.*)$/);
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
  for (let i = FIRST_DATA_ROW; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[DESC_COL] == null || r[PRICE_COL] == null) continue;
    const d = decompose(r[DESC_COL]);
    if (!d) { out.push({ skip: true, reason: 'unparseable', row: i, desc: r[DESC_COL] }); continue; }
    const price = Math.round(Number(r[PRICE_COL]) * 100);
    if (!Number.isFinite(price) || price <= 0) {
      out.push({ skip: true, reason: 'zero-price', row: i, desc: r[DESC_COL], raw: r[PRICE_COL] });
      continue;
    }
    out.push({ ...d, price_cents: price, src_desc: r[DESC_COL], src_row: i });
  }
  return out;
}

function dedupe(parsed) {
  const map = new Map();
  for (const p of parsed) {
    if (p.skip) continue;
    const key = `${p.quality}|${p.dim_name ?? ''}|${p.unit}`;
    let e = map.get(key);
    if (!e) { e = { prices: new Map(), samples: [] }; map.set(key, e); }
    e.prices.set(p.price_cents, (e.prices.get(p.price_cents) ?? 0) + 1);
    if (e.samples.length < 3) e.samples.push(p.src_desc);
  }
  const resolved = [];
  const conflicts = [];
  for (const [key, e] of map) {
    const [quality, dim_name, unit] = key.split('|');
    const sorted = [...e.prices.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    resolved.push({ quality, dim_name: dim_name || null, unit, price_cents: sorted[0][0] });
    if (e.prices.size > 1) conflicts.push({ key, prices: Object.fromEntries(e.prices), chosen: sorted[0][0], samples: e.samples });
  }
  return { resolved, conflicts };
}

function escSql(s) {
  return String(s).replace(/'/g, "''");
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

function emitSql(resolved) {
  const piece = resolved.filter((r) => r.unit === 'piece');
  const m2 = resolved.filter((r) => r.unit === 'm2');
  const sql = [
    '-- ============================================================',
    `-- Prijslijst ${LIST_NR} — HEADLAM per 16.02.2026`,
    '-- ============================================================',
    `-- GEGENEREERD door scripts/import-prijslijst-0107.mjs --emit`,
    `-- Bron: ${FILE} (advies-/klant-prijslijst HEADLAM)`,
    '-- Zelf-bevattend: header + ontbrekende afmeting + regels.',
    '-- ON CONFLICT DO NOTHING zonder target: v3 partial unique indexen.',
    '-- Vereist v3-schema (price_list_lines.unit + partial unique indexen).',
    '-- ============================================================',
    '',
    '-- ─── 1. Header ────────────────────────────────────────────',
    `INSERT INTO price_lists (nr, name, valid_from, active)`,
    `VALUES ('${LIST_NR}', 'HEADLAM per 16.02.2026', DATE '2026-02-16', true)`,
    `ON CONFLICT (nr) DO NOTHING;`,
    '',
    '-- ─── 2. Ontbrekende carpet_dimension (geen UNIQUE op name) ─',
    `INSERT INTO carpet_dimensions (width_cm, height_cm, name, active)`,
    `SELECT 200, 300, '200x300', true`,
    `WHERE NOT EXISTS (SELECT 1 FROM carpet_dimensions cd WHERE cd.name = '200x300');`,
    '',
    '-- ─── 3. Regels ────────────────────────────────────────────',
  ];
  if (piece.length) {
    sql.push(`-- ${piece.length} stuks-prijzen`);
    sql.push(`INSERT INTO price_list_lines (price_list_nr, quality_id, carpet_dimension_id, price_cents, unit)`);
    sql.push(`SELECT '${LIST_NR}', q.id, cd.id, v.price_cents, 'piece'`);
    sql.push(`FROM (VALUES`);
    sql.push(piece.map((r) => `  ('${escSql(r.quality)}', '${escSql(r.dim_name)}', ${r.price_cents})`).join(',\n'));
    sql.push(`) AS v(quality_code, carpet_dim_name, price_cents)`);
    sql.push(`JOIN qualities q          ON q.code = v.quality_code`);
    sql.push(`JOIN carpet_dimensions cd ON cd.name = v.carpet_dim_name AND cd.active = true`);
    sql.push(`ON CONFLICT DO NOTHING;`);
    sql.push('');
  }
  if (m2.length) {
    sql.push(`-- ${m2.length} m²-prijzen (maatwerk)`);
    sql.push(`INSERT INTO price_list_lines (price_list_nr, quality_id, carpet_dimension_id, price_cents, unit)`);
    sql.push(`SELECT '${LIST_NR}', q.id, NULL, v.price_cents, 'm2'`);
    sql.push(`FROM (VALUES`);
    sql.push(m2.map((r) => `  ('${escSql(r.quality)}', ${r.price_cents})`).join(',\n'));
    sql.push(`) AS v(quality_code, price_cents)`);
    sql.push(`JOIN qualities q ON q.code = v.quality_code`);
    sql.push(`ON CONFLICT DO NOTHING;`);
    sql.push('');
  }
  return sql.join('\n');
}

async function main() {
  const parsed = readPriceList(FILE);
  const ok = parsed.filter((p) => !p.skip);
  const skipped = parsed.filter((p) => p.skip);
  const { resolved, conflicts } = dedupe(ok);
  const piece = resolved.filter((r) => r.unit === 'piece');
  const m2 = resolved.filter((r) => r.unit === 'm2');
  const qualities = [...new Set(resolved.map((r) => r.quality))].sort();
  const dims = [...new Set(piece.map((r) => r.dim_name))].sort();

  if (ARG === '--analyse') {
    console.log(`Parsed rows: ${parsed.length} | OK: ${ok.length} | skipped: ${skipped.length}`);
    console.log(`Resolved: ${resolved.length} (piece=${piece.length}, m2=${m2.length})`);
    console.log(`Unique qualities (${qualities.length}): ${qualities.join(',')}`);
    console.log(`Unique dims (${dims.length}): ${dims.join(' | ')}`);
    console.log(`Conflicts: ${conflicts.length}`);
    for (const c of conflicts.slice(0, 20)) console.log('  CONFLICT', JSON.stringify(c));
    console.log(`Skipped: ${skipped.length}`);
    for (const s of skipped.slice(0, 40)) console.log('  SKIP', JSON.stringify(s));
    return;
  }

  if (ARG === '--check') {
    const dbQ = await fetchAll('qualities?select=id,code');
    const dbD = await fetchAll('carpet_dimensions?select=id,name,active');
    const dbPL = await rest(`price_lists?select=nr,name,active&nr=eq.${LIST_NR}`);
    const qSet = new Set(dbQ.map((q) => q.code));
    const dSet = new Set(dbD.filter((d) => d.active).map((d) => d.name));
    const missingQ = qualities.filter((q) => !qSet.has(q));
    const missingD = dims.filter((d) => !dSet.has(d));
    console.log(`price_lists row for ${LIST_NR}:`, JSON.stringify(dbPL));
    console.log(`qualities in DB: ${dbQ.length} | missing for this list (${missingQ.length}): ${missingQ.join(',')}`);
    console.log(`active carpet_dimensions in DB: ${dbD.filter((d) => d.active).length} | missing (${missingD.length}): ${missingD.join(' | ')}`);
    return;
  }

  if (ARG === '--emit') {
    const target = `supabase/migrations/20260617_price_list_0107.sql`;
    fs.writeFileSync(target, emitSql(resolved), 'utf8');
    console.log(`Wrote ${target}`);
    return;
  }

  if (ARG === '--apply') {
    if (process.argv[3] !== '--confirm') {
      console.log('Dry-run vereist eerst review. Voeg --confirm toe om header + afmeting + regels te POSTen.');
    }
    // 1. Header (idempotent)
    if (process.argv[3] === '--confirm') {
      await rest('price_lists', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify([{ nr: LIST_NR, name: 'HEADLAM per 16.02.2026', valid_from: '2026-02-16', active: true }]),
      });
      // 2. Ontbrekende afmeting 200x300 (geen UNIQUE op name → eerst checken)
      const exists = await rest(`carpet_dimensions?select=id&name=eq.200x300`);
      if (!exists.length) {
        await rest('carpet_dimensions', {
          method: 'POST',
          body: JSON.stringify([{ width_cm: 200, height_cm: 300, name: '200x300', active: true }]),
        });
        console.log('Afmeting 200x300 aangemaakt.');
      }
    }
    const dbQ = await fetchAll('qualities?select=id,code');
    const dbD = await fetchAll('carpet_dimensions?select=id,name,active');
    const qById = new Map(dbQ.map((q) => [q.code, q.id]));
    const dById = new Map(dbD.filter((d) => d.active).map((d) => [d.name, d.id]));
    const rows = [];
    const missing = [];
    for (const r of resolved) {
      const qid = qById.get(r.quality);
      if (!qid) { missing.push({ ...r, reason: 'quality not found' }); continue; }
      if (r.unit === 'piece') {
        const did = dById.get(r.dim_name);
        if (!did) { missing.push({ ...r, reason: 'dim not found' }); continue; }
        rows.push({ price_list_nr: LIST_NR, quality_id: qid, carpet_dimension_id: did, price_cents: r.price_cents, unit: 'piece' });
      } else {
        rows.push({ price_list_nr: LIST_NR, quality_id: qid, carpet_dimension_id: null, price_cents: r.price_cents, unit: 'm2' });
      }
    }
    console.log(`To insert: ${rows.length} | missing: ${missing.length}`);
    for (const m of missing.slice(0, 40)) console.log('  MISSING', JSON.stringify(m));
    if (process.argv[3] !== '--confirm') {
      console.log('\nDry-run. Voeg --confirm toe om te POSTen.');
      return;
    }
    const BATCH = 100;
    let inserted = 0, conflicted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const result = await rest('price_list_lines', {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
        body: JSON.stringify(batch),
      });
      inserted += result?.length ?? 0;
      conflicted += batch.length - (result?.length ?? 0);
      process.stdout.write('.');
    }
    console.log(`\nDone. Inserted: ${inserted} | duplicates ignored: ${conflicted}`);
    return;
  }

  console.error('Usage: node scripts/import-prijslijst-0107.mjs --analyse | --check | --emit | --apply [--confirm]');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
