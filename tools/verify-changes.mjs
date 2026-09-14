/** Verify the three changes: classification, per-artifact item keys, unified endpoints. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';

const get = async p => {
  const r = await fetch(base + p);
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
};
const h = t => console.log(`\n${'─'.repeat(72)}\n${t}\n${'─'.repeat(72)}`);

await fetch(`${base}/registries/local-quay/sync`, { method: 'POST' });

h('1. Classification — every image, and why it was or was not recognised');
const all = await get('/content');
for (const a of all.body.items) {
  console.log(`${(a.tags.join(',') || '(untagged)').padEnd(30)} type=${a.type}`);
  console.log(`  contentsKnown=${a.contentsKnown}  confidence=${a.classification.confidence}`);
  for (const s of a.classification.signals) console.log(`  signal: ${s}`);
}

const ees = await get('/content?type=execution-environment');
const images = await get('/content?type=oci-image');
console.log(`\n?type=execution-environment -> ${ees.body.items.length}`);
console.log(`?type=oci-image              -> ${images.body.items.length}`);

h('2. Contents of an EE — direct (collections) vs flat (items)');
const ee = ees.body.items[0];
const direct = await get(`/content/${encodeURIComponent(ee.ref)}/contents`);
console.log(`depth=direct -> ${direct.body.collections.length} collections, ${direct.body.items.length} items`);
for (const c of direct.body.collections) {
  console.log(`  ${c.fqcn.padEnd(20)} ${c.version.padEnd(9)} plugins=${c.counts.plugins} eda=${c.counts.edaPlugins}`);
}
const flat = await get(`/content/${encodeURIComponent(ee.ref)}/contents?depth=flat`);
console.log(`depth=flat   -> ${flat.body.items.length} items`);
const eda = await get(`/content/${encodeURIComponent(ee.ref)}/contents?type=event_source`);
console.log(`type=event_source -> ${eda.body.items.length} items`);

h('3. Content items are keyed per artifact');
const item = await get('/content-items/cisco.ios.ios_vlans');
console.log(`GET /content-items/cisco.ios.ios_vlans -> ${item.status}`);
console.log(`  in:      ${item.body.in ?? '(variants: ' + item.body.variantCount + ')'}`);
console.log(`  version: ${item.body.collectionVersion}`);
const scoped = await get(`/content-items/cisco.ios.ios_vlans?in=${encodeURIComponent(ee.ref)}`);
console.log(`scoped with ?in= -> ${scoped.status}, collection ${scoped.body.collectionVersion}`);
const wrongScope = await get('/content-items/cisco.ios.ios_vlans?in=does/not@exist');
console.log(`scoped to a bogus artifact -> ${wrongScope.status} (correctly not found)`);

h('4. Aliases still work');
for (const p of ['/execution-environments', '/plugins?q=vlan&limit=2']) {
  const r = await get(p);
  const n = r.body.items?.length ?? 0;
  console.log(`${p.padEnd(32)} -> ${r.status}, ${n} items`);
}

h('5. Unrecognised image reports unknown contents, not empty');
if (images.body.items.length) {
  const img = images.body.items[0];
  const c = await get(`/content/${encodeURIComponent(img.ref)}/contents`);
  console.log(`enumeration.status = ${c.body.enumeration.status}`);
  console.log(`classification     = ${c.body.classification.signals.join('; ')}`);
}
console.log('');
