#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'MSG'
scripts/gcp-setup.sh is retired.

Production infrastructure now lives in cloud-sinapse-infra and is managed by
Terraform. Do not use this legacy bootstrap script for Skill Radar.
MSG

exit 1
