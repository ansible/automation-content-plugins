# Running in Automation Portal

The full loop: RHDH with dynamic plugin loading, and the content UI at
`/automation-content`. Slower than the [standalone harness](development-environment.md),
and the only place packaging and mounting are actually exercised.

## Get the portal

The wiring for these plugins lives on a branch of `automation-portal-local`:

| | |
|---|---|
| Repository | `https://github.com/ansible-automation-platform/automation-portal-local` |
| Branch | `feat/automation-content-plugins` |

```bash
git clone --recurse-submodules \
  git@github.com:ansible-automation-platform/automation-portal-local.git
cd automation-portal-local
git checkout feat/automation-content-plugins
cp .env.example .env
```

That branch adds:

- `scripts/build-content-plugins.sh` and `make build-content-plugins` — export and pack
  these plugins as RHDH dynamic plugins
- the `automationContent` catalog provider in `overlay/app-config.portal.yaml`
- the `dynamicRoutes` block in `overlay/dynamic-plugins.portal.yaml` that mounts the UI
- the registry environment variables

## Configure

In `.env`:

| Variable | Value |
|---|---|
| `PLUGIN_REPO` | your `ansible-backstage-plugins` clone |
| `CONTENT_PLUGIN_REPO` | **this** repository |
| `CONTENT_REGISTRY_URL` | `http://host.containers.internal:8080` |
| `CONTENT_REGISTRY_USERNAME` / `_PASSWORD` | from `dev/quay/.env` in this repo |

Note `host.containers.internal`, not `127.0.0.1` — the portal runs in a container, where
`127.0.0.1` is the container itself.

## Run

```bash
make start                      # export + pack everything, start the portal
make build-content-plugins      # re-export + pack only these plugins
make reload                     # after a code change
```

- Portal UI: `http://localhost:7007` — sign in with AAP → mock → `user` / `password`
- Content UI: `http://localhost:7007/automation-content`

`CONTENT_PLUGINS_ENABLED=0` builds the portal without this plugin set.

## Check it came up

```bash
node tools/check-portal.mjs      # /health, /registries, /execution-environments
node tools/check-portal-ui.mjs   # the frontend plugin actually loaded
```

## The mount path is configuration

The frontend declares a route ref with **no path**. `/automation-content` is chosen
entirely by the `dynamicRoutes` block in `overlay/dynamic-plugins.portal.yaml`. If the
page 404s, look there — not at the source.
See [ADR-005](../../.sdlc/adrs/005-dedicated-repository-and-mount-path.md).
