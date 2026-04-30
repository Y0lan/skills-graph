#!/bin/sh
set -eu

exec node --env-file-if-exists=.env dist-server/server/index.js
