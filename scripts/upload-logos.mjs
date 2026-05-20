/**
 * Upload alle logo's uit een lokale map naar Supabase Storage (client-logos bucket).
 * Gebruik: node scripts/upload-logos.mjs /pad/naar/klant-logo-s
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Laad .env.local
const envContent = readFileSync(join(rootDir, ".env.local"), "utf8");
const env = Object.fromEntries(
  envContent.split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim()]; })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceKey);

const logoDir = process.argv[2];
if (!logoDir) {
  console.error("Gebruik: node scripts/upload-logos.mjs /pad/naar/klant-logo-s");
  process.exit(1);
}

const absDir = resolve(logoDir);
const files = readdirSync(absDir).filter(f => {
  const full = join(absDir, f);
  return statSync(full).isFile() && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f);
});

console.log(`\n${files.length} bestanden gevonden in ${absDir}\n`);

let uploaded = 0;
let skipped = 0;
let errors = 0;

for (const file of files) {
  const filePath = join(absDir, file);
  const content = readFileSync(filePath);
  const ext = file.split(".").pop().toLowerCase();
  const mimeType = ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : "image/jpeg";

  const { error } = await supabase.storage
    .from("client-logos")
    .upload(file, content, { contentType: mimeType, upsert: true });

  if (error) {
    console.error(`  ✗ ${file} — ${error.message}`);
    errors++;
  } else {
    console.log(`  ✓ ${file}`);
    uploaded++;
  }
}

console.log(`\nKlaar: ${uploaded} geüpload, ${errors} fouten, ${skipped} overgeslagen.`);
