# Prijslijsten 0210-0217 Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importeer 8 nieuwe Benelux-prijslijsten (0210 t/m 0217) uit Excel-bestanden in de Karpi DB, en hermap klanten van legacy 0150 → 0210 / 0151 → 0211 zoals aangeleverd door Sales Support.

**Architecture:** Eén Node-script (`scripts/import-prijslijsten-210-217.mjs`) leest de 8 Excel-bestanden, ontleedt elke regel-omschrijving (`{QUAL}{COLOR}XX{DIM}` of `{QUAL}{COLOR}MAATWERK`), dedupliceert per `(quality, carpet_dim, unit)` met logging van conflicten, en genereert één SQL-migratie met `INSERT … SELECT` via een `VALUES`-tabel die op `qualities.code` + `carpet_dimensions.name` joint (geen UUID-hardcoding). Een tweede, handmatige migratie maakt de prijslijst-headers aan en voert de klant-remap uit. Dit volgt het patroon van [`20260503_price_lists_v2.sql`](supabase/migrations/20260503_price_lists_v2.sql).

**Tech Stack:**
- Node 20 + `xlsx` (al in `package.json`)
- Supabase Postgres met bestaand schema uit [`20260503_price_lists_v3_m2.sql`](supabase/migrations/20260503_price_lists_v3_m2.sql)
- `curl` voor REST-API verificatie tegen project `mbqvhpdwtgtfbnscqrul`

**Bron-bestanden (in repo root):**
- `Prijslijst 210 BENELUX 1-4-26.xlsx` → 0210
- `prijslijst 211 BENELUX + MV 1-4-26.xlsx` → 0211
- `prijslijst 212 BENELUX+ BAMBOE 1-4-26 (1).xlsx` → 0212
- `prijslijst 213 BENELUX + MV + BAMBOE 1-4-26.xlsx` → 0213
- `prijslijst 214 BENELUX + RM 1-4-26.xlsx` → 0214
- `prijslijst 215 BENELUX + RM + MV 1-4-26.xlsx` → 0215
- `prijslijst 216 BENELUX + RM + BAMBOE 1-4-26 (1).xlsx` → 0216
- `prijslijst 217 BENELUX + RM + MV + BAMBOE 1-4-26.xlsx` → 0217

**Mapping oud → nieuw (uit Sales Support email):**

| Oud  | Nieuw | Omschrijving                |
|------|-------|-----------------------------|
| 0150 | 0210  | Benelux                     |
| 0151 | 0211  | Benelux + MV                |
| 0152 | 0212  | Benelux + bamboe            |
| 0153 | 0213  | Benelux + MV + bamboe       |
| —    | 0214  | Benelux + RM                |
| —    | 0215  | Benelux + RM + MV           |
| —    | 0216  | Benelux + RM + BAMBOE       |
| —    | 0217  | Benelux + RM + MV + BAMBOE  |

Alleen 0150 en 0151 hebben klant-koppelingen in de DB (uit eerdere klantenbestanden). Voor 0152-0153 en 0214-0217 worden **geen** klanten geremapt; die lijsten bestaan straks wel met regels maar zonder gekoppelde klanten.

---

## File Structure

| Bestand | Verantwoordelijkheid |
|---------|----------------------|
| `scripts/import-prijslijsten-210-217.mjs` (NIEUW) | Excel parser + SQL-generator. Twee modes: `--analyse` (alleen rapport) en `--emit` (schrijft de lines-migratie). Idempotent: re-runnen overschrijft de gegenereerde migratie. |
| `supabase/migrations/20260504_price_lists_210_217_headers.sql` (NIEUW, handmatig) | Maakt de 8 headers in `price_lists`, hermapt klanten 0150 → 0210 en 0151 → 0211, deactiveert 0150/0151. |
| `supabase/migrations/20260504_price_list_lines_210_217.sql` (NIEUW, gegenereerd) | Alle `INSERT … SELECT` statements per prijslijst. Komt 100% uit het script — handmatig editen is anti-pattern. |
| `docs/architecture/decisions.md` (UPDATE) | Voeg ADR toe: "import-script genereert SQL ipv hardgecodeerde data — bron blijft de Excel". |
| `CLAUDE.md` (UPDATE) | "Huidige status" bijwerken: 0210-0217 geïmporteerd, 0150/0151 deactivated. |

