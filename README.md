# automation-content-plugins

Ansible automation content management for Red Hat Developer Hub / Backstage — discovery,
governance, trust and lifecycle for execution environments, collections and future
content types, over any OCI-compliant registry.

Mounted in Automation Portal at **`/automation-content`**.

> **Status: proof of concept, under active development.** Interfaces, config shape, API
> routes and entity shape all still move without notice. Nothing here is supported or
> ready to depend on.

## Local Development Setup for Automation Portal

From a fresh clone to content on screen. About twenty minutes, most of it the image
build in step 1 — start that first and set up the rest while it runs.

**You need:** Node 22 or 24 with Yarn 4 (`corepack enable`), Podman, and Python 3.11+.

**1. Build an execution environment with a content manifest**

This is what makes the rest worth looking at. Without it an image still appears in the
portal, but its contents report as **unknown** — the state most images in the field are
in today.

Manifest generation and publishing are not in upstream `ansible-builder`, so build from
the fork:

```bash
git clone https://github.com/ganeshrn/ansible-builder.git
cd ansible-builder                     # devel is the default branch, and has the change
pip install -e .                       # Python 3.11+; a virtualenv is worth it
ansible-builder publish --help         # absent upstream: confirms you have the fork

ansible-builder build \
  -f examples/content-manifest/execution-environment.yml \
  -t localhost:8080/demo/network-ee:dev \
  --container-runtime podman
```

The manifest is generated **inside the image, by that image's own `ansible-core`** — no
flag needed, it is on by default. Doing it any other way produces documentation that can
be quietly wrong.
Details: **[docs/guides/building-an-execution-environment.md](docs/guides/building-an-execution-environment.md)**.

**2. Install this repository**

```bash
yarn install
yarn tsc          # also emits dist-types/, which packaging later depends on
yarn test
```

**3. Start a local Quay**

```bash
./dev/quay/setup.sh
```

Generates secrets into `dev/quay/.env` (gitignored), starts Quay with Postgres and
Redis, and creates the first user. A couple of minutes on a cold pull.

**4. Push the image, and its manifest beside it**

```bash
set -a; . dev/quay/.env; set +a
export CONTENT_REGISTRY_USERNAME="$QUAY_USERNAME"
export CONTENT_REGISTRY_PASSWORD="$QUAY_PASSWORD"

podman login --tls-verify=false -u "$CONTENT_REGISTRY_USERNAME" \
  -p "$CONTENT_REGISTRY_PASSWORD" localhost:8080

ansible-builder publish localhost:8080/demo/network-ee:dev --insecure
```

`publish` pushes the image, then publishes the content manifest as an OCI referrer
beside it — so a consumer can read what is inside without pulling gigabytes.

**5. Run the backend**

```bash
cp .env.local.example .env.local      # already points at 127.0.0.1:8080
yarn workspace backend start          # http://127.0.0.1:7007
```

**6. Sync and look**

```bash
node tools/sync-once.mjs local-registry     # discover now, rather than waiting
node tools/verify-levels.mjs                # walk what it found
node tools/show-catalog.mjs                 # the same content as catalog entities
```

You should see the environment with its collections, modules and plugins — down to
nested suboptions on individual modules. If contents come back as **unknown**, the
manifest did not reach the registry; check step 4.

`sync-once` refreshes the content API immediately. Catalog *entities* are written by a
separate scheduled provider that first runs a few seconds after startup, so give
`show-catalog` a moment if it comes back empty.

---

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
