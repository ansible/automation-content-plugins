/** Check which fields the UI reads are actually present in API responses. */
const base = (process.env.PORTAL_URL ?? 'http://127.0.0.1:7007') + '/api/automation-content';
const get = async p => (await fetch(base + p)).json();

const ees = await get('/content?type=execution-environment');
const ee = ees.items[0];
const enc = encodeURIComponent(ee.ref);

console.log('artifact keys:', Object.keys(ee).join(', '));

const contents = await get(`/content/${enc}/contents`);
console.log('contents keys:', Object.keys(contents).join(', '));
console.log('  collections[0] keys:', Object.keys(contents.collections[0] ?? {}).join(', '));

const items = await get(`/content-items?in=${enc}&limit=2`);
console.log('item summary keys:', Object.keys(items.items[0] ?? {}).join(', '));

const detail = await get(`/content-items/cisco.ios.ios_vlans?in=${enc}`);
console.log('item detail keys:', Object.keys(detail).join(', '));
console.log('  providedBy present? ->', 'providedBy' in detail, detail.providedBy);
