# Shared maintenance edge proxy (cluster-wide)

**Status:** 🚫 **ABANDONED** (2026-04-17, after 2 Codex review rounds)
**Branch:** dev
**Owner:** Yolan

## Decision: not building this

After eng review + two rounds of Codex adversarial challenge, the plan kept
surfacing new issues at every simplification pass. The root finding from
Codex round 1 (#9: "overbuilt for one SQLite app's Recreate gap") was
correct and couldn't be refuted on value grounds.

**What we investigated:**
- Shared nginx edge proxy in `gateway` namespace.
- Cross-namespace ReferenceGrant machinery.
- Content negotiation for JSON vs HTML 503s.
- Auto-reload sidecar patterns.
- Trust-proxy implications for the app.

**Why we're stopping:**
- The core value — a branded "mise à jour" page during 20-30s `Recreate`
  deploys — is narrow. Real users rarely hit this window. Bots can handle 502.
- The blast radius is wide: every public app routes through a new shared
  failure domain, app-side `trust proxy` counts must change in lockstep with
  HTTPRoute changes, content-type semantics require app-aware rules.
- Each simplification pass revealed new surfaces (namespace drift vs live
  cluster, Accept-header edge cases, XFF chain semantics, /health path
  variants).
- The underlying problem — deploy downtime — has a cleaner fix: resolve the
  SQLite single-writer blocker and move to `RollingUpdate`. That's the TODO
  already logged; this plan was attempting to bypass it.

**What we learned (worth keeping):**
- Trust-proxy count needs to match actual hop count. Current: 1 (Gateway → app).
  If we ever add an edge, ship the count change AFTER the edge is in the
  request path, not before. Ideally driven by env var so code doesn't lock
  the topology.
- `server/index.ts:97` has both `/health` and `/health/backup`. Any future
  edge proxy must treat `/health*` as a prefix.
- Namespace drift exists: k8s manifests target `public-webapp` and
  `skill-radar-dev`, but live cluster runs everything in `apps`. That drift
  is tracked in TODOS.md under "Dev/prod share GKE namespace" and should be
  resolved before any infra work that assumes one or the other.
- Codex adversarial review caught 15+ real issues across 2 passes that
  multi-section eng review did not. For infra work specifically, Codex
  adds real value — its web-search and pattern-recognition on config
  footguns (nginx scoping, K8s subPath semantics, ReferenceGrant spec)
  was strong.

## Follow-up action

Instead of this plan, open a new investigation on the actual RollingUpdate
blocker: can skill-radar move off SQLite single-writer? Options logged
separately, not here:
- Leader election with Litestream read replicas.
- Move to Postgres.
- Single-replica PodDisruptionBudget + faster readiness probes.

---

## Original plan content (preserved below for decision history)

**Status when abandoned:** v3 (post-Codex round 1, pre-Codex round 2 findings)

## Problem

When any public app in the `cloud-sinapse` GKE cluster is restarting, crashing,
or deploying with the `Recreate` strategy, users see a generic unbranded 502 /
503 from the GKE Gateway. Both `drupal` and `skill-radar` exhibit this.
There's no "update in progress, come back in a few minutes" branded page.

## Approach — v3 (simpler)

A shared **edge reverse proxy** deployment: one nginx Service between the GKE
Gateway and all public app Services. Host-based routing. When any upstream
returns 5xx, it serves a branded maintenance page for browsers and a proper
JSON 503 for API clients.

```
                 [GKE Gateway 34.50.155.166]
                          │
               ┌──────────▼─────────────┐
               │ sinapse-edge (nginx)   │
               │ 2 replicas + PDB       │
               │ namespace: gateway     │
               └──────┬──────────┬──────┘
                      │          │
              sinapse.nc    competences.sinapse.nc
                      │          │
                      ▼          ▼
                 ┌────────┐  ┌──────────────┐
                 │ drupal │  │ skill-radar  │
                 │ (apps) │  │ (apps)       │
                 └────────┘  └──────────────┘
                      │          │
                      └────┬─────┘
                           ▼ (on upstream 5xx)
                  [browser: /maintenance.html]
                  [api:     JSON 503 Retry-After:30]
```

## What changed in v3 (Codex findings addressed)

| # | Codex finding | v3 fix |
|---|---|---|
| 1 | ConfigMap subPath doesn't auto-reload | **Dropped** configmap-reload sidecar. Document "edit ConfigMap → `kubectl rollout restart`" workflow. One-liner, predictable. |
| 2 | `location @maintenance` inside `proxy-common.conf` = syntax error (location nested in location) | **Flattened:** each server block inlines its own `location = /__maintenance` (internal). Drop the clever include. Two server blocks × ~8 duplicated lines is fine. |
| 3 | CI test `/etc/hosts` stub doesn't match `resolver` usage | **Dropped** the `resolver` directive. Use Service DNS directly in `proxy_pass`. CI uses Docker `--add-host` to inject the test upstreams. |
| 4 | ReferenceGrant spec is vague; actual manifests use `public-webapp` and `skill-radar-dev` namespaces | **Spec'd explicitly** (see Gateway API section below). One ReferenceGrant per source namespace that references the `sinapse-edge` Service in `gateway`. |
| 5 | Breaks rate limiting: `server/index.ts:33` has `trust proxy: 1`; adding nginx = 2 hops | **App change required:** update `server/index.ts` to `trust proxy: 2`. This IS in-scope, not infra-only. |
| 6 | Maintenance page masks real API 503s (destroys JSON semantics) | **Content negotiation:** `if ($http_accept ~ "application/json")` returns JSON 503 with `retry_after`. Only browsers (text/html) get the branded HTML page. |
| 7 | `reload-receiver` sidecar installs socat at runtime, `pkill -HUP nginx` is wrong | **Removed entirely.** No reload automation in v1. |
| 8 | `resolver valid=30s` is cargo cult — Service DNS is stable | **Removed.** Plain Service DNS resolution, one-time at nginx startup. kube-proxy handles endpoint changes transparently. |
| 9 | Overbuilt for one SQLite app's Recreate gap | **Scope acknowledged:** this IS committing to the edge as a permanent platform component, not a workaround. Documented as such in "Why this exists" below. Future apps will onboard through the same path. |

## Why this exists (strategic position)

Codex was right to challenge whether this is worth the blast radius. The answer:
we're committing to `sinapse-edge` as a permanent platform component for all
public-facing apps in `cloud-sinapse`. Not a workaround for one app.

What we get by committing:
- Any new public app onboards through 5 lines of nginx config + a Service.
  No per-app sidecar, no per-app error page logic.
- Shared branding controlled in one place.
- Future edge features (rate limiting, cache, WAF, header rewrites) happen
  once, apply everywhere.

What we accept:
- A new shared failure domain. Mitigated by 2 replicas + PDB; nginx is stable
  tech with decades of production evidence.
- One extra hop (~0.5ms intra-cluster).
- Config changes require a rollout restart (manual, documented).

## Scope

**In scope (cloud-sinapse-infra repo)**
- `k8s/shared/edge-proxy/` directory with:
  - `namespace.yaml` — ensures `gateway` namespace exists.
  - `deployment.yaml` — nginx:1.27.3-alpine (pinned), 2 replicas,
    `progressDeadlineSeconds: 120`, probes on `/edge-health`.
  - `service.yaml` — ClusterIP on :80.
  - `configmap-nginx.yaml` — single ConfigMap with `nginx.conf` +
    `maintenance.html` keys.
  - `pdb.yaml` — minAvailable: 1.
  - `referencegrant-public-webapp.yaml` — allow HTTPRoutes in `public-webapp`
    to reference the `sinapse-edge` Service.
  - `referencegrant-skill-radar-dev.yaml` — same for dev namespace.
  - `referencegrant-apps.yaml` — same for live `apps` namespace (current state
    is that both live apps run there).
- Update HTTPRoutes in whichever namespaces are active to target
  `sinapse-edge` in `gateway`.

**In scope (my-project repo — THIS change)**
- Update `server/index.ts` to set `app.set('trust proxy', 2)` (was 1).
- Update any tests that assert on `req.ip` behavior with a single proxy.
- Add unit test covering the 2-hop case for rate limiting.
- Mark RollingUpdate TODO as deferred-not-blocking (the edge page makes
  Recreate acceptable; RollingUpdate can still be pursued separately).

**NOT in scope (deferred to follow-ups)**
- Per-app sidecars (explicitly replaced by this edge).
- Postgres / leader election for skill-radar.
- Edge-level prometheus metrics.
- Rate limiting at the edge (app handles its own for now).
- Per-host custom maintenance messages.
- Intra-cluster TLS (edge → app).
- Auto-reload of nginx on ConfigMap change (manual rollout restart for now).

## Implementation

### nginx.conf (ConfigMap key `nginx.conf`)

```nginx
worker_processes auto;
events { worker_connections 1024; }

http {
  access_log /dev/stdout combined;
  error_log  /dev/stderr warn;

  proxy_connect_timeout 3s;
  proxy_read_timeout    30s;
  proxy_send_timeout    30s;

  # Drupal — sinapse.nc
  server {
    listen 80;
    server_name sinapse.nc www.sinapse.nc;

    # Edge self-health (probes hit this).
    location = /edge-health { access_log off; return 200 "ok\n"; }

    # App-level /health passthrough WITHOUT maintenance fallback.
    # External monitors see the real upstream status.
    location = /health {
      proxy_pass http://drupal.apps.svc.cluster.local:80;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
      proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
      proxy_pass http://drupal.apps.svc.cluster.local:80;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_intercept_errors on;
      error_page 502 503 504 = @maintenance;
    }

    # Server-scoped maintenance handler with content negotiation.
    location @maintenance {
      add_header Retry-After 30 always;
      add_header Cache-Control "no-store" always;
      # API clients get proper JSON 503.
      if ($http_accept ~* "application/json") {
        add_header Content-Type "application/json" always;
        return 503 '{"error":"service_unavailable","retry_after":30,"message":"Le service est en mise à jour."}';
      }
      # Browsers get the branded HTML.
      default_type text/html;
      root /usr/share/nginx/maintenance;
      try_files /maintenance.html =503;
    }
  }

  # Skill Radar — competences.sinapse.nc + competences.sinapse.nc
  server {
    listen 80;
    server_name competences.sinapse.nc competences.sinapse.nc;

    location = /edge-health { access_log off; return 200 "ok\n"; }

    location = /health {
      proxy_pass http://skill-radar.apps.svc.cluster.local:80;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
      proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
      proxy_pass http://skill-radar.apps.svc.cluster.local:80;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_intercept_errors on;
      error_page 502 503 504 = @maintenance;
    }

    location @maintenance {
      add_header Retry-After 30 always;
      add_header Cache-Control "no-store" always;
      if ($http_accept ~* "application/json") {
        add_header Content-Type "application/json" always;
        return 503 '{"error":"service_unavailable","retry_after":30,"message":"Le service est en mise à jour."}';
      }
      default_type text/html;
      root /usr/share/nginx/maintenance;
      try_files /maintenance.html =503;
    }
  }

  # Catch-all: unknown Host headers get a clean 404 (no branded page needed).
  server {
    listen 80 default_server;
    server_name _;
    return 404 "Unknown host\n";
  }
}
```

Yes, the two app server blocks have ~8 duplicated lines each. Codex's
"location-inside-location" issue made the clever dedup impossible; accepting
the duplication is the correct trade. 16 lines of duplication vs config that
actually parses.

### maintenance.html (ConfigMap key `maintenance.html`)

Branded SINAPSE page:
- Inlined SVG logo (no external asset dependency)
- `<meta http-equiv="refresh" content="30">`
- Dark-mode-aware via `prefers-color-scheme`
- Copy: "Mise à jour en cours — Nous revenons dans quelques minutes."
- Footer: "GIE SINAPSE · {year}"
- No external fonts, images, or JS (must render even in partial-failure states)

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sinapse-edge
  namespace: gateway
spec:
  replicas: 2
  progressDeadlineSeconds: 120
  selector: { matchLabels: { app: sinapse-edge } }
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  template:
    metadata: { labels: { app: sinapse-edge } }
    spec:
      containers:
      - name: nginx
        image: nginx:1.27.3-alpine  # Pinned version.
        ports: [{ containerPort: 80, name: http }]
        resources:
          requests: { cpu: 50m, memory: 32Mi }
          limits:   { cpu: 200m, memory: 128Mi }
        readinessProbe:
          httpGet:
            path: /edge-health
            port: http
            httpHeaders: [{ name: Host, value: sinapse.nc }]
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /edge-health
            port: http
            httpHeaders: [{ name: Host, value: sinapse.nc }]
          periodSeconds: 30
        volumeMounts:
        - { name: config, mountPath: /etc/nginx/nginx.conf, subPath: nginx.conf }
        - { name: config, mountPath: /usr/share/nginx/maintenance/maintenance.html, subPath: maintenance.html }
      volumes:
      - { name: config, configMap: { name: edge-config } }
```

### PodDisruptionBudget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: sinapse-edge-pdb, namespace: gateway }
spec:
  minAvailable: 1
  selector: { matchLabels: { app: sinapse-edge } }
```

### ReferenceGrant (one per source namespace)

```yaml
# referencegrant-apps.yaml
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-apps-to-edge
  namespace: gateway
spec:
  from:
  - group: gateway.networking.k8s.io
    kind: HTTPRoute
    namespace: apps
  to:
  - group: ""
    kind: Service
    name: sinapse-edge
```

Same template for `public-webapp` and `skill-radar-dev` namespaces (whichever
have active HTTPRoutes at apply time).

### HTTPRoute change

Each app's HTTPRoute changes its `backendRefs` to:

```yaml
backendRefs:
- name: sinapse-edge
  namespace: gateway
  port: 80
```

### Application changes (my-project repo)

**`server/index.ts`** — update trust proxy count:
```diff
-app.set('trust proxy', 1)
+app.set('trust proxy', 2)  // gateway + sinapse-edge = 2 hops
```

**New test** in `server/__tests__/trust-proxy.test.ts`:
- Set `X-Forwarded-For: <real-ip>, <edge-ip>` on a request.
- Assert `req.ip === <real-ip>` (not edge-ip, not gateway-ip).
- Hits any rate-limited endpoint, asserts rate limiting keys off the real client.

### Config reload workflow (documented, manual)

When editing the ConfigMap:
```bash
kubectl -n gateway apply -f k8s/shared/edge-proxy/configmap-nginx.yaml
kubectl -n gateway rollout restart deploy/sinapse-edge
kubectl -n gateway rollout status deploy/sinapse-edge --timeout=120s
```

Document this in the infra repo README under "Edge proxy operations."

## Tests

### Automated CI (cloud-sinapse-infra repo)

`.github/workflows/edge-proxy-e2e.yml`:

1. **Syntax check**: `docker run --rm -v $PWD/rendered:/etc/nginx:ro nginx:1.27.3-alpine nginx -t`
2. **E2E container spin-up**:
   - Two mock upstream nginx containers serving distinct bodies.
   - Edge container with rendered config.
   - `docker run --add-host drupal.apps.svc.cluster.local:<mock-ip-1> --add-host skill-radar.apps.svc.cluster.local:<mock-ip-2> ...`
   - Container DNS overrides mean `proxy_pass` hits the mocks.
3. **Assertions**:
   - `curl -H "Host: sinapse.nc" localhost:8080/` → 200 with "drupal mock" body.
   - `curl -H "Host: competences.sinapse.nc" localhost:8080/` → 200 with "skill-radar mock".
   - `curl -H "Host: random.invalid" localhost:8080/` → 404 (catch-all).
   - Stop drupal mock → `curl -H "Host: sinapse.nc" -H "Accept: text/html" localhost:8080/` → 503 with HTML containing "Mise à jour".
   - Same but `-H "Accept: application/json"` → 503 with JSON `{"error":"service_unavailable",...}`.
   - `Retry-After: 30` header present on both.
   - `curl -H "Host: sinapse.nc" localhost:8080/edge-health` → 200.
   - `curl -H "Host: sinapse.nc" localhost:8080/health` → upstream status passthrough (200 when mock up, 502 when down — no HTML).

### Unit test (my-project repo, this PR)

`server/__tests__/trust-proxy.test.ts` as described above.

### Manual validation (dev cluster)

1. Apply edge-proxy manifests, verify pods ready, `/edge-health` responds 200.
2. Apply ReferenceGrants.
3. Update dev HTTPRoute (skill-radar-dev) first, validate end-to-end.
4. Verify `competences.sinapse.nc` loads normally, rate limiting still uses real client IPs.
5. `kubectl -n apps scale deploy/skill-radar --replicas=0` → verify maintenance HTML for a browser, JSON 503 for `curl -H "Accept: application/json"`.
6. Restore, repeat for Drupal.

### Rollback

Keep git tag `pre-edge-proxy` on cloud-sinapse-infra. Two scenarios:

- **HTTPRoute misconfigured / ReferenceGrant missing**: revert HTTPRoute
  `backendRefs` to app Services directly. One-line revert per route.
- **Edge itself bad**: `kubectl -n gateway rollout undo deploy/sinapse-edge`.
  `progressDeadlineSeconds: 120` bounds the failure window; old replicas
  continue serving during a stalled rollout.

## Risks (residual, post-v3)

1. **Trust proxy update is required in this PR.** If forgotten, rate limiting
   silently breaks. Test added specifically to catch this.
2. **Config is manually reloaded.** A team member who doesn't know to run
   `rollout restart` will be confused. Mitigated by README documentation and
   a CI linter check that config is consistent.
3. **Two apps share fate on nginx upgrades.** Real but small: nginx is the
   canonical boring tech of the last 20 years.
4. **Every proxied request gets intercepted** — if Drupal or skill-radar
   returns a legitimate 502/503/504 status as part of normal API operation
   (they shouldn't, but), it turns into maintenance content. Mitigation: the
   content negotiation fallback preserves JSON for API clients. HTML clients
   getting a maintenance page on a legitimate 503 is arguably fine UX
   (user doesn't know the difference from a real outage).

## Rollout sequence

1. Eng review + Codex challenge — done.
2. Write plan v3 — done.
3. Land trust-proxy change to skill-radar in this repo (one commit, with test).
4. Ship to dev (CI deploy verifies rate limiting still works without edge).
5. Cloud-sinapse-infra: write manifests, CI e2e, apply to dev cluster.
6. Update dev HTTPRoute → sinapse-edge. Validate.
7. Update prod HTTPRoutes (one at a time).
8. Close RollingUpdate TODO as "deferred, no longer UX-blocking."

## Follow-ups → TODOS.md

- Edge observability (prometheus metrics).
- Edge-level rate limiting as DDoS safety.
- Auto-reload on ConfigMap change (only if pain emerges — currently accept manual).
- Per-host maintenance copy (low-value unless a specific reason appears).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | CLEAR | 10 issues, all resolved |
| Codex Challenge | `/plan-eng-review` → Codex | Adversarial 2nd opinion | 1 | **REVEALED 9 PROBLEMS** | 2 fatal (config wouldn't start/reload), 1 production-breaking (trust proxy), 1 semantic (JSON masking), 5 smaller — all addressed in v3 |

**VERDICT:** READY TO IMPLEMENT after v3 rewrite. Trust-proxy change lands in `my-project` first (safely testable), then infra changes land in `cloud-sinapse-infra`.
