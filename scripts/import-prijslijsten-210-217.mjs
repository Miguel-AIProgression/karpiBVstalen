import XLSX from 'xlsx';
import fs from 'node:fs';

const FILES = [
  { nr: '0210', name: 'Benelux per 01.04.2026',                     valid_from: '2026-04-01', file: 'Prijslijst 210 BENELUX 1-4-26.xlsx' },
  { nr: '0211', name: 'Benelux + MV per 01.04.2026',                valid_from: '2026-04-01', file: 'prijslijst 211 BENELUX + MV 1-4-26.xlsx' },
  { nr: '0212', name: 'Benelux + bamboe per 01.04.2026',            valid_from: '2026-04-01', file: 'prijslijst 212 BENELUX+ BAMBOE 1-4-26 (1).xlsx' },
  { nr: '0213', name: 'Benelux + MV + bamboe per 01.04.2026',       valid_from: '2026-04-01', file: 'prijslijst 213 BENELUX + MV + BAMBOE 1-4-26.xlsx' },
  { nr: '0214', name: 'Benelux + RM per 01.04.2026',                valid_from: '2026-04-01', file: 'prijslijst 214 BENELUX + RM 1-4-26.xlsx' },
  { nr: '0215', name: 'Benelux + RM + MV per 01.04.2026',           valid_from: '2026-04-01', file: 'prijslijst 215 BENELUX + RM + MV 1-4-26.xlsx' },
  { nr: '0216', name: 'Benelux + RM + bamboe per 01.04.2026',       valid_from: '2026-04-01', file: 'prijslijst 216 BENELUX + RM + BAMBOE 1-4-26 (1).xlsx' },
  { nr: '0217', name: 'Benelux + RM + MV + bamboe per 01.04.2026',  valid_from: '2026-04-01', file: 'prijslijst 217 BENELUX + RM + MV + BAMBOE 1-4-26.xlsx' },
];

const ARG = process.argv[2];

function decompose(desc) {
  // Two formats to match:
  // 1. quality + number + (MAATWERK|MAATWK)        [e.g. BEAC10MAATWERK]
  // 2. quality + number + 2-letter-sep + tail      [e.g. BABY12XX120180, BERM21KKMAATWK]
  // Try MAATWERK/MAATWK first (longer match)
  let m = String(desc).match(/^([A-Z]+?)(\d+)(MAATWERK|MAATWK)$/);
  if (m) {
    const [, quality] = m;
    return { quality, unit: 'm2', dim_name: null };
  }

  // Try 2-letter separator format
  m = String(desc).match(/^([A-Z]+?)(\d+)([A-Z]{2})(.*)$/);
  if (!m) return null;

  const [, quality, , , dimRaw] = m;

  // Check if dimRaw itself is MAATWERK or MAATWK (e.g., after a separator like KK or XX)
  // Both produce m² unit
  if (dimRaw === 'MAATWERK' || dimRaw === 'MAATWK') {
    return { quality, unit: 'm2', dim_name: null };
  }

  // NNN000 = NNN ROND (KK-encoding: when last 3 digits are all 0)
  if (/^(\d{3})000$/.test(dimRaw)) {
    const match = dimRaw.match(/^(\d{3})000$/);
    const n = match[1]; // already 3 digits
    return { quality, unit: 'piece', dim_name: `${n} ROND` };
  }

  // NNNRND format (existing RND handling)
  const rnd = dimRaw.match(/^(\d+)RND$/);
  if (rnd) {
    const n = String(rnd[1]).padStart(3, '0');
    return { quality, unit: 'piece', dim_name: `${n} ROND` };
  }

  // 6-digit tail: check for organisch reversal
  if (/^\d{6}$/.test(dimRaw)) {
    const w = parseInt(dimRaw.slice(0, 3), 10);
    const h = parseInt(dimRaw.slice(3), 10);

    // If width > height (reversed), swap and mark as organisch
    if (w > h) {
      const wPad = String(h).padStart(3, '0');
      const hPad = String(w).padStart(3, '0');
      return { quality, unit: 'piece', dim_name: `${wPad}x${hPad} organisch` };
    }

    // Normal order (width <= height)
    const wPad = String(w).padStart(3, '0');
    const hPad = String(h).padStart(3, '0');
    return { quality, unit: 'piece', dim_name: `${wPad}x${hPad}` };
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
    if (!d) { out.push({ skip: true, reason: 'unparseable', row: i, desc: r[2] }); continue; }
    const price = Math.round(Number(r[4]) * 100);
    if (!Number.isFinite(price) || price <= 0) {
      out.push({ skip: true, reason: 'zero-price', row: i, desc: r[2], raw: r[4] });
      continue;
    }
    out.push({ ...d, price_cents: price, src_desc: r[2], src_row: i });
  }
  return out;
}

