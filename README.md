# automation-content-plugins

Ansible automation content management for Red Hat Developer Hub / Backstage — discovery,
governance, trust and lifecycle for execution environments, collections and future content
types, over any OCI-compliant registry.

Mounted in Automation Portal at **`/automation-content`**.

> **Status: proof of concept, under active development.** Interfaces, config shape, API
> routes and entity shape all still move without notice, and nothing here is supported or
> ready to depend on. The point is to validate architecture, not to ship a product.
>
> Architecture decisions, with the alternatives they rejected and why, are recorded in
> [`.sdlc/adrs/`](.sdlc/adrs/).
>
> **Proven so far:** the data path end to end — a build-time content manifest pushed to a
> live Quay and read back in 80 ms, and the same content rendered in Automation Portal at
> `/automation-content`. **Not yet proven:** signing (interface only), governance across a
> re-pointed tag, a second content type, more than one registry, and scale beyond a
> handful of images.

## Why this exists

Content management today is coupled to a single backend. The goal here is a stack where
the **storage backend and the content type are independent plug-in axes**, so that:

- any OCI-compliant registry works, with no reliance on vendor-specific extensions
- adding a new content type requires a new adapter and no core change
- governance and trust work identically whether content lives in a bundled registry, a
  customer's Quay/Harbor/ECR, an SCM, or a filesystem

## Packages

| Package | Role |
|---|---|
| `@ansible/content-model` | The universal content object. Types and pure helpers, **zero runtime dependencies**, no Backstage imports. The shared contract. |
| `@ansible/automation-content-common` | OCI Distribution v2 client, capability probe, digest cache, content-manifest reader, and the `BackendAdapter` / `ContentTypeAdapter` / `SigningProvider` contracts. |
| `@ansible/plugin-catalog-backend-module-automation-content` | `OCIRegistryEntityProvider` — discovers content in configured registries and emits catalog entities. |
| `@ansible/plugin-automation-content-backend` | The content API: discovery, documentation, and requirements resolution. Spec in [`api/openapi.yaml`](api/openapi.yaml). |
| `@ansible/plugin-automation-content` | Frontend. Mounted wherever `dynamicRoutes` says — by default `/automation-content`. |

`packages/backend` is a minimal standalone harness: the catalog plus these plugins and
nothing else, for working on the backend without standing up a portal.

## Architectural rules

These are enforced by package structure, not convention — and are worth preserving:

- **`content-model` imports nothing.** It cannot acquire a dependency on storage or UI.
- **`automation-content-common` knows HTTP and OCI, and nothing about execution
  environments or collections.** Content semantics live in content-type adapters.
- **Content-type adapters never branch on backend identity.** They receive a
  `BackendAdapter` and use only the interface. A `backend.id === 'oci'` check collapses
  the two axes and defeats the design.
- **Capabilities are probed, never assumed.** Every feature gates on a
  `BackendCapabilities` profile and degrades rather than failing.
- **Governance state is keyed on digest, never on a tag.** A tag is a mutable pointer;
  keying approval to one would silently transfer that approval to whatever content the
  tag is later moved to.
- **Portal is never in the artifact data path.** Controller, EDA and `podman` pull from
  the registry directly. Only metadata flows through here.

## Two levels of content

A distinction it is easy to lose, and expensive to lose:

- **Level A — the distributable artifact.** A collection, an EE, a skill. You push, sign,
  govern and promote these. Modelled as `ContentObject`.
- **Level B — content items inside an artifact.** Modules, plugins, roles, playbooks,
  rulebooks. You document and search these; they have no independent lifecycle. Modelled
  as `ContentObject.enumeration`.

Trust attaches at Level A only. Discovery operates at both.

## Enumeration fidelity

Determining what is inside an execution environment is attempted in cost order, and every
level is optional:

| Level | Source | Fidelity |
|---|---|---|
| 1 | Build-time content manifest, as an OCI referrer | **Exact** |
| 2 | Config-blob labels / annotations | Exact if build-emitted |
| 3 | Selective blob fetch | Good |
| 4 | Full pull and inspect | **Approximate** |
| 5 | `unknown` | Honest |

Level 5 is a first-class state, not a failure. The UI must distinguish "contains no
collections" from "contents could not be determined".

Levels 2–4 are approximations. An EE contains a specific `ansible-core`, and extracting
documentation from outside the image using a *different* core can produce subtly wrong
results. `Enumeration` therefore records `source` and `producedBy.ansibleCore`, and
externally-derived enumerations must never be presented as authoritative.

## Development

Two loops. Use the one that matches what you are working on.

| Loop | What you get | Use it for |
|---|---|---|
| **Standalone harness** | Catalog + provider + content API on `:7007`, no portal | Backend, provider, OCI client, API shape. Restarts in seconds. |
| **Automation Portal** | Real RHDH, dynamic plugin loading, the UI at `/automation-content` | Frontend work, plugin packaging, anything about how it is mounted |

### Prerequisites

- Node 22 or 24, Yarn 4 via Corepack (`corepack enable`)
- Podman — for the registry, and for the portal loop
- A registry with content in it — see below

### A registry to develop against

Any OCI-compliant registry works. Two are worth running locally, because the difference
between them is the thing this stack has to survive:

```bash
# OCI 1.1: native referrers API, the target state
podman run -d -p 5000:5000 --name zot ghcr.io/project-zot/zot-linux-amd64:latest

# Minimal: no referrers API, no _catalog — the honest worst case
podman run -d -p 5001:5000 --name registry2 docker.io/library/registry:2
```

Give one of them an execution environment and a content manifest to find:

