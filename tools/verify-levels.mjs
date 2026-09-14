/**
 * Walk the drill-down levels exactly as the UI does.
 *
 * Deliberately names no collection or plugin: it picks from whatever the environment
 * actually contains, so it works against any execution environment rather than
 * demonstrating one particular image.
 */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';
const registry = process.argv[2] ?? 'local-registry';
const get = async p => {
  const r = await fetch(base + p);
  if (!r.ok) throw new Error(`${p} -> ${r.status}`);
  return r.json();
};
const h = t => console.log(`\n${'─'.repeat(70)}\n${t}\n${'─'.repeat(70)}`);

await fetch(`${base}/registries/${registry}/sync`, { method: 'POST' });

h('Level 0 — Execution environments');
const ees = await get('/content?type=execution-environment');
for (const e of ees.items) {
  console.log(`${e.repository}:${(e.tags ?? []).join(',')}  ` +
    `${e.counts?.collections ?? 0} collections, ${e.counts?.plugins ?? 0} plugins`);
}
if (ees.items.length === 0) {
  console.log('\nNothing discovered. Is the registry reachable, and has a sync run?');
  process.exit(0);
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

const collection = contents.collections[0];
if (!collection) {
  console.log('\nContents are unknown for this environment — no content manifest published.');
  console.log('See docs/guides/building-an-execution-environment.md');
  process.exit(0);
}

h(`Level 2 — click ${collection.fqcn}: its content items`);
const items = await get(`/content-items?in=${enc}&collection=${collection.fqcn}&limit=500`);
const byType = {};
for (const i of items.items) byType[i.type] = (byType[i.type] ?? 0) + 1;
console.log(`${items.totalItems} items: ` +
  Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', '));
for (const i of items.items.slice(0, 4)) {
  console.log(`  ${i.fqcn.padEnd(34)} ${i.shortDescription ?? ''}`);
}

// Prefer an item with nested suboptions: that is what distinguishes real extraction
// from a name listing, and it is the thing worth eyeballing.
let doc;
for (const i of items.items) {
  const full = await get(`/content-items/${i.fqcn}?in=${enc}`).catch(() => undefined);
  if (!full) continue;
  if (Object.values(full.options ?? {}).some(o => o?.suboptions)) { doc = full; break; }
  doc ??= full;
}

if (doc) {
  h(`Level 3 — click ${doc.fqcn}: its documentation`);
  console.log(`${doc.fqcn}  (${doc.type}, ${doc.collection} ${doc.collectionVersion})`);
  console.log(`  ${doc.shortDescription ?? '(no description)'}`);
  console.log(`  author:      ${(doc.author ?? []).join(', ') || '(none)'}`);
  console.log(`  arguments:   ${Object.keys(doc.options ?? {}).join(', ')}`);
  const nested = Object.entries(doc.options ?? {}).find(([, o]) => o?.suboptions);
  console.log(`  suboptions:  ${nested
    ? `${nested[0]} → ${Object.keys(nested[1].suboptions).join(', ')}`
    : '(none at this level)'}`);
  console.log(`  examples:    ${doc.examples ? 'yes' : 'no'}   returns: ${doc.returns ? 'yes' : 'no'}`);
  console.log(`  providedBy:  ${(doc.providedBy ?? []).length} artifact(s)`);
  console.log(`  provenance:  ${doc.enumeration?.source}, ansible-core ${doc.enumeration?.ansibleCore}`);
}

// EDA plugins are worth calling out separately: ansible-doc cannot describe them at
// all, so their presence proves the manifest was built by parsing the source.
const eda = await get(`/content-items?in=${enc}&type=event_source&limit=3`).catch(() => undefined);
if (eda?.items?.length) {
  h('EDA plugins (ansible-doc cannot describe these)');
  for (const i of eda.items) {
    const full = await get(`/content-items/${i.fqcn}?in=${enc}`).catch(() => undefined);
    console.log(`${i.fqcn} (${i.type})  options: ${Object.keys(full?.options ?? {}).join(', ') || '(none)'}`);
  }
}
console.log('');
