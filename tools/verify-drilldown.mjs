/** Verify the EE drill-down: the API calls the detail view makes, in order. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';
const get = async p => {
  const r = await fetch(base + p);
  return r.ok ? r.json() : Promise.reject(new Error(`${p} -> ${r.status}`));
};
const h = t => console.log(`\n${'─'.repeat(70)}\n${t}\n${'─'.repeat(70)}`);

await fetch(`${base}/registries/local-quay/sync`, { method: 'POST' });

h('Overview: the EE list a user sees first');
const list = await get('/content?type=execution-environment');
for (const e of list.body?.items ?? list.items) {
  console.log(`${e.repository}:${e.tags.join(',')}  ${e.counts?.plugins ?? '?'} plugins`);
}
const ee = (list.items ?? [])[0];
const enc = encodeURIComponent(ee.ref);

h('Click the EE -> ?ee=<ref>  (the detail view loads these three)');
const detail = await get(`/content/${enc}`);
console.log(`1. GET /content/{ref}`);
console.log(`   ${detail.repository}:${detail.tags.join(',')}  digest ${detail.digest.slice(7, 19)}`);
console.log(`   ansible-core ${detail.enumeration.ansibleCore}, ${detail.enumeration.source}`);
console.log(`   pull: ${detail.pullReference}`);

const contents = await get(`/content/${enc}/contents`);
console.log(`\n2. GET /content/{ref}/contents  (collections in this EE)`);
for (const c of contents.collections) {
  console.log(
    `   ${c.fqcn.padEnd(20)} ${c.version.padEnd(9)} ` +
      `plugins=${String(c.counts.plugins).padStart(3)} roles=${c.counts.roles} ` +
      `playbooks=${c.counts.playbooks} eda=${c.counts.edaPlugins} rulebooks=${c.counts.rulebooks}`,
  );
}

const scoped = await get(`/content-items?in=${enc}&limit=200`);
console.log(`\n3. GET /content-items?in={ref}  -> ${scoped.totalItems} items, all from this EE`);
const byCollection = {};
for (const i of scoped.items) {
  byCollection[i.collection] = (byCollection[i.collection] ?? 0) + 1;
}
for (const [c, n] of Object.entries(byCollection)) console.log(`   ${c.padEnd(20)} ${n}`);

h('Filter within the EE');
for (const t of ['module', 'filter', 'test', 'event_source', 'event_filter']) {
  const r = await get(`/content-items?in=${enc}&type=${t}&limit=500`);
  console.log(`   type=${t.padEnd(14)} ${r.totalItems}`);
}

h('Click an item -> scoped lookup, so the version matches this EE');
const item = await get(`/content-items/cisco.ios.ios_vlans?in=${enc}`);
console.log(`${item.fqcn}  (${item.collection} ${item.collectionVersion})`);
console.log(`  ${item.shortDescription}`);
console.log(`  arguments: ${Object.keys(item.options ?? {}).join(', ')}`);
console.log(`  config.suboptions: ${Object.keys(item.options?.config?.suboptions ?? {}).join(', ')}`);
console.log('');
