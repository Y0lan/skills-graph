# syntax=docker/dockerfile:1.7

# ── Stage 1: build ────────────────────────────────────────────────────
# Compiles TypeScript + Vite. Dev deps stay in this stage only.
# BuildKit cache mounts persist npm + vite caches between CI runs.
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --legacy-peer-deps

COPY . .
RUN --mount=type=cache,target=/app/node_modules/.vite,sharing=locked \
    --mount=type=cache,target=/app/node_modules/.cache,sharing=locked \
    npm run build

# Drop dev dependencies — prod image only needs runtime deps.
# Keep the npm cache mount so this stage reuses downloads.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm prune --omit=dev --legacy-peer-deps

# ── Stage 2: runtime ──────────────────────────────────────────────────
# Minimal image: only the built artifacts, prod node_modules, and the
# runtime-read assets (server/prompts, public, skill-catalog).
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN useradd -r -u 999 -s /bin/sh appuser \
    && mkdir -p /data \
    && chown appuser:appuser /data

COPY --from=builder --chown=appuser:appuser /app/package*.json ./
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/dist-server ./dist-server
# Runtime-read assets (cwd-relative in server/lib/*.ts + entrypoint.sh):
#  - server/db/postgres-init.sql → read by db.ts during Postgres bootstrap
#  - server/prompts/email-generation.md → read by email-ai.ts
#  - public/email-logo-sinapse.png → read by brand.ts (email CID attachment)
#  - skill-catalog-full.json → read by seed-catalog.ts (npm run seed)
COPY --from=builder --chown=appuser:appuser /app/server/db ./server/db
COPY --from=builder --chown=appuser:appuser /app/server/prompts ./server/prompts
COPY --from=builder --chown=appuser:appuser /app/public ./public
COPY --from=builder --chown=appuser:appuser /app/skill-catalog-full.json ./skill-catalog-full.json
# aggregates.ts resolves `path.join(__dirname, '..', 'data', 'targets.json')` —
# compiled __dirname is /app/dist-server/server/lib, so the file must be at
# /app/dist-server/server/data/targets.json. tsc does not emit JSON; copy it.
COPY --from=builder --chown=appuser:appuser /app/server/data/targets.json ./dist-server/server/data/targets.json

COPY --chmod=755 entrypoint.sh /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
# NOTE: Cloud Run executes this image without a declared USER so local smoke
# tests can run the same image shape. Application data is stored in Cloud SQL
# and GCS, not in the container filesystem.
ENTRYPOINT ["/entrypoint.sh"]
