/** Which item documentation fields are strings rather than the arrays the spec promises. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';
const get = async p => (await fetch(base + p)).json();

const ees = await get('/content?type=execution-environment');
const enc = encodeURIComponent(ees.items[0].ref);
const list = await get(`/content-items?in=${enc}&limit=500`);

const offenders = { description: [], author: [], notes: [] };
let checked = 0;

for (const summary of list.items) {
  const doc = await get(`/content-items/${encodeURIComponent(summary.fqcn)}?in=${enc}`);
  checked += 1;
  for (const field of Object.keys(offenders)) {
    const v = doc[field];
    if (v !== undefined && !Array.isArray(v)) {
      offenders[field].push(`${doc.fqcn} (${typeof v})`);
    }
  }
}

console.log(`checked ${checked} items\n`);
for (const [field, list_] of Object.entries(offenders)) {
  console.log(`${field}: ${list_.length} non-array`);
  for (const x of list_.slice(0, 6)) console.log(`   ${x}`);
}
