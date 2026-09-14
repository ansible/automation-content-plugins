/** Verify the digest cache, drift polling, and the manual sync endpoint. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';
const get = async p => (await fetch(base + p)).json();
const post = async p => {
  const started = Date.now();
  const res = await fetch(base + p, { method: 'POST' });
  return { ms: Date.now() - started, status: res.status, body: await res.json() };
};
const h = t => console.log(`\n${'─'.repeat(70)}\n${t}\n${'─'.repeat(70)}`);

h('1. Manual refresh (the UI button) — cold, then warm');
const cold = await post('/sync');
console.log(`  POST /sync -> ${cold.status}  ${cold.ms} ms  ${cold.body.status}`);
console.log(`  cache after: ${JSON.stringify(cold.body.cache)}`);

const warm = await post('/sync');
console.log(`  POST /sync -> ${warm.status}  ${warm.ms} ms  (repeat)`);
console.log(`  cache after: ${JSON.stringify(warm.body.cache)}`);
const c = warm.body.cache;
console.log(`  hit rate: ${((c.hits / (c.hits + c.misses)) * 100).toFixed(1)}%`);
console.log(`  retained: ${(c.bytes / 1024).toFixed(0)} KiB across ${c.entries} entries`);

h('2. Drift poll with nothing changed — should be cheap and refresh nothing');
const quiet = await post('/registries/local-registry/poll');
console.log(`  changed=${quiet.body.changed} refreshed=${quiet.body.refreshed} ` +
  `requests=${quiet.body.requests}  ${quiet.ms} ms`);

h('3. Now change the registry, then poll again');
console.log('  (push a new tag from the shell, then this poll should notice)');
