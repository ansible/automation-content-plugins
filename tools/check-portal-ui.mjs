/** Verify the content UI is mounted in the running portal. */
const portal = process.env.PORTAL_URL ?? 'http://127.0.0.1:7007';

const page = await fetch(`${portal}/automation-content`);
console.log(`GET /automation-content -> ${page.status} ${page.headers.get('content-type')}`);

// Scalprum serves the frontend plugin manifest; its presence proves the dynamic
// frontend plugin loaded and the dynamicRoutes config was accepted.
for (const path of [
  '/api/scalprum/plugin-manifests',
  '/api/scalprum/ansible.plugin-automation-content/plugin-manifest.json',
]) {
  try {
    const res = await fetch(portal + path);
    const text = await res.text();
    console.log(`\n${path} -> ${res.status}`);
    if (res.ok) {
      const match = text.match(/automation-content[^"]*/g);
      console.log(match ? [...new Set(match)].slice(0, 6).join('\n') : text.slice(0, 200));
    }
  } catch (err) {
    console.log(`${path} -> ERROR ${err.message}`);
  }
}
