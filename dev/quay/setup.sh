#!/usr/bin/env bash
# Start a local Quay and create its first user.
#
# Secrets are generated here and written to dev/quay/.env, which is gitignored. Nothing
# in this directory that contains a secret is ever committed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ENVF="$HERE/.env"
CONF="$HERE/config"
COMPOSE="${COMPOSE:-podman compose}"

command -v podman >/dev/null || { echo "ERROR: podman is required"; exit 1; }

# 1. Secrets, generated once and kept locally.
if [ ! -f "$ENVF" ]; then
  umask 077
  cat > "$ENVF" <<EOF
QUAY_USERNAME=demo
QUAY_PASSWORD=$(openssl rand -hex 12)
QUAY_NAMESPACE=demo
QUAY_SECRET_KEY=$(openssl rand -hex 32)
QUAY_DATABASE_SECRET_KEY=$(openssl rand -hex 32)
CONTENT_REGISTRY_URL=http://127.0.0.1:8080
EOF
  echo "Generated $ENVF — it holds your local Quay password."
fi

set -a; . "$ENVF"; set +a

# 2. Quay config. FEATURE_USER_INITIALIZE lets the first user be created over the API,
#    which is what makes this scriptable rather than a click-through.
umask 077
mkdir -p "$CONF"
cat > "$CONF/config.yaml" <<EOF
AUTHENTICATION_TYPE: Database
BUILDLOGS_REDIS:
  host: redis
  port: 6379
DATABASE_SECRET_KEY: '${QUAY_DATABASE_SECRET_KEY}'
DB_URI: postgresql://quay:quay@quay-db/quay
DEFAULT_TAG_EXPIRATION: 2w
DISTRIBUTED_STORAGE_CONFIG:
  default:
    - LocalStorage
    - storage_path: /datastorage/registry
DISTRIBUTED_STORAGE_DEFAULT_LOCATIONS: []
DISTRIBUTED_STORAGE_PREFERENCE:
  - default
FEATURE_ANONYMOUS_ACCESS: true
FEATURE_APP_SPECIFIC_TOKENS: true
FEATURE_DIRECT_LOGIN: true
FEATURE_GENERAL_OCI_SUPPORT: true
FEATURE_MAILING: false
FEATURE_SECURITY_SCANNER: false
FEATURE_USER_CREATION: true
FEATURE_USER_INITIALIZE: true
PREFERRED_URL_SCHEME: http
SECRET_KEY: '${QUAY_SECRET_KEY}'
SERVER_HOSTNAME: localhost:8080
SETUP_COMPLETE: true
USER_EVENTS_REDIS:
  host: redis
  port: 6379
EOF

# 3. Up.
echo "Starting Quay…"
(cd "$HERE" && $COMPOSE up -d)

echo -n "Waiting for Quay on :8080 "
for _ in $(seq 1 90); do
  if curl -sf http://127.0.0.1:8080/health/instance >/dev/null 2>&1; then
    echo " ready"; break
  fi
  echo -n "."; sleep 2
done
curl -sf http://127.0.0.1:8080/health/instance >/dev/null || {
  echo; echo "Quay did not become ready. Logs: (cd $HERE && $COMPOSE logs quay)"; exit 1; }

# 4. First user. Idempotent: 400/409 means it already exists.
code=$(curl -s -o /tmp/acp-quay-init.json -w '%{http_code}' \
  -X POST http://127.0.0.1:8080/api/v1/user/initialize \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${QUAY_USERNAME}\",\"password\":\"${QUAY_PASSWORD}\",\"email\":\"${QUAY_USERNAME}@example.invalid\",\"access_token\":true}")

case "$code" in
  200|201) echo "Created user '${QUAY_USERNAME}'." ;;
  400|409) echo "User '${QUAY_USERNAME}' already exists." ;;
  *)       echo "Unexpected response initializing user: HTTP $code"; cat /tmp/acp-quay-init.json; exit 1 ;;
esac
rm -f /tmp/acp-quay-init.json

cat <<EOF

Quay is up: http://127.0.0.1:8080   (user ${QUAY_USERNAME})

Export credentials for the backend and the publish tools:

  set -a; . dev/quay/.env; set +a
  export CONTENT_REGISTRY_USERNAME="\$QUAY_USERNAME"
  export CONTENT_REGISTRY_PASSWORD="\$QUAY_PASSWORD"

Stop it with:  (cd dev/quay && $COMPOSE down)        # add -v to delete the data
EOF
