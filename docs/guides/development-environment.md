# Development environment

The standalone harness: the catalog, the content provider and the content API, and no
portal. It restarts in seconds, so it is where most backend work happens.

For the real thing — RHDH, dynamic plugin loading, the UI — see
[automation-portal.md](automation-portal.md).

## Prerequisites

- Node 22 or 24, Yarn 4 via Corepack (`corepack enable`)
- Podman
- A registry with content in it — see [local-registry.md](local-registry.md)

## Install

```bash
yarn install
yarn tsc          # also emits dist-types/, which packaging later depends on
yarn test
```

## Configure

Registries are configured in `app-config.yaml` under
`catalog.providers.automationContent`. Adding one is a config change, never a code
change.

```bash
cp .env.local.example .env.local
```

The default points at `http://127.0.0.1:5000`. For a registry that requires
authentication, export the credentials in the shell rather than writing them to a file:

```bash
export CONTENT_REGISTRY_USERNAME=...
export CONTENT_REGISTRY_PASSWORD=...
```

## Run

```bash
yarn workspace backend start
```

The backend listens on `http://127.0.0.1:7007`.

## Sync and inspect

Discovery runs on a schedule, but you will usually want to trigger it:

```bash
node tools/sync-once.mjs local-registry      # one sync, with timing
node tools/poll-once.mjs local-registry      # one drift poll
```

Then look at what it found:

```bash
node tools/show-catalog.mjs                  # catalog entities, as a consumer sees them
node tools/demo-api.mjs                      # walk the API end to end
node tools/verify-levels.mjs                 # the drill-down, as the UI does it
node tools/verify-drift-cache.mjs            # digest cache and drift behaviour
```

`tools/trace-auth.mjs` prints the registry authentication handshake step by step, with
secrets redacted — the first thing to reach for when a registry will not talk to you.

## Tests

```bash
yarn test                                    # unit tests
yarn tsc                                     # typecheck
```

The live-registry integration tests are skipped unless `E2E_REGISTRY` is set:

```bash
E2E_REGISTRY=127.0.0.1:5000 E2E_REPOSITORY=demo/network-ee E2E_TAG=dev \
  yarn workspace @ansible/automation-content-common test liveRegistry --watch=false
```

`MockRegistry` in `automation-content-common/src/testing` simulates registry dialects
with configurable capabilities. The most valuable configuration is the deliberately
crippled one — no `_catalog`, no referrers, no pagination — because that is the honest
worst case the design must survive, and "degrades gracefully" is otherwise a claim
rather than a property.
