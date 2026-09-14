# automation-content-plugins

Ansible automation content management for Red Hat Developer Hub / Backstage — discovery,
governance, trust and lifecycle for execution environments, collections and future
content types, over any OCI-compliant registry.

Mounted in Automation Portal at **`/automation-content`**.

> **Status: proof of concept, under active development.** Interfaces, config shape, API
> routes and entity shape all still move without notice. Nothing here is supported or
> ready to depend on.

## Quick start

From a fresh clone to content on screen. About ten minutes, most of it waiting.

**1. Install**

```bash
yarn install
yarn tsc          # also emits dist-types/, which packaging later depends on
yarn test
```

**2. Start a registry and put an image in it**

```bash
podman run -d -p 5000:5000 --name zot ghcr.io/project-zot/zot-linux-amd64:latest

podman pull quay.io/ansible/creator-ee:latest
podman tag  quay.io/ansible/creator-ee:latest localhost:5000/demo/network-ee:dev
podman push --tls-verify=false localhost:5000/demo/network-ee:dev
```

**3. Run the backend**

```bash
cp .env.local.example .env.local      # already points at 127.0.0.1:5000
yarn workspace backend start          # http://127.0.0.1:7007
```

**4. Sync and look**

```bash
node tools/sync-once.mjs local-registry
node tools/show-catalog.mjs
```

You should see the image catalogued with its contents reported as **unknown** — correct,
because it has no content manifest, and the state most images in the field are in.

**5. Get the full inventory**

To see collections, modules, plugins and documentation, build an EE that carries a
build-time content manifest:
**[docs/guides/building-an-execution-environment.md](docs/guides/building-an-execution-environment.md)**.

That is the standalone harness. For the real portal — RHDH, dynamic plugin loading, the
UI at `/automation-content` — see
**[docs/guides/automation-portal.md](docs/guides/automation-portal.md)**.

## Documentation

| | |
|---|---|
| [Local registry](docs/guides/local-registry.md) | Registries to develop against, including a deliberately minimal one |
| [Development environment](docs/guides/development-environment.md) | Install, configure, run, sync, test |
| [Building an execution environment](docs/guides/building-an-execution-environment.md) | EEs with a content manifest |
| [Automation Portal](docs/guides/automation-portal.md) | The full portal loop |
| [Adding a content type](docs/guides/adding-a-content-type.md) | Four steps, no core changes |
| [Troubleshooting](docs/guides/troubleshooting.md) | Failures that do not point at their own cause |
| [Architecture](docs/architecture.md) | The two-axis model and the rules it enforces |
| [Packages](docs/packages.md) | What each package is, and what may import what |
| [ADRs](.sdlc/adrs/) | Every decision, with the alternatives it rejected |

## License

Apache-2.0
