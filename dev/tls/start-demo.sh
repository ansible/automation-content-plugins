#!/usr/bin/env bash
# Bring up everything the AAP-96688 TLS demo needs, in order.
#
#   1. demo certificates (trusted CA + untrusted CA)
#   2. local Quay, seeded with demo/network-ee
#   3. TLS-terminating proxy: :8443 trusted, :8444 untrusted
#   4. the trusted CA, staged where the portal container can read it
#   5. fresh content-plugin tarballs (FORCE_EXPORT=1 — no stale artifacts)
#   6. the portal itself, tarball mode (the only mode that loads these plugins)
#
# Then run the demo:  node tools/demo-registry-tls.mjs
# See dev/tls/README.md for the full runbook.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"            # dev/tls
REPO="$(cd "$HERE/../.." && pwd)"                # automation-content-plugins
PORTAL_REPO="${PORTAL_REPO:-$HOME/Projects/automation-portal-local}"
RHDH_CONFIGS="$PORTAL_REPO/rhdh-local/configs"

# 1. Certificates ------------------------------------------------------------
if [ ! -f "$HERE/certs/demo-trusted-server.pem" ]; then
  echo "=== Generating demo certificates"
  python3 "$HERE/generate-certs.py"
fi

# 2. Quay --------------------------------------------------------------------
echo "=== Starting Quay"
(cd "$REPO" && ./dev/quay/setup.sh)

set -a; . "$REPO/dev/quay/.env"; set +a
TOKEN=$(curl -s -u "$QUAY_USERNAME:$QUAY_PASSWORD" \
  "http://127.0.0.1:8080/v2/auth?service=localhost:8080&scope=repository:demo/network-ee:pull" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')
TAGS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8080/v2/demo/network-ee/tags/list || true)
if ! echo "$TAGS" | grep -q '"dev"'; then
  echo "WARNING: demo/network-ee:dev not found in Quay — the demo registries will"
  echo "sync successfully but discover nothing. Seed it with:"
  echo
  echo "  podman login --tls-verify=false -u \"\$QUAY_USERNAME\" -p \"\$QUAY_PASSWORD\" localhost:8080"
  echo "  podman pull quay.io/ansible/creator-ee:latest"
  echo "  podman tag  quay.io/ansible/creator-ee:latest localhost:8080/demo/network-ee:dev"
  echo "  podman push --tls-verify=false localhost:8080/demo/network-ee:dev"
  echo
  echo "(credentials are in dev/quay/.env)"
else
  echo "=== Quay seeded: demo/network-ee:dev present"
fi

# 3. TLS proxy ---------------------------------------------------------------
if [ -f "$HERE/proxy.pid" ] && kill -0 "$(cat "$HERE/proxy.pid")" 2>/dev/null; then
  echo "=== TLS proxy already running (pid $(cat "$HERE/proxy.pid"))"
else
  echo "=== Starting TLS proxy"
  nohup node "$HERE/tls-proxy.mjs" > "$HERE/proxy.log" 2>&1 &
  echo $! > "$HERE/proxy.pid"
  sleep 1
fi

# 4. Stage the trusted CA where the portal container reads it ----------------
mkdir -p "$RHDH_CONFIGS/automation-content"
cp "$HERE/certs/demo-ca.pem" "$RHDH_CONFIGS/automation-content/ca.pem"
echo "=== Staged CA: $RHDH_CONFIGS/automation-content/ca.pem"

# 5. Fresh content plugin tarballs -------------------------------------------
echo "=== Building content plugin tarballs (forced export)"
make -C "$PORTAL_REPO" build-content-plugins \
  CONTENT_PLUGIN_REPO="$REPO" CONTENT_PLUGINS_ENABLED=1 FORCE_EXPORT=1

# 6. Portal ------------------------------------------------------------------
echo "=== Starting the portal (tarball mode)"
make -C "$PORTAL_REPO" start SKIP_BUILD=1 PORTAL_ONLY=1

echo
echo "Everything is up. Run the demo:"
echo "  node $REPO/tools/demo-registry-tls.mjs"
echo "Browser: http://localhost:7007/automation-content"
