/** Query the content API through the running Automation Portal. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';

for (const path of ['/health', '/registries', '/execution-environments', '/collections']) {
  try {
    const res = await fetch(base + path);
    const text = await res.text();
    console.log(`\n${path} -> ${res.status}`);
    console.log(text.slice(0, 700));
  } catch (err) {
    console.log(`\n${path} -> ERROR ${err.message}`);
  }
}
