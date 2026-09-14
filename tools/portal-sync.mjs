/** Trigger a registry sync through the portal, then show what was discovered. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';
const registry = process.argv[2] ?? 'local-quay';

const sync = await fetch(`${base}/registries/${registry}/sync`, { method: 'POST' });
console.log(`POST /registries/${registry}/sync -> ${sync.status}`);
console.log(await sync.text());

const show = async (path, label) => {
  const res = await fetch(base + path);
  const body = await res.json();
  console.log(`\n${label} (${res.status})`);
  console.log(JSON.stringify(body, null, 2).slice(0, 1600));
};

await show('/registries', 'registries');
await show('/execution-environments', 'execution environments');
