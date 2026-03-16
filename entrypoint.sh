#!/bin/sh
# Fix /data ownership (may be owned by root from earlier deploys)
chown -R appuser:appuser /data 2>/dev/null || true
exec su -s /bin/sh appuser -c "node --env-file-if-exists=.env dist-server/server/index.js"
