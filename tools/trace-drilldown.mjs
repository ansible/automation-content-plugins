/**
 * Trace the exact HTTP calls the UI makes at each drill-down level, with timings and
 * truncated responses.
 */
const origin = process.env.PORTAL_URL ?? 'http://127.0.0.1:7007';
const base = `${origin}/api/automation-content`;

const call = async path => {
  const started = performance.now();
  const res = await fetch(base + path);
  const ms = (performance.now() - started).toFixed(1);
  const body = await res.json();
  const size = JSON.stringify(body).length;
  return { path, status: res.status, ms, size, body };
};

const show = (label, r, render) => {
  console.log(`\n${label}`);
  console.log(`GET /api/automation-content${r.path}`);
  console.log(`→ ${r.status}  ${r.ms} ms  ${(r.size / 1024).toFixed(1)} KiB`);
  render(r.body);
};

const ees = await call('/content?type=execution-environment');
show('── LEVEL 0 ── page load', ees, b =>
  console.log(JSON.stringify(b.items[0], null, 2).split('\n').slice(0, 24).join('\n') + '\n  …'),
);

const ref = ees.body.items[0].ref;
const enc = encodeURIComponent(ref);

const env = await call(`/content/${enc}`);
show('── LEVEL 1a ── click EE (image card)', env, b =>
  console.log(`  repository=${b.repository} digest=${b.digest.slice(0, 26)}…`),
);

const contents = await call(`/content/${enc}/contents`);
show('── LEVEL 1b ── click EE (collections card)', contents, b => {
  console.log(`  enumeration: ${JSON.stringify(b.enumeration)}`);
  console.log(`  collections[0]: ${JSON.stringify(b.collections[0])}`);
  console.log(`  collections: ${b.collections.length}, items: ${b.items.length}`);
});

const items = await call(`/content-items?q=&type=&in=${enc}&collection=cisco.ios&limit=500`);
show('── LEVEL 2 ── click collection cisco.ios', items, b => {
  console.log(`  totalItems=${b.totalItems}`);
  console.log(`  items[0]: ${JSON.stringify(b.items[0])}`);
});

const doc = await call(`/content-items/cisco.ios.ios_vlans?in=${enc}`);
show('── LEVEL 3 ── click ios_vlans', doc, b => {
  console.log(`  keys: ${Object.keys(b).join(', ')}`);
  console.log(`  options.state: ${JSON.stringify(b.options.state)}`);
  console.log(`  examples: ${b.examples.length} chars, returns: ${Object.keys(b.returns).length} keys`);
});

console.log('\n── repeat all four, warm ──');
for (const p of [
  '/content?type=execution-environment',
  `/content/${enc}`,
  `/content/${enc}/contents`,
  `/content-items?in=${enc}&collection=cisco.ios&limit=500`,
  `/content-items/cisco.ios.ios_vlans?in=${enc}`,
]) {
  const r = await call(p);
  console.log(`  ${r.ms.padStart(6)} ms  ${p.slice(0, 62)}`);
}
