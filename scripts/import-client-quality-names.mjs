/**
 * Import script: TKA013 klant-eigen-namen
 *
 * Prerequisite: run these two SQL statements in Supabase SQL Editor first:
 *
 *   ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_number text UNIQUE;
 *
 *   CREATE TABLE IF NOT EXISTS client_quality_names (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 *     quality_id uuid NOT NULL REFERENCES qualities(id) ON DELETE CASCADE,
 *     custom_name text NOT NULL,
 *     created_at timestamptz DEFAULT now(),
 *     UNIQUE(client_id, quality_id)
 *   );
 *
 * Usage: node scripts/import-client-quality-names.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Load env
const envPath = resolve(rootDir, ".env.local");
const envContent = readFileSync(envPath, "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Parse XLS using xlsx-cli (already available via npx)
const xlsPath = resolve(rootDir, "..", "TKA013_Overzicht_20260319104204.xls");
console.log("Reading XLS file...");
const csvOutput = execSync(`npx --yes xlsx-cli "${xlsPath}"`, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });

// Parse CSV rows
const lines = csvOutput.split("\n").filter((l) => l.trim());
const header = lines[0];
console.log(`Header: ${header}`);
console.log(`Total rows: ${lines.length - 1}`);

const rows = [];
for (let i = 1; i < lines.length; i++) {
  // Handle CSV with possible quoted fields
  const parts = parseCSVLine(lines[i]);
  if (parts.length < 5) continue;

  const clientNumber = parts[0].trim();
  const clientName = parts[1].trim();
  const qualityCode = parts[2].trim();
  const customName = parts[3].trim();
  const karpiName = parts[4].trim();

  if (!clientNumber || !clientName || !qualityCode || !customName || !karpiName) continue;

  rows.push({ clientNumber, clientName, qualityCode, customName, karpiName });
}

console.log(`Parsed ${rows.length} valid rows`);

// --- Step 1: Update/create qualities ---
console.log("\n--- Step 1: Qualities ---");

// Get unique quality code → karpi name mapping
const qualityMap = new Map();
for (const row of rows) {
  if (!qualityMap.has(row.qualityCode)) {
    qualityMap.set(row.qualityCode, row.karpiName);
  }
}
console.log(`Unique qualities in XLS: ${qualityMap.size}`);

// Fetch existing qualities
const { data: existingQualities, error: qErr } = await supabase
  .from("qualities")
  .select("id, code, name");

if (qErr) {
  console.error("Error fetching qualities:", qErr);
  process.exit(1);
}

const existingByCode = new Map();
for (const q of existingQualities) {
  existingByCode.set(q.code, q);
}

// Update existing qualities with full name
let updatedCount = 0;
let createdCount = 0;

for (const [code, karpiName] of qualityMap) {
  const existing = existingByCode.get(code);
  if (existing) {
    if (existing.name !== karpiName) {
      const { error } = await supabase
        .from("qualities")
        .update({ name: karpiName })
        .eq("id", existing.id);
      if (error) {
        console.error(`  Error updating quality ${code}:`, error.message);
      } else {
        updatedCount++;
      }
    }
  } else {
    // Create new quality
    const { data, error } = await supabase
      .from("qualities")
      .insert({ code, name: karpiName })
      .select("id")
      .single();
    if (error) {
      console.error(`  Error creating quality ${code}:`, error.message);
    } else {
      existingByCode.set(code, { id: data.id, code, name: karpiName });
      createdCount++;
    }
  }
}

console.log(`Qualities updated: ${updatedCount}, created: ${createdCount}`);

// Refresh quality lookup (code → id)
const { data: allQualities } = await supabase.from("qualities").select("id, code");
const qualityIdByCode = new Map();
for (const q of allQualities) {
  qualityIdByCode.set(q.code, q.id);
}

// --- Step 2: Create clients ---
console.log("\n--- Step 2: Clients ---");

const clientMap = new Map();
for (const row of rows) {
  if (!clientMap.has(row.clientNumber)) {
    clientMap.set(row.clientNumber, row.clientName);
  }
}
console.log(`Unique clients in XLS: ${clientMap.size}`);

// Fetch existing clients
const { data: existingClients } = await supabase
  .from("clients")
  .select("id, client_number, name");

const existingClientByNumber = new Map();
for (const c of existingClients || []) {
  if (c.client_number) {
    existingClientByNumber.set(c.client_number, c);
  }
}

let clientsCreated = 0;
const clientIdByNumber = new Map();

// Copy existing client IDs
for (const [num, client] of existingClientByNumber) {
  clientIdByNumber.set(num, client.id);
}

// Insert new clients in batches
const newClients = [];
for (const [clientNumber, clientName] of clientMap) {
  if (!existingClientByNumber.has(clientNumber)) {
    newClients.push({
      client_number: clientNumber,
      name: clientName,
      client_type: "retailer",
    });
  }
}

if (newClients.length > 0) {
  // Insert in batches of 100
  for (let i = 0; i < newClients.length; i += 100) {
    const batch = newClients.slice(i, i + 100);
    const { data, error } = await supabase
      .from("clients")
      .insert(batch)
      .select("id, client_number");

    if (error) {
      console.error(`  Error inserting clients batch ${i}:`, error.message);
    } else {
      for (const c of data) {
        clientIdByNumber.set(c.client_number, c.id);
        clientsCreated++;
      }
    }
  }
}

console.log(`Clients created: ${clientsCreated}, already existed: ${existingClientByNumber.size}`);

// --- Step 3: Insert client_quality_names ---
console.log("\n--- Step 3: Client quality names ---");

const nameRows = [];
const skipped = { noClient: 0, noQuality: 0 };

for (const row of rows) {
  const clientId = clientIdByNumber.get(row.clientNumber);
  const qualityId = qualityIdByCode.get(row.qualityCode);

  if (!clientId) {
    skipped.noClient++;
    continue;
  }
  if (!qualityId) {
    skipped.noQuality++;
    continue;
  }

  nameRows.push({
    client_id: clientId,
    quality_id: qualityId,
    custom_name: row.customName,
  });
}

console.log(`Name rows to insert: ${nameRows.length}`);
if (skipped.noClient > 0) console.log(`  Skipped (no client): ${skipped.noClient}`);
if (skipped.noQuality > 0) console.log(`  Skipped (no quality): ${skipped.noQuality}`);

// Insert in batches of 200, using upsert to handle duplicates
let namesInserted = 0;
for (let i = 0; i < nameRows.length; i += 200) {
  const batch = nameRows.slice(i, i + 200);
  const { error } = await supabase
    .from("client_quality_names")
    .upsert(batch, { onConflict: "client_id,quality_id" });

  if (error) {
    console.error(`  Error inserting names batch ${i}:`, error.message);
  } else {
    namesInserted += batch.length;
  }
}

console.log(`Client quality names inserted: ${namesInserted}`);
console.log("\nDone!");

// --- CSV parser ---
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}
