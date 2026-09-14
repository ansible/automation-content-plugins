/** Diagnostic: raw catalog API response shape and any processing errors. */
const base = process.env.BACKEND_URL ?? 'http://127.0.0.1:7007';

for (const path of [
  '/api/catalog/entities?limit=5',
  '/api/catalog/entities/by-query?limit=5',
]) {
  try {
    const res = await fetch(base + path);
    const text = await res.text();
    console.log(`\n${path} -> ${res.status}`);
    console.log(text.slice(0, 400));
  } catch (err) {
    console.log(`\n${path} -> ERROR ${err.message}`);
  }
}
