// Importeert de "Collectielijst in House INKOOPVERSIE" (per 1-6-2026).
// BIJZONDER: price_cents = de DIRECTE verkoopprijs die op de sticker moet komen
// (géén kostprijs × factor zoals 0210-0217). Zie pricing.ts / direct_price-modus.
//
// Twee sheets:
//   1. "Huidige collectie In.House"  — cols: [2]kwaliteit [3]fancy [7]L [8]B
//        [9]huidige inkoop [10]huidige verkoop [12]nieuwe inkoop [13]nieuwe verkoop
//   2. "Maatwerk collectie Karpi"    — header op rij 31, data v.a. 32:
//        [0]model [1]fancy [3]afm [4]breedte/diameter [5]vorm [6]samenstelling
//        [7]huidige inkoop [8]huidige verkoop [10]nieuwe inkoop [11]nieuwe verkoop
//
// Modes:
//   --analyse           : parse + map tegen DB, rapporteer (geen writes)
//   --emit <nr> <naam>  : schrijf migration-SQL met de lijst-regels
//
// Run: node scripts/import-collectie-inhouse-2026.mjs --analyse

import XLSX from 'xlsx';
import fs from 'node:fs';

const FILE = 'Collectielijst in House incl afbeeldingen en namen PER 1-6-2026 INKOOPVERSIE 1 - stef.xlsx';

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

// Alias: Excel-kwaliteitsnaam (genormaliseerd) → quality.code in DB.
// Voor namen die niet 1-op-1 op qualities.name of .code matchen.
const QUALITY_ALIASES = {
  prosper: 'PROS',
  raccoon: 'RACC',
  'suedes shades': 'SUED',
  'suede shades': 'SUED',
  loop: 'LOOP',
};

