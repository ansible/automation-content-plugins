# Troubleshooting

Everything here cost someone real time.

## Packaging

**`No declaration files found at ../../dist-types/...`**
`export-dynamic` reads `.d.ts` files that `yarn tsc` emits. Run `yarn tsc` first.

**The export tries to fetch an `@ansible/...` package from npm.**
Workspace packages are never published. Add it to the `--embed-package` list in the
`export-dynamic` script of both backend packages.

**`Package ... not found in the project`.**
A new workspace has not reached `yarn.lock`. Run `yarn install`.

**The export fails after a source change, complaining about an immutable install.**
`rhdh-cli` runs `yarn install --immutable` inside `dist-dynamic`, and a lockfile left
from an earlier export fails as soon as an embedded package's content hash changes.
`make build-content-plugins` removes the previous export first; `FORCE_EXPORT=1` forces a
re-export when it thinks nothing changed.

## Registries

**`curl -u` fails with "Invalid bearer token format".**
Quay's `/v2/` API accepts bearer tokens only, so Basic credentials are rejected before
the password is even checked. Nothing is wrong with your credentials. Do the token
exchange, or use the clients in this repository, which do it for you.

**Everything 400s or 401s against Quay.**
The auth priming request must be sent *anonymously*. Presenting Basic credentials to
`/v2/` earns `400 Invalid bearer token format` rather than a challenge — and a 400
carries no `WWW-Authenticate` header, so the client never learns where to exchange
credentials.

**The portal container cannot reach a registry on your machine.**
`127.0.0.1` inside a container is the container. Use `host.containers.internal`, which
podman resolves natively. Do not add an `extra_hosts: host-gateway` mapping — the
external docker-compose provider cannot determine the gateway address and aborts
container creation. On Docker, you do need the mapping.

**Registry auth realm unreachable from inside a container.**
Quay advertises its token endpoint on its own configured hostname, which from inside the
portal container points at the container itself. Set `rewriteAuthRealmHost: true` on the
registry config. It is opt-in because it changes where credentials are sent — leave it
off for any registry you do not control.

**Contents show as unknown.**
Usually correct: the image has no content manifest. See
[building-an-execution-environment.md](building-an-execution-environment.md). To confirm,
check whether a `sha256-<hex>` tag exists alongside your tag in
`/v2/<repo>/tags/list` — that is the referrer fallback index.

## Portal

**`/automation-content` 404s.**
The mount path is configuration, not code. Look at the `dynamicRoutes` block in
`overlay/dynamic-plugins.portal.yaml`.

**The catalog appears empty.**
In the standalone harness, check `app-config.yaml` uses a file-backed SQLite database
rather than `:memory:`. With an in-memory database each pooled connection gets its own
separate database, so writes and reads land in different places.

## Git

**`GH013: Commits must have verified signatures`.**
The `ansible` organisation requires signed commits. Re-sign the branch:

```bash
git rebase --root --exec 'git commit --amend --no-edit -S'
```

Your committer email must also be a verified email on your GitHub account, or the
commits will be signed but show as Unverified.
