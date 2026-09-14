/** Diagnostic: read processing errors straight out of the catalog database. */
import Database from 'better-sqlite3';
import { readdirSync } from 'fs';

const dir = process.argv[2] ?? './.data';
const files = readdirSync(dir).filter(f => f.endsWith('.sqlite'));
console.log('databases:', files.join(', '));

for (const file of files) {
  const db = new Database(`${dir}/${file}`, { readonly: true });
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map(r => r.name);
  if (!tables.includes('refresh_state')) continue;

  console.log(`\n=== ${file} ===`);
  const rows = db
    .prepare('SELECT entity_ref, errors FROM refresh_state LIMIT 20')
    .all();
  for (const row of rows) {
    const errors = row.errors ? JSON.parse(row.errors) : [];
    if (errors.length) {
      console.log(`\n${row.entity_ref}`);
      for (const e of errors) {
        console.log(`  ${e.name}: ${e.message}`);
      }
    } else {
      console.log(`${row.entity_ref}: (no errors)`);
    }
  }
  db.close();
}
