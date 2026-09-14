# A local registry

You need an OCI registry with content in it. Use **Quay** — it is what customers run, and
it is strict in ways that matter.

Quay rejects several things the OCI specification permits. Three of them shaped this
codebase, and none reproduce against a permissive registry:

- custom artifact and layer media types are rejected outright, including
  `application/vnd.oci.empty.v1+json` as a config
- the referrers API is unavailable, so discovery falls back to the `sha256-` tag
- index descriptors require `platform`, though the spec makes it optional

A stack that only works against a lenient registry is not working.
See [ADR-003](../../.sdlc/adrs/003-probe-registry-capabilities.md).

## Start Quay

```bash
./dev/quay/setup.sh
```

That generates secrets into `dev/quay/.env` (gitignored), writes a Quay config, starts
Quay with Postgres and Redis, waits for it, and creates the first user. Takes a couple of
minutes on a cold pull. Re-running it is safe.

Then export the credentials:

```bash
set -a; . dev/quay/.env; set +a
export CONTENT_REGISTRY_USERNAME="$QUAY_USERNAME"
export CONTENT_REGISTRY_PASSWORD="$QUAY_PASSWORD"
```

Quay UI: `http://127.0.0.1:8080` — the password is in `dev/quay/.env`.

## Put something in it

```bash
podman login --tls-verify=false -u "$CONTENT_REGISTRY_USERNAME" \
  -p "$CONTENT_REGISTRY_PASSWORD" localhost:8080

podman pull quay.io/ansible/creator-ee:latest
podman tag  quay.io/ansible/creator-ee:latest localhost:8080/demo/network-ee:dev
podman push --tls-verify=false localhost:8080/demo/network-ee:dev
```

That is enough to see discovery working. The image has no content manifest, so its
contents report as **unknown** — correct, and the state most images in the field are in.
For the full inventory, see
[building-an-execution-environment.md](building-an-execution-environment.md).

## Check what is there

Quay's `/v2/` API accepts **bearer tokens only**, so `curl -u` fails with
*"Invalid bearer token format"* even when your credentials are right. Nothing is wrong —
you have to do the token exchange:

```bash
TOKEN=$(curl -s -u "$CONTENT_REGISTRY_USERNAME:$CONTENT_REGISTRY_PASSWORD" \
  "http://127.0.0.1:8080/v2/auth?service=localhost:8080&scope=repository:demo/network-ee:pull" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8080/v2/demo/network-ee/tags/list
```

The clients in this repository do that exchange for you; only raw `curl` needs it by
hand. `node tools/trace-auth.mjs` prints the whole handshake with secrets redacted.

## Stop it

```bash
cd dev/quay && podman compose down        # add -v to delete the images too
```

## Other registries

Worth reaching for when you change discovery, because the capability differences are the
thing the design has to survive:

```bash
# OCI 1.1: native referrers API. The target state, and more permissive than Quay.
podman run -d -p 5000:5000 --name zot ghcr.io/project-zot/zot-linux-amd64:latest

# Minimal: no referrers API, no _catalog, no auth. The honest worst case.
podman run -d -p 5001:5000 --name registry2 docker.io/library/registry:2
```

Content must list and render identically against all three. Point `CONTENT_REGISTRY_URL`
at each in turn and set `auth: { type: anonymous }` in `app-config.yaml` for the two that
need no credentials.
