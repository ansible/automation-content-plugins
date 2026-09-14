/** Verify the doc-field normalisation and the reconcile timestamps. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';
const get = async p => (await fetch(base + p)).json();

await fetch(`${base}/registries/local-quay/sync`, { method: 'POST' });

const ees = await get('/content?type=execution-environment');
const enc = encodeURIComponent(ees.items[0].ref);

console.log('items that previously crashed the page:\n');
const shape = v => (Array.isArray(v) ? `array(${v.length})` : v === undefined ? '—' : typeof v);

for (const fqcn of [
  'cisco.ios.ios_acls',
  'ansible.netcommon.parse_cli',
  'ansible.eda.normalize_keys',
  'cisco.ios.ios_vlans',
]) {
  const d = await get(`/content-items/${encodeURIComponent(fqcn)}?in=${enc}`);
  console.log(
    `  ${fqcn.padEnd(30)} description=${shape(d.description).padEnd(9)} ` +
      `author=${shape(d.author).padEnd(9)} providedBy=${shape(d.providedBy)}`,
  );
}

// Sweep everything, since one bad item takes down the whole page.
const all = await get(`/content-items?in=${enc}&limit=500`);
let bad = 0;
for (const s of all.items) {
  const d = await get(`/content-items/${encodeURIComponent(s.fqcn)}?in=${enc}`);
  for (const f of ['description', 'author', 'notes', 'providedBy']) {
    if (d[f] !== undefined && !Array.isArray(d[f])) {
      bad += 1;
      console.log(`  NON-ARRAY ${d.fqcn}.${f} = ${typeof d[f]}`);
    }
  }
}
console.log(`\nswept ${all.items.length} items — ${bad} non-array fields remaining`);

const regs = await get('/registries');
const r = regs.items[0];
console.log(`\nregistry ${r.name}`);
console.log(`  lastReconciledAt: ${r.lastReconciledAt}`);
console.log(`  lastReconcileOk:  ${r.lastReconcileOk}`);
console.log(`  artifact carries: ${ees.items[0].lastReconciledAt ?? '(none)'}`);
