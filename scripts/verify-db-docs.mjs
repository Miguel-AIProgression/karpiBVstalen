#!/usr/bin/env node
/**
 * Vergelijkt de tabellen in Supabase met de documentatie in docs/architecture/database.md
 * en de types in src/lib/supabase/types.ts.
 *
 * Gebruik: node scripts/verify-db-docs.mjs
 * Vereist: .env.local met SUPABASE_SERVICE_ROLE_KEY en NEXT_PUBLIC_SUPABASE_URL
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load .env.local
const envPath = resolve(root, ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env.local");
  process.exit(1);
}

// 1. Fetch tables from Supabase OpenAPI spec
const res = await fetch(`${supabaseUrl}/rest/v1/`, {
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/openapi+json",
  },
});

const spec = await res.json();
const supabaseTables = new Set(
  Object.keys(spec.paths || {})
    .filter((p) => p !== "/" && !p.startsWith("/rpc/"))
    .map((p) => p.replace(/^\//, ""))
);
const supabaseRpcs = new Set(
  Object.keys(spec.paths || {})
    .filter((p) => p.startsWith("/rpc/"))
    .map((p) => p.replace(/^\/rpc\//, ""))
);

// 2. Extract tables from database.md (exclude RPC section)
const dbDoc = readFileSync(resolve(root, "docs/architecture/database.md"), "utf-8");
const allDocEntries = [...dbDoc.matchAll(/\| `(\w+)` \|/g)].map((m) => m[1]);
// Split into tables/views and RPCs based on section headers
const rpcSection = dbDoc.indexOf("### RPC Functions");
const docTables = new Set(
  allDocEntries.filter((name) => {
    const pos = dbDoc.indexOf(`| \`${name}\` |`);
    return rpcSection === -1 || pos < rpcSection;
  })
);
const docRpcs = new Set(
  allDocEntries.filter((name) => {
    const pos = dbDoc.indexOf(`| \`${name}\` |`);
    return rpcSection !== -1 && pos > rpcSection;
  })
);

// 3. Extract tables from types.ts
const typesFile = readFileSync(resolve(root, "src/lib/supabase/types.ts"), "utf-8");
const typesTables = new Set(
  [...typesFile.matchAll(/(\w+):\s*\{\s*Row:/g)].map((m) => m[1])
);

// 4. Compare
let issues = 0;

console.log("🔍 Database documentatie verificatie\n");

// Tables in Supabase but not in docs
const notInDocs = [...supabaseTables].filter((t) => !docTables.has(t));
if (notInDocs.length) {
  console.log("⚠️  In Supabase maar NIET in database.md:");
  notInDocs.forEach((t) => console.log(`   - ${t}`));
  issues += notInDocs.length;
}

// Tables in docs but not in Supabase
const notInSupabase = [...docTables].filter((t) => !supabaseTables.has(t));
if (notInSupabase.length) {
  console.log("⚠️  In database.md maar NIET in Supabase:");
  notInSupabase.forEach((t) => console.log(`   - ${t}`));
  issues += notInSupabase.length;
}

// Tables in Supabase but not in types.ts
const notInTypes = [...supabaseTables].filter((t) => !typesTables.has(t));
if (notInTypes.length) {
  console.log("⚠️  In Supabase maar NIET in types.ts:");
  notInTypes.forEach((t) => console.log(`   - ${t}`));
  issues += notInTypes.length;
}

// Tables in types.ts but not in Supabase
const typesNotInSupabase = [...typesTables].filter((t) => !supabaseTables.has(t));
if (typesNotInSupabase.length) {
  console.log("⚠️  In types.ts maar NIET in Supabase:");
  typesNotInSupabase.forEach((t) => console.log(`   - ${t}`));
  issues += typesNotInSupabase.length;
}

if (issues === 0) {
  console.log("✅ Alles klopt: Supabase, database.md en types.ts zijn in sync.");
} else {
  console.log(`\n❌ ${issues} afwijking(en) gevonden. Update database.md en/of types.ts.`);
  process.exit(1);
}
