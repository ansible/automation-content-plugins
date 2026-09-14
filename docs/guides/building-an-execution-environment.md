# Building an execution environment with a content manifest

A **content manifest** is an inventory of everything inside an execution environment —
collections, modules, plugins, roles, EDA plugins, rulebooks, with documentation — that
is generated *inside the image at build time, by that image's own `ansible-core`*, and
published to the registry beside the image as an OCI referrer.

That lets this stack answer "what is in this EE?" in a few HTTP calls instead of pulling
gigabytes. Measured against a live registry: the complete inventory of a 563 MB image —
5 collections, 200 plugins, nested suboptions and examples — read back in **102 ms**.

Generating it inside the image is a correctness property, not a convenience. An EE ships
a specific `ansible-core`, and extracting documentation from outside with a different one
resolves documentation fragments, plugin loading and argument specs differently. The
output can be quietly wrong. See
[ADR-002](../../.sdlc/adrs/002-build-time-content-manifest.md).

## You need a patched ansible-builder

Manifest generation and publishing are not in upstream `ansible-builder` yet. Until they
land, build from this branch:

| | |
|---|---|
| Repository | `https://github.com/ganeshrn/ansible-builder` |
| Branch | `move-changes-from-ansible-builder` |

```bash
git clone -b move-changes-from-ansible-builder \
  https://github.com/ganeshrn/ansible-builder.git
cd ansible-builder
pip install -e .            # needs Python 3.11+
ansible-builder --version
```

It adds two things to `ansible-builder`:

- **`ansible-builder build`** generates the manifest inside the final image and writes it
  to `/usr/share/ansible/content-manifest.json`. On by default for schema v3.
- **`ansible-builder publish`** pushes the image, then publishes that manifest as an OCI
  referrer of it.

## Define the EE

`ansible-builder` writes the manifest with no extra configuration — the block below is
shown only because it is the knob:

```yaml
version: 3

images:
  base_image:
    name: quay.io/fedora/fedora:41

dependencies:
  galaxy:
    collections:
      - name: ansible.utils
      - name: ansible.netcommon

  # ansible-core comes from the RPM below, not pip: the cryptography aarch64 wheel
  # exceeds the podman machine's CPU baseline, and pip installing ansible-core dies
  # with SIGILL on Apple silicon. ansible-runner is pure Python and must be present,
  # or the final check_ansible step fails the build.
  ansible_runner:
    package_pip: ansible-runner

  system:
    - gcc [platform:rpm compile]
    - python3-devel [platform:rpm compile]
    - libxml2-devel [platform:rpm compile]
    - libxslt-devel [platform:rpm compile]

additional_build_steps:
  prepend_base:
    - RUN $PKGMGR install -y ansible-core python3-pip && $PKGMGR clean all

options:
  content_manifest:
    enabled: true      # the default
    docs: full         # full | summary | none
```

A ready-to-run copy lives in the patched `ansible-builder` at
`examples/content-manifest/`, alongside a script that builds, publishes and verifies in
one command.

## Build and publish

```bash
ansible-builder build -t localhost:8080/demo/network-ee:dev --container-runtime podman
ansible-builder publish localhost:8080/demo/network-ee:dev --insecure
```

The build takes several minutes; generating the manifest takes a few seconds of that.
Publishing and reading it back take under a second.

`publish` is separable from building: `--skip-image-push --manifest <file>` publishes a
manifest for an image already in the registry, and needs no container runtime at all.

## Check it worked

```bash
node tools/trace-auth.mjs
```

The tag listing should show your tag plus a `sha256-<hex>` tag. That second one is the referrer
fallback index — the manifest, discoverable on registries with no referrers API.

The patched `ansible-builder` also ships a verifier that reads the manifest back the way
this stack does and checks it is usable:

```bash
python3 examples/content-manifest/verify-content-manifest.py \
  localhost:8080/demo/network-ee:dev --insecure
```

Then start the backend and the contents will be there:

```bash
node tools/sync-once.mjs local-registry
node tools/show-catalog.mjs
```

## If you skip all this

Discovery still works. An image with no content manifest is catalogued with its contents
reported as **unknown**, which is honest and is the state most images in the field are in.
Exercising that path deliberately is worthwhile, not merely tolerable.
