/** Trigger one registry sync and report status and duration. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';
const registry = process.argv[2] ?? 'local-quay';

const started = Date.now();
const res = await fetch(`${base}/registries/${registry}/sync`, { method: 'POST' });
console.log(`POST /registries/${registry}/sync -> ${res.status} in ${Date.now() - started} ms`);
console.log(await res.text());