**Niet aanraken:**
- Geen wijzigingen aan `src/lib/pricing.ts` of stickers — het schema (`price_list_lines` met `unit`-kolom) is al in v3 toegevoegd. Stickers tonen automatisch de juiste prijzen zodra rijen aanwezig zijn.
- Geen wijzigingen aan `qualities` of `carpet_dimensions` — als er codes/dimensies missen, eerst rapporteren in Task 2 en met user afstemmen vóór Task 3.

---

## Task 1: Bouw Excel-parser + analyse-mode

**Doel:** Lees alle 8 Excels, ontleed iedere artikel-omschrijving in `(quality_code, carpet_dim_name, unit, price_cents)`, en rapporteer:
1. Totaal aantal regels per prijslijst (verwacht: 1802-2146 rijen).
2. Unieke quality codes — markeer welke ontbreken in `qualities.code`.
3. Unieke dimension tails — markeer welke ontbreken in `carpet_dimensions`.
4. Prijs-conflicten per `(list_nr, quality, dim)` (verschillende kleuren, verschillende prijzen).

**Files:**
- Create: `scripts/import-prijslijsten-210-217.mjs`

**Decompositie-regels:**

De omschrijving (kolom C, index 2) van elke data-rij volgt één van twee patronen:

1. **Stuks-regel:** `{QUAL}{COLOR}XX{DIM}` waarbij `DIM` is:
   - Een 6-cijferige string `WWWHHH` → carpet `name = "WWWxHHH"` (3-3 split, met leading zeros zoals "060x090").
   - `{NNN}RND` (bv. `080RND`, `120RND`, `350RND`) → carpet `name = "<NNN> ROND"` (zero-padded tot 3, met spatie).

2. **Maatwerk-regel:** `{QUAL}{COLOR}MAATWERK` → `unit = 'm2'`, `carpet_dimension_id = NULL`.

**Reversed/organisch dims:** Sommige tails staan met width/height omgekeerd (bv. `230160` correspondeert met `160x230 organisch`, `290200` met `200x290 organisch`). Het script doet hier expliciet **geen** auto-swap of fuzzy-matching. Deze tails resulteren in een dim_name (bv. `230x160`) die niet bestaat in `carpet_dimensions`; de halt-conditie in Task 1 Step 3 vangt ze. De user beslist dan per geval: nieuwe dim toevoegen, hernoemen, of skip. Dit is consistent met hoe ontbrekende qualities (CLSS, FEAT, …) en exotische dims (`275400`, `340240`) worden behandeld.

`{COLOR}` is altijd numeriek (1-3 cijfers). `{QUAL}` is altijd 4 hoofdletters (uit `qualities.code`).

**Prijs-conversie:** Excel-prijzen zijn integers/floats in euro's. DB-kolom is `price_cents` (integer). `price_cents = Math.round(excel_price * 100)`. Verwerp regels met prijs ≤ 0 (zoals v2 ook doet).

**Conflict-resolutie:** Als binnen één Excel meerdere regels dezelfde `(quality, dim, unit)` produceren met verschillende prijzen, kies de **modus** (meest voorkomende prijs). Bij gelijke counts: de laagste. Log altijd het conflict zodat user kan reviewen — sales-prijslijsten hebben soms premium-toeslag voor specifieke kleuren maar het schema ondersteunt geen kleur-specifieke prijzen.

- [ ] **Step 1: Maak script-skeleton met CLI-modes**

