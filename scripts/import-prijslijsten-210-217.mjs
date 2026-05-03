import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

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
  const m = String(desc).match(/^([A-Z]+)(\d+)(XX|MAATWERK)(.*)$/);
  if (!m) return null;
  const [, quality, , kind, dimRaw] = m;
  if (kind === 'MAATWERK') return { quality, unit: 'm2', dim_name: null };
  const rnd = dimRaw.match(/^(\d+)RND$/);
  if (rnd) {
    const n = String(rnd[1]).padStart(3, '0');
    return { quality, unit: 'piece', dim_name: `${n} ROND` };
  }
  if (/^\d{6}$/.test(dimRaw)) {
    const w = dimRaw.slice(0, 3);
    const h = dimRaw.slice(3);
    return { quality, unit: 'piece', dim_name: `${w}x${h}` };
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
  // step 4 (Task 2 — leeg laten in deze task)
}
