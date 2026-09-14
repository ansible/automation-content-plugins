# automation-content-plugins

Ansible automation content management for Red Hat Developer Hub / Backstage — discovery,
governance, trust and lifecycle for execution environments, collections and future content
types, over any OCI-compliant registry.

Mounted in Automation Portal at **`/automation-content`**.

> **Status: proof of concept, under active development.** Interfaces, config shape, API
> routes and entity shape all still move without notice, and nothing here is supported or
> ready to depend on. The point is to validate architecture, not to ship a product.
>
> Architecture decisions are recorded in [`.sdlc/adrs/`](.sdlc/adrs/). The design set they
> state the alternatives they rejected and why, so each can be followed on its own —
> `04-requirements-driven-design.md`, `05-separation-of-concerns.md` and `06-poc-spec.md`.
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

Requires Node 22 or 24, Yarn 4 via Corepack.

```bash
yarn install
yarn tsc          # typecheck
yarn test         # unit tests
```

### Running it

Two loops, depending on what you are working on:

- **Standalone harness** — `yarn workspace backend start` gives you the catalog, the
  content provider and the API on `http://127.0.0.1:7007`, with no portal. Registries are
  configured in `app-config.yaml`; copy `.env.local.example` to `.env.local` to point it
  at one.
- **Full Automation Portal** — RHDH with dynamic plugin loading and the UI at
  `/automation-content`, via
  [`automation-portal-local`](https://github.com/ansible-automation-platform/automation-portal-local)
  on branch **`feat/automation-content-plugins`**. That branch adds the content plugin
  export and pack step (`make build-content-plugins`), the `automationContent` catalog
  provider, the `dynamicRoutes` block that mounts the UI, and the registry environment
  variables. Point its `CONTENT_PLUGIN_REPO` at this checkout and run `make start`.

Both need a registry with content in it, and both are covered step by step — including the
container networking and registry auth wrinkles that will otherwise cost you an afternoon
— in **[docs/guides/development-environment.md](docs/guides/development-environment.md)**.

### Testing against real registries

`MockRegistry` in `automation-content-common/src/testing` simulates registry dialects with
configurable capabilities. The most valuable configuration is the deliberately crippled
one — no `_catalog`, no referrers, no pagination — because that is the honest worst case
the design must survive, and "degrades gracefully" is otherwise a claim rather than a
property.

For integration work:

```bash
podman run -d -p 5000:5000 ghcr.io/project-zot/zot-linux-amd64:latest  # OCI 1.1, referrers
podman run -d -p 5001:5000 docker.io/library/registry:2                # minimal
```

## License

Apache-2.0
