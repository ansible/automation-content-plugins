# A local registry

You need an OCI registry with content in it. Any OCI-compliant registry works; this is
the quickest local one.

## Start it

```bash
podman run -d -p 5000:5000 --name zot ghcr.io/project-zot/zot-linux-amd64:latest
```

No authentication, so `auth: { type: anonymous }` in `app-config.yaml` is enough.

Check it is up:

```bash
curl -s http://127.0.0.1:5000/v2/ && echo OK
```

## Put something in it

```bash
podman pull quay.io/ansible/creator-ee:latest
podman tag quay.io/ansible/creator-ee:latest localhost:5000/demo/network-ee:dev
podman push --tls-verify=false localhost:5000/demo/network-ee:dev
```

That is enough to see discovery working. The image has no content manifest, so its
contents report as **unknown** — which is correct, and the state most images in the field
are in today. To get the full inventory, see
[building-an-execution-environment.md](building-an-execution-environment.md).

## Check what is there

```bash
curl -s http://127.0.0.1:5000/v2/_catalog
curl -s http://127.0.0.1:5000/v2/demo/network-ee/tags/list
```

## A second registry, deliberately worse

Worth running when you touch discovery, because the difference between the two is what
this stack has to survive:

```bash
podman run -d -p 5001:5000 --name registry2 docker.io/library/registry:2
```

`registry:2` has no referrers API and no `_catalog`. Content must still list and render
identically against it — discovery falls back to the `sha256-` tag convention and the
provider reads from an explicit repository list. If it only works against zot, it is not
working. See [ADR-003](../../.sdlc/adrs/003-probe-registry-capabilities.md).

## Registries that need credentials

Export them in the shell that starts the backend rather than writing them to a file:

```bash
export CONTENT_REGISTRY_USERNAME=...
export CONTENT_REGISTRY_PASSWORD=...
```

Note that Quay's `/v2/` API accepts bearer tokens only, so `curl -u` fails there with
*"Invalid bearer token format"* even when the credentials are correct. The clients in
this repository do the token exchange for you; raw `curl` needs it done by hand.

## Clean up

```bash
podman rm -f zot registry2
```
