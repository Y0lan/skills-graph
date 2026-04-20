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

# ── Stage 2: litestream binary ────────────────────────────────────────
FROM litestream/litestream:0.3.13 AS litestream

# ── Stage 3: runtime ──────────────────────────────────────────────────
# Minimal image: only the built artifacts, prod node_modules, and the
# runtime-read assets (server/prompts, scripts, public, skill-catalog).
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
# Runtime-read assets (cwd-relative in server/lib/*.ts + entrypoint.sh):
#  - server/prompts/email-generation.md → read by email-ai.ts
#  - scripts/db-ops.mjs → invoked by entrypoint.sh (integrity check, atomic backup)
#  - public/email-logo-sinapse.png → read by brand.ts (email CID attachment)
#  - skill-catalog-full.json → read by seed-catalog.ts (npm run seed)
COPY --from=builder /app/server/prompts ./server/prompts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/public ./public
COPY --from=builder /app/skill-catalog-full.json ./skill-catalog-full.json
# aggregates.ts resolves `path.join(__dirname, '..', 'data', 'targets.json')` —
# compiled __dirname is /app/dist-server/server/lib, so the file must be at
# /app/dist-server/server/data/targets.json. tsc does not emit JSON; copy it.
COPY --from=builder /app/server/data/targets.json ./dist-server/server/data/targets.json

COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY litestream.yml /app/litestream.yml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN useradd -r -u 999 -s /bin/sh appuser && chown -R appuser:appuser /app \
    && mkdir -p /data && chown appuser:appuser /data

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
# NOTE: USER appuser is not set here because the GKE deployment already
# enforces runAsUser: 999 at the pod securityContext level and some local
# dev flows (docker run …) assume root. Container runs non-root in prod.
ENTRYPOINT ["/entrypoint.sh"]