```javascript
// scripts/import-prijslijsten-210-217.mjs
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
  // RND
  const rnd = dimRaw.match(/^(\d+)RND$/);
  if (rnd) {
    const n = String(rnd[1]).padStart(3, '0');
    return { quality, unit: 'piece', dim_name: `${n} ROND` };
  }
  // 6-digit dimension WWWHHH
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
  // key = quality|dim_name|unit → { prices: Map<price, count>, samples: string[] }
  const map = new Map();
  for (const p of parsed) {
    if (p.skip) continue;
    const key = `${p.quality}|${p.dim_name ?? ''}|${p.unit}`;
    let entry = map.get(key);
    if (!entry) { entry = { prices: new Map(), samples: [] }; map.set(key, entry); }
    entry.prices.set(p.price_cents, (entry.prices.get(p.price_cents) ?? 0) + 1);
    if (entry.samples.length < 3) entry.samples.push(p.src_desc);
  }
  // resolve to single price per key
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
  // implementation in step 2
}
if (ARG === '--emit') {
  // implementation in step 4
}
```

- [ ] **Step 2: Implementeer `--analyse` mode**

Voeg toe direct na de skeleton:

```javascript
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
```

- [ ] **Step 3: Run analyse en valideer tegen DB**

Run: `node scripts/import-prijslijsten-210-217.mjs --analyse > /tmp/analyse.txt 2>&1; head -200 /tmp/analyse.txt`

Verwacht:
- Summary toont 8 regels met `ok ≈ raw - 1` (alleen header-rijen worden overgeslagen).
- `resolved` per lijst: ≈ 200-260 unieke `(quality, dim, unit)` combinaties.
- `Unique qualities` lijst: ~69 codes.
- `Unique dim names` lijst: ~40 dim-namen + MAATWERK heeft `dim_name=null`.

Verifieer ontbrekende qualities tegen Supabase (gebruik service-role key uit `.env.local`):

```bash
SUPA_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2)
QS=$(grep "^Unique qualities:" /tmp/analyse.txt | cut -d: -f2 | tr -d ' ' | tr ',' '\n' | sort -u)
for q in $QS; do
  found=$(curl -s "https://mbqvhpdwtgtfbnscqrul.supabase.co/rest/v1/qualities?select=code&code=eq.$q" -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY")
  if [ "$found" = "[]" ]; then echo "MISSING quality: $q"; fi
done
```

Verifieer ontbrekende dimensies analoog op `carpet_dimensions?select=name&name=eq.<name>` (URL-encode spaties als `%20`).

**Halt-conditie:** Als er ontbrekende qualities of dimensies zijn, of ontbrekende dimensies anders dan `MAATWERK`, **stop hier** en overleg met user. Bekend uit verkenning: tails `275400` en `340240` ontbreken mogelijk. Mogelijke acties:
1. User levert nieuwe rijen voor `carpet_dimensions` aan → handmatige migratie eerst.
2. Skip die rijen tijdelijk → script logt + emit slaat over.

Ga pas verder als alle qualities + dims gemapt zijn óf user akkoord is met skips.

- [ ] **Step 4: Commit script + analyse-resultaat**

```bash
git add scripts/import-prijslijsten-210-217.mjs
git commit -m "feat(prijslijsten): excel-parser + analyse mode voor 0210-0217"
```

---

## Task 2: Genereer SQL-migratie voor `price_list_lines`

**Doel:** Breid script uit met `--emit` mode dat een idempotente SQL-migratie produceert die alle regels invoegt via `INSERT … SELECT` met JOIN op `qualities.code` en `carpet_dimensions.name`.

**Files:**
- Modify: `scripts/import-prijslijsten-210-217.mjs`
- Create: `supabase/migrations/20260504_price_list_lines_210_217.sql` (gegenereerd)

- [ ] **Step 1: Implementeer `--emit` mode**

Voeg toe aan script:

