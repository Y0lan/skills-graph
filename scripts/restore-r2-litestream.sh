#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required" >&2
    exit 1
  fi
}

require_cmd litestream
require_cmd sqlite3
require_env R2_ENDPOINT
require_env AWS_ACCESS_KEY_ID
require_env AWS_SECRET_ACCESS_KEY

R2_BUCKET="${R2_BUCKET:-radar}"
R2_REPLICA_PATH="${R2_REPLICA_PATH:-ratings}"
RESTORE_PATH="${RESTORE_PATH:-./tmp/r2-ratings.db}"

endpoint="${R2_ENDPOINT%/}"
endpoint="${endpoint%/${R2_BUCKET}}"

if [[ -e "$RESTORE_PATH" ]]; then
  echo "Refusing to overwrite existing restore path: $RESTORE_PATH" >&2
  exit 1
fi

mkdir -p "$(dirname "$RESTORE_PATH")"
config="$(mktemp)"
trap 'rm -f "$config"' EXIT

echo "Restoring historical Skill Radar team-evaluation SQLite replica from Cloudflare R2."
echo "This restore is an input to import-team-evaluations-from-sqlite.ts only; it is not the full current production data migration path."

cat >"$config" <<YAML
access-key-id: \${AWS_ACCESS_KEY_ID}
secret-access-key: \${AWS_SECRET_ACCESS_KEY}
dbs:
  - path: ${RESTORE_PATH}
    replicas:
      - type: s3
        bucket: ${R2_BUCKET}
        path: ${R2_REPLICA_PATH}
        endpoint: ${endpoint}
        region: auto
YAML

litestream restore -config "$config" "$RESTORE_PATH"

integrity="$(sqlite3 "$RESTORE_PATH" 'PRAGMA integrity_check;')"
if [[ "$integrity" != "ok" ]]; then
  echo "SQLite integrity_check failed: $integrity" >&2
  exit 1
fi

evaluations_count="$(sqlite3 "$RESTORE_PATH" "SELECT COUNT(*) FROM evaluations;")"
echo "Restored $RESTORE_PATH"
echo "SQLite integrity_check: ok"
echo "evaluations rows: $evaluations_count"
