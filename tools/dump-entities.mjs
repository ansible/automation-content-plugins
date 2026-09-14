/** Dump what the entity provider actually wrote into the Backstage catalog. */
const portal = process.env.PORTAL_URL ?? 'http://127.0.0.1:7007';

const res = await fetch(`${portal}/api/catalog/entities?limit=200`);
console.log(`GET /api/catalog/entities -> ${res.status}`);
if (!res.ok) {
  console.log((await res.text()).slice(0, 300));
  process.exit(1);
}

const all = await res.json();
const mine = all.filter(e =>
  Object.keys(e.metadata?.annotations ?? {}).some(k => k.startsWith('ansible.com/')),
);

console.log(`${all.length} entities total, ${mine.length} from the content provider\n`);

const byType = {};
for (const e of mine) byType[e.spec?.type] = (byType[e.spec?.type] ?? 0) + 1;
console.log('by spec.type:', JSON.stringify(byType), '\n');

const ee = mine.find(e => e.spec?.type === 'execution-environment');
const coll = mine.find(e => e.spec?.type === 'ansible-collection');

for (const [label, entity] of [['EXECUTION ENVIRONMENT', ee], ['COLLECTION', coll]]) {
  if (!entity) continue;
  console.log(`${'='.repeat(70)}\n${label}\n${'='.repeat(70)}`);
  console.log(JSON.stringify(entity, null, 2));
  console.log();
}