```javascript
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

function escSql(s) {
  return String(s).replace(/'/g, "''");
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
    '--',
    '-- NB: ON CONFLICT DO NOTHING zonder column-target — dat is bewust:',
    '-- v3 gebruikt PARTIAL unique indexen (WHERE unit=...), en die kun je',
    '-- niet als ON CONFLICT-target opgeven. Postgres pakt automatisch het',
    '-- juiste partial index als arbiter.',
    '-- ============================================================',
    ''];
  for (const f of FILES) {
    const parsed = readPriceList(f.file).filter((p) => !p.skip);
    const { resolved } = dedupe(parsed);
    out.push(emitSqlForList(f.nr, resolved));
  }
  const target = 'supabase/migrations/20260504_price_list_lines_210_217.sql';
  fs.writeFileSync(target, out.join('\n'), 'utf8');
  console.log(`Wrote ${target} (${fs.statSync(target).size} bytes)`);
}
```

- [ ] **Step 2: Run emit en inspecteer output**

Run: `node scripts/import-prijslijsten-210-217.mjs --emit`

Verwacht: één bestand `supabase/migrations/20260504_price_list_lines_210_217.sql`. Open en scroll naar:
- Begin van 0210-blok: één `INSERT … SELECT … (VALUES …)` voor stuks, één voor m².
- 8 vergelijkbare blokken voor 0210-0217.
- Geen ge-escape'de quotes nodig (alle quality codes zijn alfabetisch, dim-namen bevatten geen `'`).

Spot-check: zoek de regel met `BABY` + `120x180` voor 0210. Verwacht `5000` cents (de Excel toont 50,00 €).

```bash
grep -A 1 "0210" supabase/migrations/20260504_price_list_lines_210_217.sql | grep -E "'BABY', '120x180'"
```

Verwacht: `('BABY', '120x180', 5000)`.

- [ ] **Step 3: Commit gegenereerde SQL**

```bash
git add scripts/import-prijslijsten-210-217.mjs supabase/migrations/20260504_price_list_lines_210_217.sql
git commit -m "feat(prijslijsten): emit-mode + gegenereerde SQL voor 0210-0217"
```

---

## Task 3: Schrijf headers + client-remap migratie

**Doel:** Maak de 8 prijslijst-headers aan, hermap klanten die nu op 0150 staan naar 0210 en 0151 → 0211, en deactiveer 0150/0151 zodat de UI ze niet meer als selecteerbaar toont.

**Files:**
- Create: `supabase/migrations/20260504_price_lists_210_217_headers.sql`

- [ ] **Step 1: Schrijf migratie**

```sql
-- ============================================================
-- Prijslijsten 0210 t/m 0217 — headers + klant-remap
-- ============================================================
-- Achtergrond:
-- v2 importeerde 0150 (Benelux) en 0151 (Benelux + MV) op basis van
-- klantenbestanden met (synthetische) prijzen uit quality_base_prices.
-- Sales Support levert nu 8 echte prijslijsten per 01.04.2026:
--   0210 Benelux              (vervangt 0150)
--   0211 Benelux + MV         (vervangt 0151)
--   0212 Benelux + bamboe     (vervangt 0152, geen klanten gemapt)
--   0213 Benelux + MV + bamboe (vervangt 0153, geen klanten gemapt)
--   0214 Benelux + RM
--   0215 Benelux + RM + MV
--   0216 Benelux + RM + bamboe
--   0217 Benelux + RM + MV + bamboe
--
-- Deze migratie maakt de 8 headers aan en hermapt klanten op 0150/0151.
-- De prijs-regels worden ingevoerd door de gegenereerde
-- 20260504_price_list_lines_210_217.sql migratie (run die NA deze).
-- ============================================================

-- ─── 1. Headers aanmaken ──────────────────────────────────

