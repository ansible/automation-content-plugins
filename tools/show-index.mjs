/** Print what the ContentIndex currently believes, and when it last looked. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';

const content = await (await fetch(`${base}/content`)).json();
for (const a of content.items) {
  console.log(
    `  ${a.type.padEnd(24)} tags=${((a.tags ?? []).join(',') || '(untagged)').padEnd(12)} ` +
      `${a.digest.slice(7, 19)}`,
  );
}
const health = await (await fetch(`${base}/health`)).json();
console.log(`  index refreshedAt: ${health.refreshedAt}`);
for (const r of health.registries ?? []) {
  console.log(`  registry ${r.name}: last attempt ${r.at} ok=${r.ok} artifacts=${r.artifacts}`);
}
