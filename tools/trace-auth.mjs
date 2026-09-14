/**
 * Show the registry authentication handshake step by step, with secrets redacted.
 *
 * Mirrors exactly what OCIClient does, so the output is the real flow rather than a
 * description of it.
 */
const registry = process.env.REGISTRY ?? '127.0.0.1:8080';
const repository = process.env.REPOSITORY ?? 'demo/network-ee';
const username = process.env.REGISTRY_USERNAME ?? '';
const password = process.env.REGISTRY_PASSWORD ?? '';
const origin = `http://${registry}`;

const redact = s =>
  (s ?? '').replace(/(Basic |Bearer )[A-Za-z0-9._~+/=-]+/g, '$1<redacted>');
const shortToken = t => (t ? `${t.slice(0, 8)}…${t.slice(-6)} (${t.length} chars)` : '—');

console.log(`\nregistry: ${origin}   repository: ${repository}   user: ${username || '(anonymous)'}\n`);

// ── 1. Ask an endpoint we expect to reject us, to learn where to authenticate ──
console.log('1. GET /v2/  with no credentials');
let res = await fetch(`${origin}/v2/`);
const challenge = res.headers.get('www-authenticate');
console.log(`   -> ${res.status}`);
console.log(`   WWW-Authenticate: ${challenge}`);

// ── 2. Parse the challenge ──
const params = {};
for (const part of (challenge ?? '').replace(/^Bearer\s+/i, '').split(',')) {
  const [k, ...rest] = part.split('=');
  if (rest.length) params[k.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
}
console.log(`\n2. parsed challenge`);
console.log(`   realm   = ${params.realm}`);
console.log(`   service = ${params.service}`);

// ── 3. Exchange credentials for a scoped token ──
const scope = `repository:${repository}:pull`;
const tokenUrl = new URL(params.realm);
// The realm host may be unreachable from here; OCIClient rewrites it only when the
// connection opts in via rewriteAuthRealmHost.
const advertisedHost = tokenUrl.host;
tokenUrl.host = registry;
tokenUrl.searchParams.set('service', params.service ?? '');
tokenUrl.searchParams.set('scope', scope);

console.log(`\n3. GET the token endpoint`);
console.log(`   advertised realm host: ${advertisedHost}`);
console.log(`   host actually used:    ${tokenUrl.host}  ${advertisedHost !== tokenUrl.host ? '(rewritten)' : ''}`);
console.log(`   scope: ${scope}`);

const basic = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
console.log(`   Authorization: ${redact(basic)}`);

res = await fetch(tokenUrl.toString(), {
  headers: { Authorization: basic, Accept: 'application/json' },
});
console.log(`   -> ${res.status}`);
const body = await res.json();
const token = body.token ?? body.access_token;
console.log(`   token:      ${shortToken(token)}`);
console.log(`   expires_in: ${body.expires_in ?? '(not stated)'}`);

// A registry token is a JWT; its claims say what it actually grants.
if (token && token.split('.').length === 3) {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  console.log(`   claims.iss: ${claims.iss}`);
  console.log(`   claims.sub: ${claims.sub}`);
  console.log(`   claims.aud: ${claims.aud}`);
  console.log(`   claims.exp: ${new Date(claims.exp * 1000).toISOString()}`);
  console.log(`   granted:    ${JSON.stringify(claims.access)}`);
}

// ── 4. Use it ──
console.log(`\n4. retry the real request with the bearer token`);
res = await fetch(`${origin}/v2/${repository}/tags/list`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
console.log(`   GET /v2/${repository}/tags/list -> ${res.status}`);
console.log(`   tags: ${JSON.stringify((await res.json()).tags)}`);

// ── 5. Show that the scope matters ──
console.log(`\n5. same token against a DIFFERENT repository (scope is per-repository)`);
res = await fetch(`${origin}/v2/demo/does-not-exist/tags/list`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
console.log(`   -> ${res.status}  ${res.status === 401 ? '(token not valid for this scope)' : ''}`);
console.log('');