INSERT INTO price_lists (nr, name, valid_from, active) VALUES
  ('0210', 'Benelux per 01.04.2026',                     DATE '2026-04-01', true),
  ('0211', 'Benelux + MV per 01.04.2026',                DATE '2026-04-01', true),
  ('0212', 'Benelux + bamboe per 01.04.2026',            DATE '2026-04-01', true),
  ('0213', 'Benelux + MV + bamboe per 01.04.2026',       DATE '2026-04-01', true),
  ('0214', 'Benelux + RM per 01.04.2026',                DATE '2026-04-01', true),
  ('0215', 'Benelux + RM + MV per 01.04.2026',           DATE '2026-04-01', true),
  ('0216', 'Benelux + RM + bamboe per 01.04.2026',       DATE '2026-04-01', true),
  ('0217', 'Benelux + RM + MV + bamboe per 01.04.2026',  DATE '2026-04-01', true)
ON CONFLICT (nr) DO UPDATE SET
  name = EXCLUDED.name,
  valid_from = EXCLUDED.valid_from,
  active = EXCLUDED.active;

-- ─── 2. Klanten hermappen 0150 → 0210, 0151 → 0211 ────────
-- Sales Support email 2026-05-03: nieuwe lijsten vervangen de oude
-- per ingangsdatum 2026-04-01.

UPDATE clients SET price_list_nr = '0210' WHERE price_list_nr = '0150';
UPDATE clients SET price_list_nr = '0211' WHERE price_list_nr = '0151';

-- ─── 3. Oude lijsten deactiveren ─────────────────────────
-- We laten de rows + regels staan voor historische orders/audit, maar
-- de UI filtert op active=true en zal ze niet meer als keuze tonen.

UPDATE price_lists SET active = false WHERE nr IN ('0150', '0151');
```

- [ ] **Step 2: Run migratie via Supabase SQL Editor**

**Vóór** de migratie: leg pre-counts vast zodat je post-counts kunt vergelijken.

```bash
SUPA_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2)
echo "PRE 0150:"; curl -s "https://mbqvhpdwtgtfbnscqrul.supabase.co/rest/v1/clients?select=count&price_list_nr=eq.0150" -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Prefer: count=exact" -I | grep -i content-range
echo "PRE 0151:"; curl -s "https://mbqvhpdwtgtfbnscqrul.supabase.co/rest/v1/clients?select=count&price_list_nr=eq.0151" -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Prefer: count=exact" -I | grep -i content-range
```

Plak vervolgens de inhoud van de migratie in https://supabase.com/dashboard/project/mbqvhpdwtgtfbnscqrul/sql/new en run.

Verifieer:

```bash
SUPA_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2)
curl -s "https://mbqvhpdwtgtfbnscqrul.supabase.co/rest/v1/price_lists?select=nr,name,active&nr=in.(0150,0151,0210,0211,0212,0213,0214,0215,0216,0217)&order=nr.asc" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY"
```

Verwacht:
- 10 rijen, `active=false` voor 0150/0151, `active=true` voor 0210-0217.

```bash
for nr in 0210 0211 0150 0151; do
  echo "POST $nr:"; curl -s "https://mbqvhpdwtgtfbnscqrul.supabase.co/rest/v1/clients?select=count&price_list_nr=eq.$nr" \
    -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Prefer: count=exact" -I | grep -i content-range
done
```

Verwacht: post-0210 = pre-0150, post-0211 = pre-0151, post-0150 = 0, post-0151 = 0.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260504_price_lists_210_217_headers.sql
git commit -m "feat(prijslijsten): headers 0210-0217 + remap klanten 0150→0210, 0151→0211"
```

---

## Task 4: Run lines-migratie + verifieer

**Doel:** Draai de gegenereerde SQL en verifieer dat alle regels correct in de DB staan.

**Files:** geen (alleen DB-acties)

- [ ] **Step 1: Run lines-migratie**

Open `supabase/migrations/20260504_price_list_lines_210_217.sql` in editor, kopieer integraal naar Supabase SQL Editor en run. Verwacht: geen errors, alle `INSERT`s succesvol.

