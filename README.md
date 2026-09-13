# automation-content-plugins

Ansible automation content management for Red Hat Developer Hub / Backstage — discovery,
governance, trust and lifecycle for execution environments, collections and future content
types, over any OCI-compliant registry.

Mounted in Automation Portal at **`/automation-content`**.

> **Status: proof of concept.** Validating architecture, not shipping a product. See the
> recorded in .sdlc/adrs/, each stating the alternatives it rejected —
> `04-requirements-driven-design.md`, `05-separation-of-concerns.md` and `06-poc-spec.md`.

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
| `@ansible/automation-content-common` | OCI Distribution v2 client, capability probe, and the `BackendAdapter` / `ContentTypeAdapter` / `SigningProvider` contracts. |

Planned: `automation-content-backend`, `catalog-backend-module-automation-content`,
`automation-content` (frontend).

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
yarn tsc                                              # typecheck
yarn workspace @ansible/automation-content-common test --watch=false
```

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
