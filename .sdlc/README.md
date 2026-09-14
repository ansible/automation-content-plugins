# SDLC Documentation

Software development lifecycle artifacts for the Ansible automation content management
plugins.

## Structure

```
.sdlc/
└── adrs/               Architecture Decision Records (numbered, append-only)
```

Developer guides live under [`docs/guides/`](../docs/guides/) at the repo root.

The design work these decisions are drawn from — requirements analysis, separation of
concerns, and the decisions drawn from them — is restated here so that each ADR
is self-contained. ADRs here record what was *decided*, with enough context to
follow the reasoning without that workspace.

## Conventions

- **ADRs** are numbered sequentially and append-only. A decision is never deleted, only
  superseded by a later ADR that links back to it.
- An ADR records a decision that constrains implementation. Anything that is merely
  description belongs in `docs/`, not here.
- Keep the set small. Five decisions that are genuinely load-bearing are more useful than
  thirty that restate the code.
