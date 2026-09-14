/**
 * Exercise the automation content API end to end.
 *
 * Walks the same path an agent would: find an environment, see what is in it, look up a
 * specific module's real argument specification, then ask which environment can satisfy
 * a requirements.yml.
 */
const base = (process.env.BACKEND_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';

const get = async path => {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};
const post = async (path, body) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const h = t => console.log(`\n${'─'.repeat(70)}\n${t}\n${'─'.repeat(70)}`);

h('GET /registries — capabilities are probed, not assumed');
const { items: registries } = await get('/registries');
for (const r of registries) {
  const c = r.capabilities ?? {};
  console.log(`${r.name}  ${r.url}`);
  console.log(`  referrers=${c.referrers}  catalog=${c.catalogEnumeration}  ` +
    `delete=${c.delete}  notifications=${c.notifications}  auth=${(c.auth ?? []).join('/')}`);
  for (const n of c.notes ?? []) console.log(`  · ${n}`);
}

h('GET /execution-environments');
const { items: ees } = await get('/execution-environments');
for (const ee of ees) {
  console.log(`${ee.tags.join(',') || '(untagged)'}  ${ee.repository}`);
  console.log(`  contentsKnown=${ee.contentsKnown}  source=${ee.enumeration.source}  ` +
    `ansible-core=${ee.enumeration.ansibleCore ?? '—'}`);
  if (ee.counts) {
    console.log(`  ${ee.counts.collections} collections, ${ee.counts.plugins} plugins, ` +
      `${ee.counts.edaPlugins} eda, ${ee.counts.rulebooks} rulebooks`);
  }
}

const withContents = ees.find(e => e.contentsKnown);
if (!withContents) {
  console.log('\nNo environment with known contents; stopping.');
  process.exit(0);
}

h('GET /collections');
const { items: collections } = await get('/collections');
for (const c of collections) {
  console.log(`${c.fqcn.padEnd(22)} ${c.version.padEnd(9)} ` +
    `plugins=${String(c.counts.plugins).padStart(3)} eda=${String(c.counts.edaPlugins).padStart(2)} ` +
    `rulebooks=${String(c.counts.rulebooks).padStart(2)}`);
}

h('GET /plugins?type=module — agent asking what exists');
const moduleSearch = await get('/plugins?type=module&limit=6');
console.log(`${moduleSearch.totalItems} modules`);
for (const i of moduleSearch.items) {
  console.log(`  ${i.fqcn.padEnd(30)} ${i.shortDescription ?? ''}`);
}

// Pick a module that is actually present rather than naming one. This script has to
// work against whatever an environment happens to contain — hardcoding a plugin makes
// it a demo of one specific image instead of a demo of the API. Prefer one with nested
// suboptions, since that is the part worth showing.
const candidates = (await get('/plugins?type=module&limit=100')).items;
let chosen;
for (const c of candidates) {
  const full = await get(`/plugins/${c.fqcn}`).catch(() => undefined);
  if (!full) continue;
  const hasNested = Object.values(full.options ?? {}).some(o => o?.suboptions);
  if (hasNested) { chosen = full; break; }
  chosen ??= full;
}
if (!chosen) {
  console.log('\nNo modules discovered — is anything synced? Try: node tools/sync-once.mjs');
  process.exit(0);
}

h(`GET /plugins/${chosen.fqcn} — full argument spec for grounding`);
const vlans = chosen;
console.log(`${vlans.fqcn}  (${vlans.type}${vlans.versionAdded ? `, added ${vlans.versionAdded}` : ''})`);
console.log(`  ${vlans.shortDescription}`);
console.log(`  collection:  ${vlans.collection} ${vlans.collectionVersion}`);
console.log(`  provenance:  ${vlans.enumeration.source}, ansible-core ${vlans.enumeration.ansibleCore}`);
console.log(`  options:     ${Object.keys(vlans.options ?? {}).join(', ')}`);
const nested = Object.entries(vlans.options ?? {}).find(([, o]) => o?.suboptions);
const sub = nested?.[1]?.suboptions ?? {};
console.log(`  ${nested?.[0] ?? 'nested'}.suboptions (${Object.keys(sub).length}):`);
for (const [k, v] of Object.entries(sub).slice(0, 6)) {
  console.log(`      ${k.padEnd(14)} type=${v.type ?? '?'}${v.choices ? `  choices=${v.choices.join('|')}` : ''}`);
}
console.log(`  has examples: ${Boolean(vlans.examples)}   has return values: ${Boolean(vlans.returns)}`);

h('GET /plugins?type=event_source — EDA plugins, which ansible-doc cannot describe');
const eda = await get('/plugins?type=event_source&limit=5');
console.log(`${eda.totalItems} event sources`);
for (const i of eda.items) console.log(`  ${i.fqcn.padEnd(32)} ${i.shortDescription ?? ''}`);

h('POST /resolve/requirements — which EE can run this project?');
// One collection that is present and one that deliberately is not, whatever the
// environment happens to hold — the unsatisfied half is the interesting half.
const present = collections[0]?.fqcn ?? 'ansible.utils';
const resolution = await post('/resolve/requirements', {
  collections: [
    { name: present, version: '*' },
    { name: 'community.definitely-not-installed', version: '*' },
  ],
});
console.log(`satisfiedBy: ${resolution.satisfiedBy.length}`);
for (const s of resolution.satisfiedBy) console.log(`  ${s.pullReference}`);
console.log(`unsatisfied:`);
for (const u of resolution.unsatisfied) console.log(`  ${u.name} (${u.version}) — ${u.reason}`);
for (const n of resolution.notes) console.log(`  note: ${n}`);

h('GET /config/export?format=yaml — config as code, credentials never emitted');
const res = await fetch(`${base}/config/export?format=yaml`);
console.log(await res.text());

h('POST /config/validate — CI gate on a proposed change');
const bad = await post('/config/validate', {
  apiVersion: 'content.ansible.com/v1',
  kind: 'ContentConfiguration',
  registries: [
    { name: 'a', url: 'not-a-url' },
    { name: 'a', url: 'https://quay.io' },
  ],
});
console.log(`valid=${bad.valid}`);
for (const e of bad.errors) console.log(`  ERROR   ${e.path}: ${e.message}`);
for (const w of bad.warnings) console.log(`  WARNING ${w.path}: ${w.message}`);
console.log('');