Als een statement faalt op `ON CONFLICT`: de migratie is hier idempotent dankzij `ON CONFLICT DO NOTHING`. Re-runnen is veilig.

Als FK-fout op `quality_id` of `carpet_dimension_id`: betekent dat een quality of dim ontbreekt die de analyse-stap had moeten flaggen — terug naar Task 1 Step 3.

- [ ] **Step 2: Verifieer counts per prijslijst**

```bash
SUPA_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2)
for nr in 0210 0211 0212 0213 0214 0215 0216 0217; do
  C=$(curl -s "https://mbqvhpdwtgtfbnscqrul.supabase.co/rest/v1/price_list_lines?select=count&price_list_nr=eq.$nr" \
    -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Prefer: count=exact" -I | grep -i content-range)
  echo "$nr: $C"
done
```

Verwacht (uit Task 1 Step 3 analyse-output, kolom `resolved`): match op 1-2 rijen.

Stuks- vs m²-split:

```bash
curl -s "https://mbqvhpdwtgtfbnscqrul.supabase.co/rest/v1/price_list_lines?select=unit,price_list_nr&price_list_nr=in.(0210,0211,0212,0213,0214,0215,0216,0217)" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);const m=new Map();for(const x of r){const k=x.price_list_nr+"/"+x.unit;m.set(k,(m.get(k)??0)+1)}console.log([...m.entries()].sort().map(([k,v])=>k+": "+v).join("\n"))}'
```

Verwacht: per prijslijst zowel `piece` (200-260 rijen) als `m2` (~40-70 rijen).

- [ ] **Step 3: Spot-check 5 willekeurige bekende prijzen**

```sql
-- Run in Supabase SQL Editor
SELECT pl.price_list_nr, q.code AS quality, cd.name AS dim, pl.unit, pl.price_cents
FROM price_list_lines pl
JOIN qualities q ON q.id = pl.quality_id
LEFT JOIN carpet_dimensions cd ON cd.id = pl.carpet_dimension_id
WHERE (pl.price_list_nr, q.code, COALESCE(cd.name, 'MAATWERK')) IN (
  ('0210', 'BABY', '120x180'),
  ('0210', 'BEAC', 'MAATWERK'),
  ('0211', 'AEST', 'MAATWERK'),
  ('0214', 'LORA', '160x230'),
  ('0217', 'BEAC', '300x400')
)
ORDER BY pl.price_list_nr, q.code;
```

