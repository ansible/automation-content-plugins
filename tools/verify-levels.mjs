/** Walk the four drill-down levels exactly as the UI does. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';
const get = async p => {
  const r = await fetch(base + p);
  if (!r.ok) throw new Error(`${p} -> ${r.status}`);
  return r.json();
};
const h = t => console.log(`\n${'─'.repeat(70)}\n${t}\n${'─'.repeat(70)}`);

await fetch(`${base}/registries/local-quay/sync`, { method: 'POST' });

h('Level 0 — Execution environments');
const ees = await get('/content?type=execution-environment');
for (const e of ees.items) {
  console.log(`${e.repository}:${(e.tags ?? []).join(',')}  ` +
    `${e.counts?.collections ?? 0} collections, ${e.counts?.plugins ?? 0} plugins`);
}
const ee = ees.items[0];
const enc = encodeURIComponent(ee.ref);

h('Level 1 — click the EE: its collections');
const contents = await get(`/content/${enc}/contents`);
for (const c of contents.collections) {
  console.log(`${c.fqcn.padEnd(20)} ${c.version.padEnd(9)} ` +
    `plugins=${String(c.counts.plugins).padStart(3)} roles=${c.counts.roles} ` +
    `playbooks=${c.counts.playbooks} eda=${c.counts.edaPlugins} rulebooks=${c.counts.rulebooks}`);
}

h('Level 2 — click cisco.ios: its content items');
const items = await get(`/content-items?in=${enc}&collection=cisco.ios&limit=500`);
const byType = {};
for (const i of items.items) byType[i.type] = (byType[i.type] ?? 0) + 1;
console.log(`${items.totalItems} items: ` +
  Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', '));
for (const i of items.items.slice(0, 4)) {
  console.log(`  ${i.fqcn.padEnd(34)} ${i.shortDescription ?? ''}`);
}

h('Level 3 — click ios_vlans: its documentation');
const doc = await get(`/content-items/cisco.ios.ios_vlans?in=${enc}`);
console.log(`${doc.fqcn}  (${doc.type}, ${doc.collection} ${doc.collectionVersion})`);
console.log(`  ${doc.shortDescription}`);
console.log(`  author:      ${(doc.author ?? []).join(', ')}`);
console.log(`  arguments:   ${Object.keys(doc.options ?? {}).join(', ')}`);
console.log(`  suboptions:  ${Object.keys(doc.options?.config?.suboptions ?? {}).join(', ')}`);
console.log(`  examples:    ${doc.examples ? 'yes' : 'no'}   returns: ${doc.returns ? 'yes' : 'no'}`);
console.log(`  providedBy:  ${(doc.providedBy ?? []).length} artifact(s)  ← was undefined, caused the crash`);
console.log(`  provenance:  ${doc.enumeration?.source}, ansible-core ${doc.enumeration?.ansibleCore}`);

h('EDA plugin (ansible-doc cannot describe these)');
const alert = await get(`/content-items/ansible.eda.alertmanager?in=${enc}`);
console.log(`${alert.fqcn} (${alert.type})`);
console.log(`  options: ${Object.keys(alert.options ?? {}).join(', ')}`);
console.log(`  providedBy: ${(alert.providedBy ?? []).length}`);
console.log('');