function dedupe(parsed) {
  const map = new Map();
  for (const p of parsed) {
    if (p.skip) continue;
    const key = `${p.quality}|${p.dim_name ?? ''}|${p.unit}`;
    let entry = map.get(key);
    if (!entry) { entry = { prices: new Map(), samples: [] }; map.set(key, entry); }
    entry.prices.set(p.price_cents, (entry.prices.get(p.price_cents) ?? 0) + 1);
    if (entry.samples.length < 3) entry.samples.push(p.src_desc);
  }
  const resolved = [];
  const conflicts = [];
  for (const [key, e] of map) {
    const [quality, dim_name, unit] = key.split('|');
    if (e.prices.size === 1) {
      resolved.push({ quality, dim_name: dim_name || null, unit, price_cents: [...e.prices.keys()][0] });
    } else {
      const sorted = [...e.prices.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      const chosen = sorted[0][0];
      resolved.push({ quality, dim_name: dim_name || null, unit, price_cents: chosen });
      conflicts.push({ key, prices: Object.fromEntries(e.prices), chosen, samples: e.samples });
    }
  }
  return { resolved, conflicts };
}

function escSql(s) {
  return String(s).replace(/'/g, "''");
}

function emitSqlForList(listNr, resolved) {
  const piece = resolved.filter((r) => r.unit === 'piece');
  const m2 = resolved.filter((r) => r.unit === 'm2');
  const sql = [];
  sql.push(`-- ──── ${listNr} ─────────────────────────────────────────`);

  if (piece.length) {
    sql.push(`-- ${piece.length} stuks-prijzen`);
    sql.push(`INSERT INTO price_list_lines (price_list_nr, quality_id, carpet_dimension_id, price_cents, unit)`);
    sql.push(`SELECT '${listNr}', q.id, cd.id, v.price_cents, 'piece'`);
    sql.push(`FROM (VALUES`);
    const vals = piece
      .map((r) => `  ('${escSql(r.quality)}', '${escSql(r.dim_name)}', ${r.price_cents})`)
      .join(',\n');
    sql.push(vals);
    sql.push(`) AS v(quality_code, carpet_dim_name, price_cents)`);
    sql.push(`JOIN qualities q          ON q.code = v.quality_code`);
    sql.push(`JOIN carpet_dimensions cd ON cd.name = v.carpet_dim_name AND cd.active = true`);
    sql.push(`ON CONFLICT DO NOTHING;`);
    sql.push('');
  }

  if (m2.length) {
    sql.push(`-- ${m2.length} m²-prijzen (maatwerk)`);
    sql.push(`INSERT INTO price_list_lines (price_list_nr, quality_id, carpet_dimension_id, price_cents, unit)`);
    sql.push(`SELECT '${listNr}', q.id, NULL, v.price_cents, 'm2'`);
    sql.push(`FROM (VALUES`);
    const vals = m2
      .map((r) => `  ('${escSql(r.quality)}', ${r.price_cents})`)
      .join(',\n');
    sql.push(vals);
    sql.push(`) AS v(quality_code, price_cents)`);
    sql.push(`JOIN qualities q ON q.code = v.quality_code`);
    sql.push(`ON CONFLICT DO NOTHING;`);
    sql.push('');
  }
  return sql.join('\n');
}

if (ARG === '--analyse') {
  const allQualities = new Set();
  const allDims = new Set();
  const summary = [];
  let totalConflicts = 0;
  let totalSkipped = 0;
  for (const f of FILES) {
    const parsed = readPriceList(f.file);
    const skipped = parsed.filter((p) => p.skip);
    const ok = parsed.filter((p) => !p.skip);
    const { resolved, conflicts } = dedupe(ok);
    for (const r of resolved) {
      allQualities.add(r.quality);
      if (r.unit === 'piece' && r.dim_name) allDims.add(r.dim_name);
    }
    summary.push({ nr: f.nr, raw: parsed.length, ok: ok.length, resolved: resolved.length, conflicts: conflicts.length, skipped: skipped.length });
    totalConflicts += conflicts.length;
    totalSkipped += skipped.length;
    if (conflicts.length) {
      console.log(`\n--- ${f.nr} conflicts (${conflicts.length}) ---`);
      for (const c of conflicts.slice(0, 10)) console.log(JSON.stringify(c));
      if (conflicts.length > 10) console.log(`... +${conflicts.length - 10} more`);
    }
    if (skipped.length) {
      console.log(`\n--- ${f.nr} skipped (${skipped.length}) ---`);
      for (const s of skipped.slice(0, 10)) console.log(JSON.stringify(s));
    }
  }
  console.log('\n=== Summary ===');
  console.table(summary);
  console.log('Unique qualities:', [...allQualities].sort().join(','));
  console.log('Unique dim names:', [...allDims].sort().join(','));
  console.log(`Total conflicts across files: ${totalConflicts}`);
  console.log(`Total skipped rows across files: ${totalSkipped}`);
}

if (ARG === '--emit') {
  const out = ['-- ============================================================',
    '-- Prijslijst-regels 0210 t/m 0217',
    '-- ============================================================',
    '-- GEGENEREERD door scripts/import-prijslijsten-210-217.mjs',
    '-- Bron: 8 Excel-bestanden in repo root.',
    '-- Re-run: `node scripts/import-prijslijsten-210-217.mjs --emit`',
    '--',
    '-- Vereist dat 20260504_price_lists_210_217_headers.sql al gedraaid is',
    '-- (anders faalt FK price_list_nr → price_lists.nr).',
    '-- Vereist ook 20260504_carpet_dims_for_210_217.sql voor de 4 nieuwe dims.',
    '--',
    '-- NB: ON CONFLICT DO NOTHING zonder column-target — dat is bewust:',
    '-- v3 gebruikt PARTIAL unique indexen (WHERE unit=...), en die kun je',
    '-- niet als ON CONFLICT-target opgeven. Postgres pakt automatisch het',
    '-- juiste partial index als arbiter.',
    '-- ============================================================',
    ''];
  for (const f of FILES) {
    const parsed = readPriceList(f.file);
    const okParsed = parsed.filter((p) => !p.skip);
    const { resolved } = dedupe(okParsed);
    out.push(emitSqlForList(f.nr, resolved));
  }
  const target = 'supabase/migrations/20260504_price_list_lines_210_217.sql';
  fs.writeFileSync(target, out.join('\n'), 'utf8');
  console.log(`Wrote ${target} (${fs.statSync(target).size} bytes)`);
}

if (ARG !== '--analyse' && ARG !== '--emit') {
  console.error('Usage: node import-prijslijsten-210-217.mjs --analyse | --emit');
  process.exit(1);
}
