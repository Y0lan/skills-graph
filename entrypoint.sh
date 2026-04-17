#!/bin/sh
# Entrypoint for skill-radar with SQLite + Litestream persistence.
#
# Startup sequence:
#   1. If LITESTREAM_FORCE_RESTORE=true: wipe local state and restore from GCS.
#   2. If DB exists AND passes integrity check: take atomic backup, continue.
#   3. If DB exists BUT integrity check fails: move corrupt DB aside, restore from GCS.
#   4. If DB doesn't exist: restore from GCS.
#   5. After restore: verify the restored DB passes integrity check.
set -e

DATA_DIR="${DATA_DIR:-/data}"
DB_FILE="$DATA_DIR/ratings.db"
BACKUP_DIR="$DATA_DIR/backups"
# Retain last N backups; cap to limit PVC fill (Codex finding: 5 × growing DB → PVC exhaustion).
BACKUP_RETENTION="${BACKUP_RETENTION:-2}"

export DB_PATH="$DB_FILE"

# --- Force-restore escape hatch (fixes sticky-bad-state risk) ---
# Set LITESTREAM_FORCE_RESTORE=true on the next deploy to wipe local state
# and pull fresh from GCS. Use when the PVC has corrupt or stale data.
if [ "${LITESTREAM_FORCE_RESTORE:-}" = "true" ]; then
  echo "[ENTRYPOINT] LITESTREAM_FORCE_RESTORE=true — wiping local DB state"
  rm -f "$DB_FILE" "${DB_FILE}-wal" "${DB_FILE}-shm"
  rm -rf "$DATA_DIR/.ratings.db-litestream"
fi

mkdir -p "$BACKUP_DIR"

# --- Integrity check + atomic backup of existing DB ---
if [ -f "$DB_FILE" ]; then
  if node /app/scripts/db-ops.mjs check; then
    # DB healthy. Take atomic backup via SQLite's online backup API.
    STAMP=$(date +%Y%m%d-%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/ratings-${STAMP}.db"
    if node /app/scripts/db-ops.mjs backup "$BACKUP_FILE"; then
      echo "[BACKUP] Local atomic backup: ratings-${STAMP}.db"
    else
      echo "[BACKUP] Atomic backup failed — continuing startup, GCS replica is primary"
    fi

    # Retain only BACKUP_RETENTION most recent backups.
    # SQLite .backup produces self-contained files (no separate -wal/-shm).
    (cd "$BACKUP_DIR" && ls -t ratings-????????-??????.db 2>/dev/null | tail -n "+$((BACKUP_RETENTION + 1))" | while read -r old; do
      rm -f "$old"
    done) || true
  else
    # DB is corrupt. Move it aside (for forensics) and fall through to GCS restore.
    echo "[INTEGRITY] DB corrupted — moving aside and restoring from GCS"
    mv "$DB_FILE" "${DB_FILE}.corrupt.$(date +%s)" 2>/dev/null || rm -f "$DB_FILE"
    rm -f "${DB_FILE}-wal" "${DB_FILE}-shm"
  fi
fi

# --- Restore from GCS if no local DB (or corrupted one was moved aside) ---
if [ ! -f "$DB_FILE" ]; then
  echo "[LITESTREAM] Restoring from GCS..."
  if litestream restore -config /app/litestream.yml "$DB_FILE"; then
    echo "[LITESTREAM] Restore successful"
    # Verify restored DB is healthy — if this fails, we can't self-heal further.
    if ! node /app/scripts/db-ops.mjs check; then
      echo "[LITESTREAM] FATAL: restored DB failed integrity check. Operator intervention required." >&2
      exit 1
    fi
  else
    echo "[LITESTREAM] No replica found or restore failed (first deploy?)"
  fi
fi

# --- Start server with continuous Litestream replication ---
exec litestream replicate -exec "node --env-file-if-exists=.env dist-server/server/index.js" -config /app/litestream.yml
