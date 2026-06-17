// Uitzondering: BEACH LIFE (BEAC) kleur 99 is duurder dan de andere kleuren.
// Het ERP-model (price_list_lines) is per kwaliteit×afmeting (kleur-agnostisch),
// dus de meerderheidsprijs staat daar. Voor kleur 99 zetten we een VOLLEDIGE
// kleur-override in price_list_color_lines — die wint in getCarpetPricesForSamples.
// Override = full-replacement, dus alle 11 prijspunten van kleur 99 (10 stuks + 1 m²).
//
//   --emit   : schrijf supabase/migrations/20260617_beac99_exception_0107.sql
//   --apply [--confirm] : DELETE+INSERT via PostgREST (service role)

import XLSX from 'xlsx';
import fs from 'node:fs';

const FILE = 'advies_prijslt0107_a.xlsx';
const LIST_NR = '0107';
const QUALITY_CODE = 'BEAC';
const COLOR_CODE = '99';
const ARG = process.argv[2];

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

function dimName(raw) {
  const rnd = raw.match(/^(\d+)RND$/);
  if (rnd) return `${String(rnd[1]).padStart(3, '0')} ROND`;
  if (/^\d{6}$/.test(raw)) {
    const w = +raw.slice(0, 3), h = +raw.slice(3);
    if (w > h) return `${String(h).padStart(3, '0')}x${String(w).padStart(3, '0')} organisch`;
    return `${String(w).padStart(3, '0')}x${String(h).padStart(3, '0')}`;
  }
  return null;
}

// Parse alle BEAC kleur-99 regels uit de Excel.
function readColor99() {
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const piece = [];
  let m2 = null;
  for (let i = 3; i < rows.length; i++) {
    const d = rows[i] && rows[i][1];
    const p = rows[i] && rows[i][3];
    if (!d || p == null) continue;
    const s = String(d);
    if (!s.startsWith(`${QUALITY_CODE}${COLOR_CODE}`)) continue;
    const price = Math.round(Number(p) * 100);
    let mm = s.match(/^BEAC99(MAATWERK|MAATWK)$/);
    if (mm) { m2 = price; continue; }
    mm = s.match(/^BEAC99[A-Z][A-Z0-9](.+)$/);
    if (!mm) continue;
    const dn = dimName(mm[1]);
    if (dn) piece.push({ dim_name: dn, price_cents: price });
  }
  return { piece, m2 };
}

async function rest(path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function emitSql({ piece, m2 }) {
  const sql = [
    '-- ============================================================',
    '-- Uitzondering: BEACH LIFE (BEAC) kleur 99 duurder — prijslijst 0107',
    '-- ============================================================',
    '-- GEGENEREERD door scripts/beac99-exception-0107.mjs --emit',
    `-- Bron: ${FILE}`,
    '-- Volledige kleur-override (price_list_color_lines wint in pricing.ts).',
    '-- Idempotent: eerst de bestaande override voor (0107,BEAC,99) wissen.',
    '-- color_codes is per-kwaliteit gescoped → join op code 99 ÉN quality_id.',
    '-- ============================================================',
    '',
    `DELETE FROM price_list_color_lines pcl`,
    `USING qualities q, color_codes cc`,
    `WHERE pcl.price_list_nr = '${LIST_NR}'`,
    `  AND q.code = '${QUALITY_CODE}' AND pcl.quality_id = q.id`,
    `  AND cc.code = '${COLOR_CODE}' AND cc.quality_id = q.id AND pcl.color_code_id = cc.id;`,
    '',
    `-- ${piece.length} stuks-prijzen (kleur 99)`,
    `INSERT INTO price_list_color_lines (price_list_nr, quality_id, color_code_id, carpet_dimension_id, price_cents, unit)`,
    `SELECT '${LIST_NR}', q.id, cc.id, cd.id, v.price_cents, 'piece'`,
    `FROM (VALUES`,
    piece.map((r) => `  ('${r.dim_name}', ${r.price_cents})`).join(',\n'),
    `) AS v(carpet_dim_name, price_cents)`,
    `JOIN qualities q          ON q.code = '${QUALITY_CODE}'`,
    `JOIN color_codes cc       ON cc.code = '${COLOR_CODE}' AND cc.quality_id = q.id`,
    `JOIN carpet_dimensions cd ON cd.name = v.carpet_dim_name AND cd.active = true;`,
    '',
  ];
  if (m2 != null) {
    sql.push(`-- m²-prijs maatwerk (kleur 99)`);
    sql.push(`INSERT INTO price_list_color_lines (price_list_nr, quality_id, color_code_id, carpet_dimension_id, price_cents, unit)`);
    sql.push(`SELECT '${LIST_NR}', q.id, cc.id, NULL, ${m2}, 'm2'`);
    sql.push(`FROM qualities q`);
    sql.push(`JOIN color_codes cc ON cc.code = '${COLOR_CODE}' AND cc.quality_id = q.id`);
    sql.push(`WHERE q.code = '${QUALITY_CODE}';`);
    sql.push('');
  }
  return sql.join('\n');
}

async function main() {
  const data = readColor99();
  console.log(`Kleur 99: ${data.piece.length} stuks-prijzen + m²=${data.m2 != null ? '€' + data.m2 / 100 : 'geen'}`);
  for (const r of data.piece) console.log(`  ${r.dim_name}: €${r.price_cents / 100}`);

  if (ARG === '--emit') {
    const target = 'supabase/migrations/20260617_beac99_exception_0107.sql';
    fs.writeFileSync(target, emitSql(data), 'utf8');
    console.log(`Wrote ${target}`);
    return;
  }

  if (ARG === '--apply') {
    const q = await rest(`qualities?select=id&code=eq.${QUALITY_CODE}`);
    const qid = q[0]?.id;
    const cc = await rest(`color_codes?select=id&code=eq.${COLOR_CODE}&quality_id=eq.${qid}`);
    const ccid = cc[0]?.id;
    if (!qid || !ccid) throw new Error(`quality/color niet gevonden: q=${qid} cc=${ccid}`);
    const dims = await rest('carpet_dimensions?select=id,name,active');
    const dById = new Map(dims.filter((d) => d.active).map((d) => [d.name, d.id]));

    const rows = [];
    for (const r of data.piece) {
      const did = dById.get(r.dim_name);
      if (!did) throw new Error(`afmeting niet gevonden: ${r.dim_name}`);
      rows.push({ price_list_nr: LIST_NR, quality_id: qid, color_code_id: ccid, carpet_dimension_id: did, price_cents: r.price_cents, unit: 'piece' });
    }
    if (data.m2 != null) rows.push({ price_list_nr: LIST_NR, quality_id: qid, color_code_id: ccid, carpet_dimension_id: null, price_cents: data.m2, unit: 'm2' });

    console.log(`\nKlaar om ${rows.length} override-regels te schrijven voor (0107, BEAC, 99).`);
    if (process.argv[3] !== '--confirm') { console.log('Dry-run. Voeg --confirm toe.'); return; }

    // Idempotent: eerst bestaande override voor deze (lijst,kwaliteit,kleur) wissen.
    await rest(`price_list_color_lines?price_list_nr=eq.${LIST_NR}&quality_id=eq.${qid}&color_code_id=eq.${ccid}`, { method: 'DELETE' });
    const result = await rest('price_list_color_lines', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(rows),
    });
    console.log(`Ingevoegd: ${result?.length ?? 0} regels.`);
    return;
  }

  console.error('Usage: node scripts/beac99-exception-0107.mjs --emit | --apply [--confirm]');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
