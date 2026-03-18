#!/bin/sh
DATA_DIR="${DATA_DIR:-/data}"
DB_FILE="$DATA_DIR/ratings.db"
BACKUP_DIR="$DATA_DIR/backups"

# Fix /data ownership (may be owned by root from earlier deploys)
chown -R appuser:appuser "$DATA_DIR" 2>/dev/null || true

# --- Local backup before server start (if DB exists) ---
if [ -f "$DB_FILE" ]; then
  mkdir -p "$BACKUP_DIR"
  STAMP=$(date +%Y%m%d-%H%M%S)
  cp "$DB_FILE" "$BACKUP_DIR/ratings-${STAMP}.db"
  [ -f "${DB_FILE}-wal" ] && cp "${DB_FILE}-wal" "$BACKUP_DIR/ratings-${STAMP}.db-wal"
  [ -f "${DB_FILE}-shm" ] && cp "${DB_FILE}-shm" "$BACKUP_DIR/ratings-${STAMP}.db-shm"
  echo "[BACKUP] Local: ratings-${STAMP}.db"

  # Keep last 5 local backups only
  cd "$BACKUP_DIR"
  ls -t ratings-????????-??????.db 2>/dev/null | tail -n +6 | while read -r old; do
    rm -f "$old" "${old}-wal" "${old}-shm"
  done
  cd /app
fi

# --- Restore from R2 if no local DB ---
if [ ! -f "$DB_FILE" ]; then
  echo "[LITESTREAM] Restoring from R2..."
  litestream restore -config /app/litestream.yml "$DB_FILE" 2>/dev/null \
    || echo "[LITESTREAM] No replica found (first deploy?)"
fi

# Fix ownership again (after restore/backup may have created files as root)
chown -R appuser:appuser "$DATA_DIR" 2>/dev/null || true

# --- Start server with continuous Litestream replication ---
exec litestream replicate -exec "su -s /bin/sh appuser -c 'node --env-file-if-exists=.env dist-server/server/index.js'" -config /app/litestream.yml