```bash
podman tag <your-ee-image> localhost:5000/demo/network-ee:dev
podman push --tls-verify=false localhost:5000/demo/network-ee:dev

# Extract the manifest the build wrote into the image, and publish it as a referrer.
CID=$(podman create <your-ee-image>)
podman cp "$CID":/usr/share/ansible/content-manifest.json ./content-manifest.json
podman rm -f "$CID"

python3 tools/push-content-manifest.py \
  --registry localhost:5000 --repository demo/network-ee --tag dev \
  --manifest content-manifest.json --insecure
```

An execution environment built without a content manifest still works — discovery falls
one rung down the enumeration ladder and reports the contents as unknown, which is the
state most images in the field are in today.

### First run

```bash
yarn install
yarn tsc          # also emits dist-types/, which packaging depends on
yarn test
```

### Loop 1 — standalone harness

```bash
cp .env.local.example .env.local          # point it at your registry
# Only if your registry requires auth; a local zot or registry:2 does not.
export CONTENT_REGISTRY_USERNAME=...
export CONTENT_REGISTRY_PASSWORD=...
yarn workspace backend start
```

Registries are configured in `app-config.yaml` under
`catalog.providers.automationContent`. Adding one is a config change, never a code
change — that is the requirement, expressed as a wiring decision.

```bash
node tools/sync-once.mjs local-quay       # trigger a sync
node tools/show-catalog.mjs               # what landed in the catalog
node tools/demo-api.mjs                   # walk the API end to end
```

### Loop 2 — full Automation Portal

The portal wiring lives on a branch of
[`automation-portal-local`](https://github.com/ansible-automation-platform/automation-portal-local):

> **Branch: `feat/automation-content-plugins`**
>
> It adds the plugin export and pack step (`scripts/build-content-plugins.sh` and
> `make build-content-plugins`), the `automationContent` catalog provider in
> `app-config.portal.yaml`, the `dynamicRoutes` block that mounts the UI, and the
> registry environment variables.

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
| `CONTENT_PLUGIN_REPO` | **this** repository |
| `CONTENT_REGISTRY_URL` | `http://host.containers.internal:5000` |
| `CONTENT_REGISTRY_USERNAME` / `_PASSWORD` | only if your registry requires auth |

```bash
make start                      # export + pack everything, start the portal
make build-content-plugins      # re-export + pack only these plugins
make reload                     # after a code change
```

Portal UI: `http://localhost:7007` — sign in with AAP → mock → `user` / `password`.
Content UI: `http://localhost:7007/automation-content`.

`CONTENT_PLUGINS_ENABLED=0` builds the portal without this plugin set.

```bash
node tools/check-portal.mjs      # /health, /registries, /execution-environments
node tools/check-portal-ui.mjs   # the frontend plugin actually loaded
node tools/verify-levels.mjs     # walk the drill-down as the UI does
```

### Adding a content type

A content type is a package you add, not a file you edit. There is exactly one place
that names one:

```ts
// plugins/catalog-backend-module-automation-content/src/contentTypes.ts
export function defaultContentTypes(): ContentTypeRegistry {
  return new ContentTypeRegistry()
    .register(new ExecutionEnvironmentAdapter())
    .register(new HelmChartAdapter());
}
```

1. Create `plugins/content-type-<name>/` implementing `ContentTypeAdapter` — copy
   `content-type-helm-chart`, which is deliberately minimal.
2. Register it in `contentTypes.ts`.
3. Add it to the `--embed-package` list in the `export-dynamic` script of
   **both** `automation-content-backend` and
   `catalog-backend-module-automation-content`. Workspace packages are not published,
   so a package that is not embedded is missing at runtime in the portal.
4. `yarn install` — a new workspace has to reach `yarn.lock` before anything can build it.

Nothing else changes. `contentTypes.test.ts` holds that claim to account: it defines a
third content type inside the test file and follows it through discovery to a catalog
entity.

### Things that will bite you

**`yarn tsc` before packaging.** `export-dynamic` reads `.d.ts` files from
`dist-types/`, and fails with *"No declaration files found"* if you have not run it.

**A new workspace package needs three things,** and missing any one fails differently:
`yarn.lock` (via `yarn install`), the `--embed-package` flags above, and a `build`
script in its `package.json`.

**Stale `dist-dynamic`.** `rhdh-cli` runs `yarn install --immutable` in there, and a
lockfile left from an earlier export fails as soon as an embedded package's content
hash changes. `make build-content-plugins` removes the previous export first;
`FORCE_EXPORT=1` forces a re-export when it thinks nothing changed.

**`host.containers.internal`.** The portal runs in a container; `127.0.0.1` inside it
is the container, not your registry. Podman resolves that name natively — and the
branch removes the `extra_hosts` mapping, because the external docker-compose provider
cannot determine the gateway address and aborts container creation. On Docker, add it
back.

**Registry auth realm.** Quay advertises its token endpoint on its own configured
hostname, which from inside the portal container points at the container itself.
`rewriteAuthRealmHost: true` on the registry config makes the exchange reachable. It is
opt-in because it changes where credentials are sent — leave it off for any registry
you do not control.

**The mount path is configuration.** The frontend declares a route ref with no path. If
the page 404s, look at the `dynamicRoutes` block in
`overlay/dynamic-plugins.portal.yaml`, not at the source.

### Testing against real registries

`MockRegistry` in `automation-content-common/src/testing` simulates registry dialects
with configurable capabilities. The most valuable configuration is the deliberately
crippled one — no `_catalog`, no referrers, no pagination — because that is the honest
worst case the design must survive, and "degrades gracefully" is otherwise a claim
rather than a property.

For integration work, run the two registries above and point the provider at each in
turn. A registry that answers the referrers API and one that only answers the `sha256-`
fallback tag are both correct, and content must render identically against either.

## License

Apache-2.0
