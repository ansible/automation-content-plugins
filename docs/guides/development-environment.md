# Development environment

Two ways to run this plugin set locally. Use the one that matches what you are working on.

| Loop | What it gives you | When |
|---|---|---|
| **Standalone harness** — `packages/backend` in this repo | Catalog plus the content provider and API, no portal | Backend, provider, OCI client, API shape. Seconds to restart. |
| **Automation Portal** — via `automation-portal-local` | The real thing: RHDH, dynamic plugin loading, the UI at `/automation-content` | Frontend work, dynamic-plugin packaging, anything about how it is mounted. |

Both need a registry with content in it. Start there.

## Prerequisites

- Node 22 or 24, Yarn 4 via Corepack (`corepack enable`)
- Podman, for the registry and for the portal
- This repository, and — for the portal loop —
  [`automation-portal-local`](https://github.com/ansible-automation-platform/automation-portal-local)

## 1. A registry with content

Any OCI-compliant registry works. Two are worth running locally, because the difference
between them is exactly what this stack has to survive:

```bash
# OCI 1.1: native referrers API, the target state
podman run -d -p 5000:5000 --name zot ghcr.io/project-zot/zot-linux-amd64:latest

# Minimal: no referrers API, no _catalog — the honest worst case
podman run -d -p 5001:5000 --name registry2 docker.io/library/registry:2
```

Neither requires authentication, so `auth: { type: anonymous }` is enough in
`app-config.yaml`. Against a registry that does require it, export
`CONTENT_REGISTRY_USERNAME` and `CONTENT_REGISTRY_PASSWORD` in the shell that starts the
backend, rather than writing them into a file.

Now give it something to find. Push an execution environment, then publish the content
manifest the build wrote into the image as an OCI referrer beside it — the build-time
inventory described in [ADR-002](../../.sdlc/adrs/002-build-time-content-manifest.md):

```bash
podman tag <your-ee-image> localhost:5000/demo/network-ee:dev
podman push --tls-verify=false localhost:5000/demo/network-ee:dev

CID=$(podman create <your-ee-image>)
podman cp "$CID":/usr/share/ansible/content-manifest.json ./content-manifest.json
podman rm -f "$CID"

python3 tools/push-content-manifest.py \
  --registry localhost:5000 --repository demo/network-ee --tag dev \
  --manifest content-manifest.json --insecure
```

Images without a manifest still work — discovery falls one rung down the enumeration
ladder and reports the contents as unknown, which is the state most images in the field
are in today. That path is worth exercising deliberately, not just tolerating.

## 2. Standalone harness

```bash
yarn install
yarn tsc                                    # typecheck
yarn test                                   # unit tests
```

Point the harness at the registry and start it:

```bash
cp .env.local.example .env.local            # then edit
yarn workspace backend start
```

The backend listens on `http://127.0.0.1:7007`. Registries are configured in
`app-config.yaml` under `catalog.providers.automationContent` — adding one is a
configuration change, never a code change.

```bash
node tools/sync-once.mjs local-quay         # trigger a sync
node tools/show-catalog.mjs                 # what landed in the catalog
node tools/demo-api.mjs                     # walk the API end to end
```

### Integration tests against a live registry

The live-registry tests are skipped unless `E2E_REGISTRY` is set:

```bash
E2E_REGISTRY=127.0.0.1:5000 E2E_REPOSITORY=demo/network-ee E2E_TAG=dev \
  yarn workspace @ansible/automation-content-common test liveRegistry --watch=false
```

## 3. Full Automation Portal

The portal wiring for these plugins lives on a branch of `automation-portal-local`:

> **Branch: `feat/automation-content-plugins`** — adds the content plugin export/pack
> step, the `automationContent` catalog provider, the `dynamicRoutes` block that mounts
> the UI, and the registry environment variables.

```bash
git clone --recurse-submodules \
  git@github.com:ansible-automation-platform/automation-portal-local.git
cd automation-portal-local
git checkout feat/automation-content-plugins

cp .env.example .env
```

Set in `.env`:

| Variable | Value |
|---|---|
| `PLUGIN_REPO` | your `ansible-backstage-plugins` clone |
| `CONTENT_PLUGIN_REPO` | this repository |
| `CONTENT_REGISTRY_URL` | `http://host.containers.internal:5000` |

| `CONTENT_REGISTRY_PASSWORD` | only if your registry requires auth |

Then:

```bash
make start                      # export + pack all plugins, start the portal
make build-content-plugins      # re-export + pack only the content plugins
```

Portal UI: `http://localhost:7007` — sign in with AAP → mock → `user` / `password`.
Content UI: `http://localhost:7007/automation-content`.

Set `CONTENT_PLUGINS_ENABLED=0` to build the portal without this plugin set.

### Verifying it came up

```bash
node tools/check-portal.mjs      # /health, /registries, /execution-environments
node tools/check-portal-ui.mjs   # the frontend plugin actually loaded
node tools/verify-levels.mjs     # walk the drill-down as the UI does
```

## Things that will bite you

**The mount path is configuration.** The plugin declares a route ref with no path
([ADR-005](../../.sdlc/adrs/005-dedicated-repository-and-mount-path.md)). If the page
404s, the `dynamicRoutes` block in `overlay/dynamic-plugins.portal.yaml` is where to look
— not the source.

**`host.containers.internal`.** The portal runs in a container and the registry runs on
the host, so `127.0.0.1` inside the container is the container. Podman resolves
`host.containers.internal` natively; the branch removes the `extra_hosts` mapping because
the external docker-compose provider cannot determine the gateway address and aborts
container creation. On Docker, add it back.

**Registry auth realm rewriting.** Quay advertises its token endpoint on its own
configured hostname, which from inside the portal container points at the container
itself. `rewriteAuthRealmHost: true` on the registry config makes the exchange reachable.
It is opt-in because it changes where credentials are sent — leave it off against any
registry you do not control.

**Stale dynamic-plugin exports.** `rhdh-cli` runs `yarn install --immutable` inside
`dist-dynamic`, and a lockfile left from an earlier export fails that check as soon as an
embedded package's content hash changes. `make build-content-plugins` removes the previous
export first; `FORCE_EXPORT=1` forces a re-export when it thinks nothing changed.