Open één Excel per geselecteerde combinatie en bevestig prijs (in euro's = `price_cents / 100`).

Voorbeeld 0210 / BABY / 120x180 → uit `Prijslijst 210 BENELUX 1-4-26.xlsx` row 3: prijs 50 → 5000 cents.

- [ ] **Step 4: UI-rooktest**

```bash
npm run dev
```

Open http://localhost:3000/prijslijst — verwacht 8 nieuwe rijen 0210-0217 met counts > 1500 artikelen elk en correcte gekoppelde-klanten-aantallen voor 0210/0211. Klik 0210 → detail-pagina laadt 1800+ artikelen in 1-2 seconden.

Open een sticker-print voor een staal met quality `BABY` en een klant op 0210 — verwacht dat de carpet-prijzen (120x180, 160x230, 200x290 …) en m²-prijs in de sticker getoond worden, in dezelfde verkoop-vermenigvuldigd-en-afgerond formaat als bij 0150 (logica zit in [`src/lib/pricing.ts`](src/lib/pricing.ts)).

- [ ] **Step 5: Commit (geen extra files, dus skip als nothing to commit)**

Geen file-changes — DB-state is verandered. Skip commit-stap.

---

## Task 5: Update documentatie

**Doel:** CLAUDE.md status + decisions.md ADR bijwerken.

**Files:**
- Modify: `CLAUDE.md` (regel "Huidige status")
- Modify: `docs/architecture/decisions.md`

- [ ] **Step 1: Update CLAUDE.md status**

Voeg direct ná de regel die begint met `- [x] **Prijslijsten v2 (mei 2026)**` deze nieuwe regel in:

```
- [x] **Prijslijsten 0210-0217 (mei 2026)** — 8 echte Benelux-prijslijsten geïmporteerd uit Excel-bestanden van Sales Support per 01.04.2026. Klanten op 0150 → 0210, 0151 → 0211. 0150/0151 op `active=false` (historisch, niet selecteerbaar in UI).
```

(De bestaande v2-regel blijft ongewijzigd staan.)

Als de drie 0503-migraties (`price_lists` + `order_lines_sample_id` + `price_lists_v2`) inmiddels gedraaid zijn in productie, vink dan ook de overeenkomstige `- [ ]` open-regels af door ze te verwijderen of `[x]` te maken.

Voeg toe onder "Huidige status":
```
- [ ] Migraties `20260504_price_lists_210_217_headers.sql` + `20260504_price_list_lines_210_217.sql` uitvoeren in productie indien nog niet gebeurd
```

- [ ] **Step 2: Voeg ADR toe aan decisions.md**

Append (na bestaande ADR's, datum 2026-05-03):

```markdown
## ADR-XXXX: Prijslijst-import via gegenereerde SQL ipv hardcoded data

**Datum:** 2026-05-03
**Status:** Accepted

**Context:** Bij v2 (0150/0151) hebben we klant-mappings handmatig in SQL gehardcodeerd. Voor de 8 nieuwe lijsten 0210-0217 hebben we ~14.000 prijs-regels uit 8 Excel-bestanden te importeren. Hardcoden is onbeheerbaar; los de bron (Excel) loskoppelen van de SQL is wenselijk omdat Sales Support periodiek nieuwe Excels aanlevert.

**Beslissing:** `scripts/import-prijslijsten-210-217.mjs` is de canonieke transformer. Het script genereert `supabase/migrations/20260504_price_list_lines_210_217.sql`. De Excel-bestanden zijn de bron-van-waarheid; de migratie is een afgeleide artefact die we wel committen voor reproduceerbaarheid en audit.

**Gevolgen:**
- ✅ Re-import bij prijswijziging: vervang Excel + re-run script + nieuwe migratie.
- ✅ De SQL is leesbaar (`INSERT … SELECT` met `JOIN` op `qualities.code`/`carpet_dimensions.name`, geen UUID-noise).
- ⚠ Twee bronnen in repo (Excel + gegenereerde SQL) moeten gesynced blijven; we zorgen daarvoor door het script idempotent te maken (re-run overschrijft de migratie).
- ⚠ Klant-mappings (0150 → 0210 etc.) blijven in een aparte hand-geschreven migratie omdat ze geen Excel-bron hebben.
```

- [ ] **Step 3: Commit docs**

```bash
git add CLAUDE.md docs/architecture/decisions.md
git commit -m "docs(prijslijsten): status + ADR voor 0210-0217 import"
```

---

## Rollback

Als deze import in productie niet goed blijkt:

```sql
-- 1. Klanten terug op oude lijsten
UPDATE clients SET price_list_nr = '0150' WHERE price_list_nr = '0210';
UPDATE clients SET price_list_nr = '0151' WHERE price_list_nr = '0211';

-- 2. Oude lijsten heractiveren
UPDATE price_lists SET active = true WHERE nr IN ('0150', '0151');

-- 3. Nieuwe lijsten deactiveren (regels blijven, geen klant heeft ze meer geselecteerd)
UPDATE price_lists SET active = false WHERE nr IN ('0210','0211','0212','0213','0214','0215','0216','0217');

-- 4. Optioneel: regels droppen (cascadet via FK ON DELETE CASCADE)
DELETE FROM price_lists WHERE nr IN ('0210','0211','0212','0213','0214','0215','0216','0217');
```

Excel-bestanden + script blijven in repo; nieuwe import-poging vereist dan alleen een nieuwe migratie-timestamp.
