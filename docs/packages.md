# Packages

| Package | Role |
|---|---|
| `@ansible/content-model` | The universal content object. Types and pure helpers, **zero runtime dependencies**, no Backstage imports. The shared contract. |
| `@ansible/automation-content-common` | OCI Distribution v2 client, capability probe, digest cache, content-manifest reader, the OCI backend adapter, and the `BackendAdapter` / `ContentTypeAdapter` / `SigningProvider` contracts. |
| `@ansible/content-type-execution-environment` | The execution environment content type: recognises EE images and enumerates them from a build-time content manifest. |
| `@ansible/content-type-helm-chart` | The Helm chart content type. Deliberately minimal — it exists to demonstrate that a content type is something you add, not something you edit. |
| `@ansible/plugin-catalog-backend-module-automation-content` | `OCIRegistryEntityProvider` — discovers content in configured registries and emits catalog entities. Also the composition root that registers content types. |
| `@ansible/plugin-automation-content-backend` | The content API: discovery, documentation, and requirements resolution. Spec in [`../api/openapi.yaml`](../api/openapi.yaml). |
| `@ansible/plugin-automation-content` | Frontend. Mounted wherever `dynamicRoutes` says — by default `/automation-content`. |

`packages/backend` is a minimal standalone harness: the catalog plus these plugins and
nothing else, for working on the backend without standing up a portal.

## Dependency direction

```
content-model                    imports nothing
    ↑
automation-content-common        OCI + contracts; no Ansible semantics
    ↑                    ↑
content-type-*           catalog-backend-module        automation-content (frontend)
    ↑                    ↑                                 ↑
    └────────────────────┴── automation-content-backend    content-model only
```

The arrows are the architecture. A package may only import from below it, which is why
`content-model` can never acquire a dependency on storage or UI, and why the frontend
cannot import the backend.

## What belongs where

| If it knows… | It belongs in… |
|---|---|
| HTTP, OCI, registry dialects | `automation-content-common` |
| What an execution environment *is* | `content-type-execution-environment` |
| Neither — just the shape of content | `content-model` |
| Which content types this deployment has | `catalog-backend-module/src/contentTypes.ts` |

See [architecture.md](architecture.md) for the rules these encode, and
[guides/adding-a-content-type.md](guides/adding-a-content-type.md) to add one.
