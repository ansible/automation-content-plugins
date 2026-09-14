# SDLC Documentation

Software development lifecycle artifacts for the Ansible automation content management
plugins.

## Structure

```
.sdlc/
└── adrs/               Architecture Decision Records (numbered, append-only)
```

Developer guides live under [`docs/guides/`](../docs/guides/) at the repo root.

Each ADR is self-contained. It states the context, the alternatives that were rejected
and why, the decision, and its consequences — so the reasoning can be followed and
challenged from this repository alone, without reference to any other document.

## Conventions

- **ADRs** are numbered sequentially and append-only. A decision is never deleted, only
  superseded by a later ADR that links back to it.
- An ADR records a decision that constrains implementation. Anything that is merely
  description belongs in `docs/`, not here.
- Keep the set small. Five decisions that are genuinely load-bearing are more useful than
  thirty that restate the code.
