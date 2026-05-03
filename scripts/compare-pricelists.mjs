import XLSX from 'xlsx';
import fs from 'node:fs';

// Load .env.local
const env = fs.readFileSync('.env.local', 'utf8');
const URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();

async function rest(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Profile': 'public',
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

function readClients(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  // Find header row containing "Debiteur"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i] && rows[i][0] === 'Debiteur') { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error(`No header row in ${file}`);
  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[0] == null) continue;
    const num = String(r[0]).trim();
    if (!/^\d+$/.test(num)) continue;
    out.push({ nr: num, name: r[1], plistText: r[19] });
  }
  return out;
}

const xls150 = readClients('klantenbestand prijslijst 150.xlsx');
const xls151 = readClients('klantenbestand prijslijst 151.xlsx');
console.log(`Excel 150: ${xls150.length} klanten`);
console.log(`Excel 151: ${xls151.length} klanten`);

// Verify "Prijslijst" column says 0150/0151 consistently
const odd150 = xls150.filter(c => !String(c.plistText || '').startsWith('0150'));
const odd151 = xls151.filter(c => !String(c.plistText || '').startsWith('0151'));
console.log(`Excel 150 met afwijkende Prijslijst-kolom: ${odd150.length}`);
if (odd150.length) console.log(odd150.slice(0,5));
console.log(`Excel 151 met afwijkende Prijslijst-kolom: ${odd151.length}`);
if (odd151.length) console.log(odd151.slice(0,5));

// Fetch all clients from supabase (with price_list_nr + client_number)
let allClients = [];
let from = 0;
const PAGE = 1000;
while (true) {
  const page = await fetch(`${URL}/rest/v1/clients?select=client_number,name,price_list_nr&order=client_number`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + PAGE - 1}` },
  });
  if (!page.ok) throw new Error(`${page.status} ${await page.text()}`);
  const arr = await page.json();
  allClients = allClients.concat(arr);
  if (arr.length < PAGE) break;
  from += PAGE;
}
console.log(`Supabase clients: ${allClients.length}`);

const byNr = new Map(allClients.map(c => [String(c.client_number), c]));
const sb150 = allClients.filter(c => c.price_list_nr === '0150');
const sb151 = allClients.filter(c => c.price_list_nr === '0151');
console.log(`Supabase 0150: ${sb150.length} klanten`);
console.log(`Supabase 0151: ${sb151.length} klanten`);

function diff(label, xlsList, sbSet, expectedNr) {
  const xlsSet = new Set(xlsList.map(c => c.nr));
  const missingInSb = []; // in Excel maar niet (op deze prijslijst) in Supabase
  const extraInSb = [];   // in Supabase op deze prijslijst maar niet in Excel
  for (const c of xlsList) {
    const sbC = byNr.get(c.nr);
    if (!sbC) missingInSb.push({ ...c, reason: 'klant ontbreekt volledig in Supabase' });
    else if (sbC.price_list_nr !== expectedNr) missingInSb.push({ ...c, reason: `staat op ${sbC.price_list_nr}` });
  }
  for (const c of sbSet) {
    if (!xlsSet.has(String(c.client_number))) extraInSb.push(c);
  }
  console.log(`\n=== ${label} ===`);
  console.log(`In Excel maar niet correct in Supabase: ${missingInSb.length}`);
  if (missingInSb.length) {
    for (const m of missingInSb.slice(0, 30)) console.log(`  ${m.nr}  ${m.name}  — ${m.reason}`);
    if (missingInSb.length > 30) console.log(`  ... +${missingInSb.length - 30} more`);
  }
  console.log(`Op deze prijslijst in Supabase maar niet in Excel: ${extraInSb.length}`);
  if (extraInSb.length) {
    for (const m of extraInSb.slice(0, 30)) console.log(`  ${m.client_number}  ${m.name}`);
    if (extraInSb.length > 30) console.log(`  ... +${extraInSb.length - 30} more`);
  }
}

diff('PRIJSLIJST 0150', xls150, sb150, '0150');
diff('PRIJSLIJST 0151', xls151, sb151, '0151');

// Check if prices for 0150 / 0151 are identical
console.log('\n\n=== PRIJZEN VERGELIJKING ===');
const lines = await rest('price_list_lines?select=price_list_nr,quality_id,carpet_dimension_id,unit,price_cents&price_list_nr=in.(001,0150,0151)&order=price_list_nr,quality_id');
console.log(`Totaal price_list_lines (001+0150+0151): ${lines.length}`);
const groups = {};
for (const l of lines) {
  const key = `${l.unit}|${l.quality_id}|${l.carpet_dimension_id}`;
  groups[key] = groups[key] || {};
  groups[key][l.price_list_nr] = l.price_cents;
}
let same = 0, diff150v001 = 0, diff151v001 = 0, diff151v150 = 0;
const samples151diff = [];
for (const k in groups) {
  const g = groups[k];
  if (g['001'] === g['0150'] && g['0150'] === g['0151']) same++;
  if (g['001'] !== g['0150']) diff150v001++;
  if (g['001'] !== g['0151']) diff151v001++;
  if (g['0150'] !== g['0151']) {
    diff151v150++;
    if (samples151diff.length < 10) samples151diff.push({ k, ...g });
  }
}
console.log(`Combinaties met identieke prijs 001/0150/0151: ${same}`);
console.log(`Combinaties waar 0150 ≠ 001: ${diff150v001}`);
console.log(`Combinaties waar 0151 ≠ 001: ${diff151v001}`);
console.log(`Combinaties waar 0151 ≠ 0150: ${diff151v150}`);
if (samples151diff.length) {
  console.log('Voorbeelden 0151 ≠ 0150:');
  console.log(samples151diff);
}
