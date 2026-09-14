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

**You need:** Node 22 or 24 with Yarn 4 (`corepack enable`), and Podman.

To see what is *inside* an execution environment — collections, modules, plugins,
documentation — you also need a patched `ansible-builder`, because manifest generation
and publishing are not upstream yet. That is step 6, and
[its guide](docs/guides/building-an-execution-environment.md) covers it. Steps 1–5 work
without it.

**1. Install**

```bash
yarn install
yarn tsc          # also emits dist-types/, which packaging later depends on
yarn test
```

**2. Start a local Quay**

```bash
./dev/quay/setup.sh
```

Generates secrets into `dev/quay/.env` (gitignored), starts Quay with Postgres and
Redis, and creates the first user. A couple of minutes on a cold pull.

**3. Put an image in it**

```bash
set -a; . dev/quay/.env; set +a
export CONTENT_REGISTRY_USERNAME="$QUAY_USERNAME"
export CONTENT_REGISTRY_PASSWORD="$QUAY_PASSWORD"

podman login --tls-verify=false -u "$CONTENT_REGISTRY_USERNAME" \
  -p "$CONTENT_REGISTRY_PASSWORD" localhost:8080
podman pull quay.io/ansible/creator-ee:latest
podman tag  quay.io/ansible/creator-ee:latest localhost:8080/demo/network-ee:dev
podman push --tls-verify=false localhost:8080/demo/network-ee:dev
```

**4. Run the backend**

```bash
cp .env.local.example .env.local      # already points at 127.0.0.1:8080
yarn workspace backend start          # http://127.0.0.1:7007
```

**5. Sync and look**

```bash
node tools/sync-once.mjs local-registry     # discover now, rather than waiting
node tools/verify-levels.mjs                # walk what it found
node tools/show-catalog.mjs                 # the same content as catalog entities
```

You should see the image catalogued with its contents reported as **unknown** — correct,
because it has no content manifest, and the state most images in the field are in.

`sync-once` refreshes the content API immediately. Catalog *entities* are written by a
separate scheduled provider that first runs a few seconds after startup, so give
`show-catalog` a moment if it comes back empty.

**6. Get the full inventory**

Turning "contents unknown" into collections, modules, plugins and documentation needs an
EE that carries a build-time content manifest, published to the registry as an OCI
referrer. That needs the patched `ansible-builder`:

```bash
git clone -b move-changes-from-ansible-builder \
  https://github.com/ganeshrn/ansible-builder.git
cd ansible-builder && pip install -e .        # Python 3.11+

ansible-builder build   -t localhost:8080/demo/network-ee:dev --container-runtime podman
ansible-builder publish    localhost:8080/demo/network-ee:dev --insecure
```

Full walkthrough, including the EE definition and why generation happens inside the
image:
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
