/**
 * Print what the Backstage catalog holds, for demonstrating the provider end to end.
 *
 * Uses the catalog API rather than the database so it shows exactly what a consumer —
 * the Portal UI, the MCP endpoint, or an agent — would see.
 */
const base = process.env.BACKEND_URL ?? 'http://127.0.0.1:7007';

const res = await fetch(`${base}/api/catalog/entities?limit=200`);
if (!res.ok) {
  console.error(`catalog API returned ${res.status}`);
  process.exit(1);
}
const entities = await res.json();

const ees = entities.filter(e => e.spec?.type === 'execution-environment');
const collections = entities.filter(e => e.spec?.type === 'ansible-collection');

console.log(`\n${entities.length} entities: ${ees.length} execution environments, ` +
  `${collections.length} collections\n`);

for (const ee of ees) {
  const a = ee.metadata.annotations ?? {};
  const counts = a['ansible.com/content-counts']
    ? JSON.parse(a['ansible.com/content-counts'])
    : undefined;
  console.log(`EXECUTION ENVIRONMENT  ${ee.metadata.title}`);
  console.log(`  name:         ${ee.metadata.name}`);
  console.log(`  digest:       ${a['ansible.com/digest']}`);
  console.log(`  tags:         ${a['ansible.com/tags']}`);
  console.log(`  enumeration:  ${a['ansible.com/enumeration-source']}`);
  console.log(`  ansible-core: ${a['ansible.com/ansible-core'] ?? '—'}`);
  console.log(`  pull:         ${a['ansible.com/pull-reference']}`);
  if (counts) {
    console.log(`  contents:     ${counts.collections} collections, ${counts.plugins} plugins, ` +
      `${counts.edaPlugins} eda plugins, ${counts.rulebooks} rulebooks`);
    console.log(`  by type:      ${Object.entries(counts.pluginsByType)
      .map(([k, v]) => `${v} ${k}`).join(', ')}`);
  }
  console.log(`  dependsOn:    ${(ee.spec.dependsOn ?? []).length} collection entities`);
  console.log('');
}

if (collections.length) {
  console.log('COLLECTIONS');
  for (const c of collections) {
    const a = c.metadata.annotations ?? {};
    const counts = JSON.parse(a['ansible.com/content-counts'] ?? '{}');
    const byType = JSON.parse(a['ansible.com/plugins-by-type'] ?? '{}');
    console.log(`  ${c.metadata.title.padEnd(32)} ` +
      `plugins=${String(counts.plugins ?? 0).padStart(3)} ` +
      `eda=${String(counts.edaPlugins ?? 0).padStart(2)} ` +
      `rulebooks=${String(counts.rulebooks ?? 0).padStart(2)}  ` +
      `[${Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(', ')}]`);
    console.log(`    partOf: ${(c.spec.partOf ?? []).join(', ')}`);
  }
}
console.log('');
