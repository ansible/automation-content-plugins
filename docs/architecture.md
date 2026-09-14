# Architecture

## Why this exists

Content management today is coupled to a single backend. The goal here is a stack where
the **storage backend and the content type are independent plug-in axes**, so that:

- any OCI-compliant registry works, with no reliance on vendor-specific extensions
- adding a new content type requires a new adapter and no core change
- governance and trust work identically whether content lives in a bundled registry, a
  customer's Quay/Harbor/ECR, an SCM, or a filesystem

The two axes meet at a universal content object. A **backend adapter** knows a protocol
and nothing about Ansible; a **content-type adapter** knows content semantics and nothing
about transport. See [ADR-001](../.sdlc/adrs/001-two-axis-adapter-model.md).

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
  ([ADR-003](../.sdlc/adrs/003-probe-registry-capabilities.md))
- **Governance state is keyed on digest, never on a tag.** A tag is a mutable pointer;
  keying approval to one would silently transfer that approval to whatever content the
  tag is later moved to. ([ADR-004](../.sdlc/adrs/004-digest-keyed-state.md))
- **Portal is never in the artifact data path.** Controller, EDA and `podman` pull from
  the registry directly. Only metadata flows through here.

## Two levels of content

A distinction it is easy to lose, and expensive to lose:

- **Level A — the distributable artifact.** A collection, an EE, a skill. You push, sign,
  govern and promote these. Modelled as `ContentObject`.
- **Level B — content items inside an artifact.** Modules, plugins, roles, playbooks,
  rulebooks. You document and search these; they have no independent lifecycle. Modelled
  as `ContentObject.enumeration`.

Trust attaches at Level A only. Discovery operates at both. The API keeps them apart:
`/content` addresses artifacts, `/content-items` addresses what is inside them.

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
results — not merely incomplete, but quietly wrong, which is worse. `Enumeration`
therefore records `source` and `producedBy.ansibleCore`, and externally-derived
enumerations must never be presented as authoritative.
See [ADR-002](../.sdlc/adrs/002-build-time-content-manifest.md).

## Decisions

Every significant decision, with the alternatives it rejected and why, is in
[`.sdlc/adrs/`](../.sdlc/adrs/).
