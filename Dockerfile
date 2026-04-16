FROM litestream/litestream:0.3.13 AS litestream

# ── Build stage ──────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# ── Production stage ─────────────────────────────────────────────
FROM node:22-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --legacy-peer-deps --omit=dev

# Copy build artifacts
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# Copy runtime config files
COPY skill-catalog-full.json ./
COPY litestream.yml ./litestream.yml
COPY entrypoint.sh /entrypoint.sh

# Copy litestream binary
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream

# Create non-root user and set permissions
RUN useradd -r -u 999 -s /bin/sh appuser \
    && chown -R appuser:appuser /app \
    && mkdir -p /data && chown appuser:appuser /data \
    && chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
