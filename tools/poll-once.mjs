/** Run one drift poll and show what it found. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';
const registry = process.argv[2] ?? 'local-registry';

const started = Date.now();
const res = await fetch(`${base}/registries/${registry}/poll`, { method: 'POST' });
const body = await res.json();
console.log(
  `  changed=${body.changed} refreshed=${body.refreshed} ` +
    `requests=${body.requests}  ${Date.now() - started} ms`,
);
for (const d of body.details ?? []) console.log(`   detail: ${d}`);

const content = await (await fetch(`${base}/content`)).json();
for (const a of content.items) {
  console.log(`  ${a.type.padEnd(24)} ${(a.tags ?? []).join(',')}`);
}
const health = await (await fetch(`${base}/health`)).json();
console.log(`  cache: ${JSON.stringify(health.cache)}`);