const pad3 = (n) => String(n).padStart(3, '0');
const num = (x) => {
  const n = typeof x === 'number' ? x : parseFloat(String(x ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const embeddedNum = (x) => {
  if (typeof x === 'number') return x > 0 ? x : 0;
  const m = String(x ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
};
const norm = (s) => String(s ?? '').trim().toLowerCase();
const cleanQuality = (s) => String(s ?? '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
const isLeverbaar = (s) => /^leverbaar/i.test(String(s ?? '').trim());

// roundTo5or9 — identiek aan src/lib/pricing.ts (om afrond-impact te meten).
function roundTo5or9(cents) {
  const rounded = Math.round(cents / 100);
  const base = Math.floor(rounded / 10) * 10;
  const candidates = [base - 1, base + 5, base + 9];
  let best = candidates[0];
  let bestDist = Math.abs(rounded - best);
  for (const c of candidates) {
    const dist = Math.abs(rounded - c);
    if (dist < bestDist) { best = c; bestDist = dist; }
  }
  return best * 100;
}

// Bepaal carpet-afmeting-naam (of m2) uit dim-cellen.
function dimFrom(a, b, vorm) {
  const txt = [a, b, vorm].map((c) => String(c ?? '')).join(' ').toLowerCase();
  if (/maatwerk|m²|m2|afwijkend/.test(txt)) return { unit: 'm2', name: null };
  if (/rond/.test(txt)) {
    const d = embeddedNum(a) || embeddedNum(b) || embeddedNum(vorm);
    if (!d) return null;
    return { unit: 'piece', name: `${pad3(d)} ROND`, round: true };
  }
  const L = num(a), B = num(b);
  if (!L || !B) return null;
  return { unit: 'piece', name: `${pad3(L)}x${pad3(B)}`, alt: `${pad3(B)}x${pad3(L)}` };
}

function parseSheet1(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const out = [];
  let lastQ = null;
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const qRaw = r[2];
    if (qRaw != null && !isLeverbaar(qRaw)) lastQ = String(qRaw).trim();
    if (isLeverbaar(qRaw)) continue;
    const quality = lastQ;
    if (!quality) continue;
    if (r[7] == null && r[8] == null) continue;
    const dim = dimFrom(r[7], r[8], null);
    const verkoop = num(r[13]) || num(r[10]);
    if (!dim || !verkoop) {
      out.push({ skip: true, sheet: 1, row: i, quality, a: r[7], b: r[8], verkoop, reason: !dim ? 'dim' : 'price' });
      continue;
    }
    out.push({ sheet: 1, row: i, quality, fancy: r[3] ?? null, ...dim, verkoop_cents: Math.round(verkoop * 100) });
  }
  return out;
}

function parseSheet2(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && String(rows[i][0] ?? '').toUpperCase() === 'MODELNAAM') { headerRow = i; break; }
  }
  const start = headerRow >= 0 ? headerRow + 1 : 32;
  const out = [];
  let lastQ = null;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const qRaw = r[0];
    if (qRaw != null && !isLeverbaar(qRaw)) lastQ = String(qRaw).trim();
    if (isLeverbaar(qRaw)) continue;
    const quality = lastQ;
    if (!quality) continue;
    if (r[3] == null && r[4] == null) continue;
    const dim = dimFrom(r[3], r[4], r[5]);
    const verkoop = num(r[11]) || num(r[8]);
    if (!dim || !verkoop) {
      out.push({ skip: true, sheet: 2, row: i, quality, a: r[3], b: r[4], vorm: r[5], verkoop, reason: !dim ? 'dim' : 'price' });
      continue;
    }
    out.push({ sheet: 2, row: i, quality, fancy: r[1] ?? null, ...dim, verkoop_cents: Math.round(verkoop * 100) });
  }
  return out;
}

async function rest(p) {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function buildResolved() {
  const wb = XLSX.readFile(FILE);
  const s1 = parseSheet1(wb.Sheets['Huidige collectie In.House']);
  const s2 = parseSheet2(wb.Sheets['Maatwerk collectie Karpi']);
  const all = [...s1, ...s2];
  const ok = all.filter((x) => !x.skip);
  const skipped = all.filter((x) => x.skip);

  const qualities = await rest('qualities?select=id,code,name');
  const dims = await rest('carpet_dimensions?select=id,name,active');
  const qByName = new Map(qualities.map((q) => [norm(q.name), q]));
  const qByCode = new Map(qualities.map((q) => [norm(q.code), q]));
  const dById = new Map(dims.filter((d) => d.active).map((d) => [d.name, d]));

  const resolveQ = (raw) => {
    const n = norm(cleanQuality(raw));
    if (qByName.has(n)) return qByName.get(n);
    if (qByCode.has(n)) return qByCode.get(n);
    if (QUALITY_ALIASES[n]) return qByCode.get(norm(QUALITY_ALIASES[n]));
    return null;
  };

  const resolvable = [];
  const unmatchedQ = new Map();
  const unmatchedD = new Map();
  for (const x of ok) {
    const q = resolveQ(x.quality);
    let dimName = x.unit === 'm2' ? null : x.name;
    let dimOk = x.unit === 'm2' || dById.has(x.name) || (x.alt && dById.has(x.alt));
    if (x.unit !== 'm2' && !dById.has(x.name) && x.alt && dById.has(x.alt)) dimName = x.alt;
    if (!q) unmatchedQ.set(x.quality, (unmatchedQ.get(x.quality) ?? 0) + 1);
    if (!dimOk) unmatchedD.set(x.name, (unmatchedD.get(x.name) ?? 0) + 1);
    if (q && dimOk) resolvable.push({ quality_code: q.code, quality_name: q.name, unit: x.unit, dim_name: dimName, verkoop_cents: x.verkoop_cents, sheet: x.sheet });
  }

  // dedupe op (quality, dim, unit) -> meest voorkomende prijs
  const map = new Map();
  for (const r of resolvable) {
    const key = `${r.quality_code}|${r.dim_name ?? ''}|${r.unit}`;
    let e = map.get(key);
    if (!e) { e = { ...r, prices: new Map() }; map.set(key, e); }
    e.prices.set(r.verkoop_cents, (e.prices.get(r.verkoop_cents) ?? 0) + 1);
  }
  const deduped = [...map.values()].map((e) => {
    const entries = [...e.prices.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return { quality_code: e.quality_code, quality_name: e.quality_name, unit: e.unit, dim_name: e.dim_name, price_cents: entries[0][0], conflict: e.prices.size > 1, all_prices: [...e.prices.keys()] };
  });

  return { s1, s2, ok, skipped, resolvable, deduped, unmatchedQ, unmatchedD, qByCode, dById };
}

async function analyse() {
  const { s1, s2, ok, skipped, resolvable, deduped, unmatchedQ, unmatchedD } = await buildResolved();
  console.log('=== PARSE ===');
  console.log(`Sheet1: ${s1.length} (ok ${s1.filter(x=>!x.skip).length}, skip ${s1.filter(x=>x.skip).length})`);
  console.log(`Sheet2: ${s2.length} (ok ${s2.filter(x=>!x.skip).length}, skip ${s2.filter(x=>x.skip).length})`);
  console.log(`Totaal parse-OK: ${ok.length} | skipped: ${skipped.length}`);
  console.log(`Resolvable: ${resolvable.length} | na dedupe: ${deduped.length} (conflicten: ${deduped.filter(d=>d.conflict).length})`);
  console.log(`  piece: ${deduped.filter(d=>d.unit==='piece').length} | m2: ${deduped.filter(d=>d.unit==='m2').length}`);

  // Afrond-impact: hoeveel prijzen zou roundTo5or9 (factor 1) wijzigen?
  const altered = deduped.filter((d) => roundTo5or9(d.price_cents) !== d.price_cents);
  console.log(`\n=== AFROND-IMPACT (factor ×1 via applySalesPrice) ===`);
  console.log(`Prijzen die roundTo5or9 zou WIJZIGEN: ${altered.length} / ${deduped.length}`);
  for (const d of altered.slice(0, 15)) console.log(`  ${d.quality_code} ${d.unit==='m2'?'m²':d.dim_name}: €${(d.price_cents/100).toFixed(2)} -> €${(roundTo5or9(d.price_cents)/100).toFixed(2)}`);
  if (altered.length > 15) console.log(`  ... +${altered.length - 15} meer`);

  console.log('\n=== ONGEKOPPELDE KWALITEITEN ===');
  if (unmatchedQ.size === 0) console.log('  geen — alles gekoppeld ✓');
  for (const [n, c] of [...unmatchedQ.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  "${n}" (${c})`);

  console.log('\n=== ONGEKOPPELDE AFMETINGEN ===');
  if (unmatchedD.size === 0) console.log('  geen — alles gekoppeld ✓');
  for (const [n, c] of [...unmatchedD.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  "${n}" (${c})`);

  console.log('\n=== SKIPPED RIJEN ===');
  if (skipped.length === 0) console.log('  geen');
  for (const s of skipped) console.log(`  sheet${s.sheet} rij${s.row} q="${s.quality}" reason=${s.reason} a=${JSON.stringify(s.a)} b=${JSON.stringify(s.b)}`);

  console.log('\n=== PRIJSCONFLICTEN ===');
  for (const d of deduped.filter(x=>x.conflict)) console.log(`  ${d.quality_code} ${d.dim_name ?? 'm²'}: ${d.all_prices.map(p=>'€'+(p/100).toFixed(0)).join(' vs ')} -> gekozen €${(d.price_cents/100).toFixed(0)}`);
}

const escSql = (s) => String(s).replace(/'/g, "''");

async function emit(nr, name) {
  if (!nr || !name) { console.error('Usage: --emit <nr> "<naam>"'); process.exit(1); }
  const { deduped } = await buildResolved();
  const piece = deduped.filter((d) => d.unit === 'piece');
  const m2 = deduped.filter((d) => d.unit === 'm2');
  const out = [];
  out.push('-- ============================================================');
  out.push(`-- Prijslijst ${nr} — ${name}`);
  out.push('-- GEGENEREERD door scripts/import-collectie-inhouse-2026.mjs --emit');
  out.push('-- price_cents = de DIRECTE verkoopprijs per 1-6-2026 (geen kostprijs).');
  out.push('-- Sticker/order: kies factor ×1 zodat de prijs 1-op-1 wordt getoond.');
  out.push('-- ============================================================');
  out.push('');
  out.push(`INSERT INTO price_lists (nr, name, valid_from, active) VALUES`);
  out.push(`  ('${escSql(nr)}', '${escSql(name)}', DATE '2026-06-01', true)`);
  out.push(`ON CONFLICT (nr) DO UPDATE SET name = EXCLUDED.name, valid_from = EXCLUDED.valid_from, active = EXCLUDED.active;`);
  out.push('');
  if (piece.length) {
    out.push(`-- ${piece.length} stuks-prijzen`);
    out.push(`INSERT INTO price_list_lines (price_list_nr, quality_id, carpet_dimension_id, price_cents, unit)`);
    out.push(`SELECT '${escSql(nr)}', q.id, cd.id, v.price_cents, 'piece'`);
    out.push(`FROM (VALUES`);
    out.push(piece.map((r) => `  ('${escSql(r.quality_code)}', '${escSql(r.dim_name)}', ${r.price_cents})`).join(',\n'));
    out.push(`) AS v(quality_code, carpet_dim_name, price_cents)`);
    out.push(`JOIN qualities q          ON q.code = v.quality_code`);
    out.push(`JOIN carpet_dimensions cd ON cd.name = v.carpet_dim_name AND cd.active = true`);
    out.push(`ON CONFLICT DO NOTHING;`);
    out.push('');
  }
  if (m2.length) {
    out.push(`-- ${m2.length} m²-prijzen (maatwerk)`);
    out.push(`INSERT INTO price_list_lines (price_list_nr, quality_id, carpet_dimension_id, price_cents, unit)`);
    out.push(`SELECT '${escSql(nr)}', q.id, NULL, v.price_cents, 'm2'`);
    out.push(`FROM (VALUES`);
    out.push(m2.map((r) => `  ('${escSql(r.quality_code)}', ${r.price_cents})`).join(',\n'));
    out.push(`) AS v(quality_code, price_cents)`);
    out.push(`JOIN qualities q ON q.code = v.quality_code`);
    out.push(`ON CONFLICT DO NOTHING;`);
    out.push('');
  }
  const target = `supabase/migrations/20260601_price_list_${nr}_inhouse.sql`;
  fs.writeFileSync(target, out.join('\n'), 'utf8');
  console.log(`Wrote ${target} (${piece.length} stuks + ${m2.length} m² regels)`);
}

async function restWrite(path, body, headers = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function apply(nr, name) {
  if (!nr || !name) { console.error('Usage: --apply <nr> "<naam>"'); process.exit(1); }
  const { deduped, qByCode, dById } = await buildResolved();

  console.log(`Aanmaken prijslijst ${nr} — ${name}...`);
  await restWrite('price_lists', [{ nr, name, valid_from: '2026-06-01', active: true }], {
    Prefer: 'resolution=merge-duplicates',
  });

  const rows = [];
  const missing = [];
  for (const d of deduped) {
    const q = qByCode.get(d.quality_code.toLowerCase());
    if (!q) { missing.push(d); continue; }
    let cdId = null;
    if (d.unit === 'piece') {
      const cd = dById.get(d.dim_name);
      if (!cd) { missing.push(d); continue; }
      cdId = cd.id;
    }
    rows.push({ price_list_nr: nr, quality_id: q.id, carpet_dimension_id: cdId, price_cents: d.price_cents, unit: d.unit });
  }
  console.log(`Te inserten: ${rows.length} regels (missing: ${missing.length})`);
  if (missing.length) for (const m of missing.slice(0, 10)) console.log('  MISSING', JSON.stringify(m));

  const BATCH = 100;
  let inserted = 0, dup = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await restWrite('price_list_lines', batch, {
      Prefer: 'return=representation,resolution=ignore-duplicates',
    });
    inserted += res?.length ?? 0;
    dup += batch.length - (res?.length ?? 0);
    process.stdout.write('.');
  }
  console.log(`\nKlaar. Inserted: ${inserted} | duplicaten genegeerd: ${dup}`);
}

const ARG = process.argv[2];
if (ARG === '--analyse') analyse().catch((e) => { console.error(e); process.exit(1); });
else if (ARG === '--emit') emit(process.argv[3], process.argv[4]).catch((e) => { console.error(e); process.exit(1); });
else if (ARG === '--apply') apply(process.argv[3], process.argv[4]).catch((e) => { console.error(e); process.exit(1); });
else { console.error('Usage: node scripts/import-collectie-inhouse-2026.mjs --analyse | --emit <nr> "<naam>" | --apply <nr> "<naam>"'); process.exit(1); }
