# TLS verification demo (AAP-96688)

Everything needed to show — and keep proving — that registry connections verify
TLS by default, in the real Automation Portal, with the real packaged plugins.

The demo relies on one local Quay reachable through three doors, all configured
side by side in the portal, so the whole story is visible without restarting
anything mid-demo:

| Registry (portal config) | Door | What must happen |
|---|---|---|
| `local-quay` | `http://host.containers.internal:8080` | Syncs only because of the explicit `insecure: true` opt-out; a startup warning names it |
| `local-quay-tls` | `https://host.containers.internal:8443` | Verified HTTPS against a CA bundle (`caFile`); syncs, discovery works |
| `local-quay-untrusted` | `https://host.containers.internal:8444` | No CA, no opt-out — sync **fails**, naming the certificate, and the index keeps what it had |

Both TLS doors are the same proxy over the same Quay; only the certificate
differs. That is the point: the only variable in the demo is trust.

## Bring it up

```bash
./dev/tls/start-demo.sh
```

which, in order:

1. generates the demo certificates (trusted CA, untrusted CA — python `cryptography`, no openssl needed);
2. starts the local Quay (`dev/quay`) and checks that `demo/network-ee:dev` is seeded — it warns with the exact seed commands if not;
3. starts the TLS proxy (`:8443` trusted, `:8444` untrusted, both bound on `0.0.0.0` so containers reach them);
4. stages the trusted CA where the portal container reads it (`rhdh-local/configs/automation-content/ca.pem`);
5. builds fresh content-plugin tarballs (`FORCE_EXPORT=1`, so no stale artifact can sneak in);
6. starts the portal in tarball mode (`make start SKIP_BUILD=1 PORTAL_ONLY=1`) — the only mode that installs these plugins.

Prerequisites: podman with its socket (`systemctl --user start podman.socket`),
and the portal-local checkout at `~/Projects/automation-portal-local` (override
with `PORTAL_REPO=…`).

### When containers cannot reach host.containers.internal

Rootless podman's host-gateway (`169.254.1.2`) can go silent — containers get
connect timeouts to every host port, on existing *and* freshly created
networks (observed after network recreation on firewalld hosts; recreating
the stack does not heal it). Symptom: all three registries fail with
`Connect Timeout` while the same URLs work from the host.

Fallback: point the portal at the host's LAN IP. The generated certs already
include it as a SAN (`generate-certs.py` auto-detects it), and both the proxy
and Quay bind `0.0.0.0`, so only the portal-local `.env` needs updating:

```bash
HOST_IP=$(hostname -I | awk '{print $1}')
# then set in ~/Projects/automation-portal-local/.env:
#   CONTENT_REGISTRY_URL=http://$HOST_IP:8080
#   CONTENT_REGISTRY_TLS_URL=https://$HOST_IP:8443
#   CONTENT_REGISTRY_UNTRUSTED_URL=https://$HOST_IP:8444
# and restart: make start SKIP_BUILD=1 PORTAL_ONLY=1
```

The IP is DHCP-assigned, so re-check it when the network changes. The
registry URLs in `.env` always win over the `host.containers.internal`
defaults baked into `app-config.portal.yaml`.

## Run the demo

Terminal — assertion-based, expected vs actual, exit non-zero on any surprise:

```bash
node tools/demo-registry-tls.mjs
```

Browser — the same results as the portal renders them:

```
http://localhost:7007/automation-content
```

A good five-minute shape:

1. `node tools/demo-registry-tls.mjs` — case 1: **verified HTTPS syncs**. Point
   at the browser: the EE from `local-quay-tls`, contents known.
2. Case 3 in the terminal: **untrusted certificate refused** — read the error
   out loud, it names the certificate. In the browser the registry shows the
   failed sync; the already-discovered content is still there.
3. Case 2: **plain HTTP only through the opt-out**. Show the startup warning in
   the portal logs (`podman logs rhdh | grep insecure`).
4. Re-run the runner — same 11/11, because the result is a property of the
   policy, not of the order of operations.

## Evidence trail

- Portal logs name the opt-out at startup and the certificate at failure:
  `podman logs rhdh`.
- The catalog provider emits entities from the verified registry
  (`local-quay-tls emitted 3 entities`) and records the untrusted one as failed.
- The runner output is the artifact to paste into the ticket.

## Teardown

```bash
make -C ~/Projects/automation-portal-local stop
(cd dev/quay && podman compose down)
kill "$(cat dev/tls/proxy.pid)"
```

The certificates and the CA staged into `rhdh-local/configs/` persist; they are
regenerated only when missing. Deleting `dev/tls/certs/` starts the story fresh.

## What this is not

The untrusted door is not an attack simulation — the certificate is simply not
signed by anything the portal trusts. The point is the policy's behavior: which
connections are refused, what the refusal says, and what survives it.
