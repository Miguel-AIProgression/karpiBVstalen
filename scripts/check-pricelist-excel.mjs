import XLSX from 'xlsx';
import fs from 'node:fs';

const files = [
  { nr: '0150', path: 'klantenbestand prijslijst 150.xlsx' },
  { nr: '0151', path: 'klantenbestand prijslijst 151.xlsx' },
];

for (const f of files) {
  console.log('='.repeat(80));
  console.log(`FILE: ${f.path} -> price_list_nr ${f.nr}`);
  console.log('='.repeat(80));
  const wb = XLSX.readFile(f.path);
  for (const sheetName of wb.SheetNames) {
    console.log(`\n--- sheet: "${sheetName}" ---`);
    const ws = wb.Sheets[sheetName];
    const range = ws['!ref'];
    console.log(`range: ${range}`);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    console.log(`rows: ${rows.length}`);
    // print first 30 rows
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      console.log(`row ${i}:`, JSON.stringify(rows[i]));
    }
  }
}
