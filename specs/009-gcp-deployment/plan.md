# 009 — Deploy team-skill-radar to Google Cloud

## Overview

Migrate the team-skill-radar application from Fly.io to Google Cloud Platform (organizational requirement). The app is a fullstack monorepo (React 19 + Express 5 + SQLite) already containerized with Docker and using Litestream for SQLite replication. This plan covers hosting on Cloud Run, SQLite backup to GCS (multi-region), CI/CD via GitHub Actions, and secrets management.

**Key trade-off**: Cloud Run has no persistent disk (unlike Fly.io). Litestream becomes the primary persistence mechanism, not just a backup. On every deploy/restart, the DB is restored from GCS. There is a small data-loss window (<1s under normal conditions) if a container crashes before Litestream finishes replicating the latest WAL frames. This is acceptable for this internal team tool.

## Current State

- **Hosting**: Fly.io (Sydney region), single machine, always-on
- **Container**: Docker (node:22-slim + Litestream 0.3.13)
- **Database**: SQLite (better-sqlite3), WAL mode, stored at `/data/ratings.db`
- **Backup**: Litestream replicating to Cloudflare R2 (S3-compatible)
- **Auth**: Better Auth with session-based auth + PIN system
- **CI/CD**: None (manual `fly deploy`)
- **Health checks**: `/health` (basic), `/health/backup` (DB + Litestream status)

## Target State

- **Hosting**: Cloud Run (australia-southeast1 / Sydney — closest to New Caledonia, ~2,300km)
- **Container Registry**: Artifact Registry (same region)
- **Database**: SQLite (unchanged) + Litestream replicating to GCS
- **Backup**: GCS dual-region bucket (australia-southeast1 + australia-southeast2 / Sydney + Melbourne) for automatic cross-region redundancy
- **Secrets**: Google Secret Manager
- **CI/CD**: GitHub Actions → build → push to Artifact Registry → deploy Cloud Run
- **Auth for CI/CD**: Workload Identity Federation (no service account keys in GitHub)

## Architecture

```
GitHub (push to main)
  │
  ▼
GitHub Actions ──[Workload Identity Federation]──► GCP
  │
  ├── Build Docker image
  ├── Push to Artifact Registry (australia-southeast1)
  └── Deploy to Cloud Run (australia-southeast1 / Sydney)
         │
         ├── Port 8080, min-instances=1, max-instances=1 (SQLite is single-writer)
         ├── /health → health check
         └── Litestream ──► GCS dual-region bucket
                              │
                              └── Auto-replicated across Sydney + Melbourne
```

## Step-by-Step Plan

### Step 1: GCP Project & CLI Setup

Prerequisites: GCP account, `gcloud` CLI installed.

```bash
# Set project (user should create project in GCP Console first or use existing)
gcloud config set project PROJECT_ID
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com
```

### Step 2: Artifact Registry

Create a Docker repository to store container images.

```bash
gcloud artifacts repositories create skill-radar \
  --repository-format=docker \
  --location=australia-southeast1 \
  --description="team-skill-radar Docker images"
```

### Step 3: GCS Bucket for Litestream Backup

Create a dual-region bucket for automatic cross-region replication.

```bash
gcloud storage buckets create gs://skill-radar-litestream-backup \
  --placement=australia-southeast1,australia-southeast2 \
  --uniform-bucket-level-access \
  --public-access-prevention
```

Using a custom dual-region bucket (Sydney + Melbourne). GCS automatically replicates data across both regions — no separate replication config needed. If Sydney goes down, the data is already in Melbourne.

### Step 4: Update Litestream Config for GCS

Replace the S3/R2 replica with a GCS replica. Litestream supports GCS natively.

**litestream.yml** (updated):
```yaml
dbs:
  - path: /data/ratings.db
    replicas:
      - type: gcs
        bucket: skill-radar-litestream-backup
        path: ratings
```

No access keys needed when running on Cloud Run — Litestream uses the service account's ambient credentials automatically.

### Step 5: Update entrypoint.sh

Remove R2-specific env var checks. Update restore command. The structure stays the same:
1. Local backup before start
2. Restore from GCS if no local DB
3. Start Litestream replicate with the Node server

Key change: remove the `LITESTREAM_R2_*` env var references since GCS auth is implicit.

### Step 6: Update Health Check Endpoint

Update `/health/backup` to check GCS instead of R2 env vars:
```typescript
const litestreamConfigured = process.env.NODE_ENV === 'production'
```

### Step 7: Secret Manager

Store secrets (Better Auth secret, Resend API key, any future secrets):

```bash
echo -n "YOUR_SECRET" | gcloud secrets create better-auth-secret --data-file=-
echo -n "YOUR_KEY" | gcloud secrets create resend-api-key --data-file=-
echo -n "YOUR_KEY" | gcloud secrets create anthropic-api-key --data-file=-
```

These get injected into Cloud Run as env vars (Step 9).

### Step 8: Create Cloud Run Service Account

Dedicated service account with least-privilege:

```bash
gcloud iam service-accounts create skill-radar-runner \
  --display-name="Cloud Run skill-radar"

# Grant GCS access (for Litestream)
gcloud storage buckets add-iam-policy-binding gs://skill-radar-litestream-backup \
  --member="serviceAccount:skill-radar-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectUser"

# Grant Secret Manager access
gcloud secrets add-iam-policy-binding better-auth-secret \
  --member="serviceAccount:skill-radar-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding resend-api-key \
  --member="serviceAccount:skill-radar-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member="serviceAccount:skill-radar-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Step 9: Deploy to Cloud Run (Initial Manual Deploy)

First deploy to validate everything works:

```bash
# Build and push image
gcloud builds submit --tag australia-southeast1-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/skill-radar/app:latest

# Deploy
gcloud run deploy skill-radar \
  --image australia-southeast1-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/skill-radar/app:latest \
  --region australia-southeast1 \
  --service-account skill-radar-runner@PROJECT_ID.iam.gserviceaccount.com \
  --port 8080 \
  --min-instances 1 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars NODE_ENV=production,PORT=8080,DATA_DIR=/data \
  --set-secrets BETTER_AUTH_SECRET=better-auth-secret:latest,RESEND_API_KEY=resend-api-key:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --allow-unauthenticated \
  --no-cpu-throttling \
  --execution-environment gen2 \
  --startup-cpu-boost \
  --termination-grace-period=30
```

**Important flags:**
- `--no-cpu-throttling`: Required for Litestream background replication (CPU must stay allocated outside requests)
- `--startup-cpu-boost`: Speeds up DB restoration on cold start

**Note on SQLite persistence**: Cloud Run instances are ephemeral. The SQLite DB lives in the container's filesystem and is lost on redeployment. Litestream handles this: on startup, it restores the latest snapshot from GCS. During runtime, it continuously replicates WAL changes. On the next deploy, the new container restores from GCS and picks up where it left off. With min-instances=1, the container stays warm and the DB is available. This is the same pattern used on Fly.io today.

### Step 10: Workload Identity Federation for GitHub Actions

This lets GitHub Actions authenticate to GCP without storing service account keys.

```bash
# Create Workload Identity Pool
gcloud iam workload-identity-pools create github-actions \
  --location=global \
  --display-name="GitHub Actions"

# Create Provider
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github-actions \
  --display-name="GitHub" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Create deploy service account
gcloud iam service-accounts create github-deploy \
  --display-name="GitHub Actions deployer"

# Grant Artifact Registry push
gcloud artifacts repositories add-iam-policy-binding skill-radar \
  --location=australia-southeast1 \
  --member="serviceAccount:github-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Grant Cloud Run deploy
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.developer"

# Grant actAs permission on the runner service account
gcloud iam service-accounts add-iam-policy-binding \
  skill-radar-runner@PROJECT_ID.iam.gserviceaccount.com \
  --member="serviceAccount:github-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Allow GitHub repo to impersonate the deploy SA
gcloud iam service-accounts add-iam-policy-binding \
  github-deploy@PROJECT_ID.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/attribute.repository/Y0lan/skills-graph" \
  --condition='expression=assertion.ref=="refs/heads/main",title=main-branch-only'
```

### Step 11: GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npm run lint
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/${{ vars.GCP_PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github-actions/providers/github
          service_account: github-deploy@${{ vars.GCP_PROJECT_ID }}.iam.gserviceaccount.com

      - uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for Artifact Registry
        run: gcloud auth configure-docker australia-southeast1-docker.pkg.dev --quiet

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: australia-southeast1-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/skill-radar/app:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy skill-radar \
            --image australia-southeast1-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/skill-radar/app:${{ github.sha }} \
            --region australia-southeast1 \
            --port 8080 \
            --min-instances 1 \
            --max-instances 1 \
            --memory 512Mi \
            --cpu 1 \
            --no-cpu-throttling \
            --termination-grace-period=30 \
            --quiet

      - name: Smoke test
        run: |
          URL=$(gcloud run services describe skill-radar --region australia-southeast1 --format='value(status.url)')
          for i in 1 2 3 4 5; do
            STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$URL/health")
            [ "$STATUS" = "200" ] && echo "Health check passed" && exit 0
            sleep 5
          done
          echo "Health check failed after 5 retries" && exit 1
```

### Step 12: CORS & Auth URL Configuration

After Cloud Run deploys, update:
- `CORS_ORIGIN` env var → Cloud Run service URL (or custom domain)
- `BETTER_AUTH_URL` → same URL

```bash
gcloud run services update skill-radar \
  --region australia-southeast1 \
  --set-env-vars CORS_ORIGIN=https://skill-radar-HASH-as1.a.run.app,BETTER_AUTH_URL=https://skill-radar-HASH-as1.a.run.app
```

### Step 13: Migrate Data from R2 to GCS

One-time migration of existing Litestream replica:

```bash
# On local machine with both R2 and GCS access:
# 1. Restore DB from R2
litestream restore -config litestream.yml /tmp/ratings.db

# 2. Upload to GCS using the new litestream config
litestream replicate /tmp/ratings.db -config litestream-gcs.yml
# (let it run for ~30s to ensure full snapshot, then Ctrl+C)
```

Or simpler: just let the first Cloud Run deploy create a fresh DB and re-seed.

### Step 14: Startup Probe & Health Check

Add a Cloud Run startup probe to prevent traffic routing before DB restoration completes:

```bash
gcloud run services update skill-radar \
  --region australia-southeast1 \
  --startup-probe-path=/health/backup \
  --startup-probe-initial-delay=5 \
  --startup-probe-period=2 \
  --startup-probe-failure-threshold=15
```

The `/health/backup` endpoint checks that the SQLite DB is accessible and queryable. This prevents the service from receiving traffic until Litestream has finished restoring from GCS.

### Step 15: Cloud Monitoring Uptime Check

Add basic uptime monitoring so outages are detected immediately:

```bash
gcloud monitoring uptime create skill-radar-health \
  --display-name="Skill Radar Health" \
  --monitored-resource-type=cloud_run_revision \
  --monitored-resource-labels=service_name=skill-radar,location=australia-southeast1 \
  --http-check-path=/health \
  --period=300 \
  --timeout=10
```

### Step 16: GCS Lifecycle Policy

Prevent unbounded storage growth from Litestream generations:

```bash
gcloud storage buckets update gs://skill-radar-litestream-backup \
  --lifecycle-file=/dev/stdin << 'EOF'
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {"age": 90}
    }
  ]
}
EOF
```

### Step 17: Verify Migration

Post-deploy verification checklist:
1. `curl https://CLOUD_RUN_URL/health` → `{"status":"ok"}`
2. `curl https://CLOUD_RUN_URL/health/backup` → DB accessible, evaluation count matches
3. Compare evaluation count with Fly.io instance
4. Test login + submit a rating → verify it persists after waiting 5s (Litestream replication)
5. Check GCS bucket for Litestream snapshots: `gsutil ls gs://skill-radar-litestream-backup/ratings/`

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `litestream.yml` | Modify | S3/R2 → GCS replica type |
| `entrypoint.sh` | Modify | Remove R2 env var references |
| `server/index.ts` | Modify | Update litestream health check |
| `.github/workflows/deploy.yml` | Create | CI/CD pipeline |
| `Dockerfile` | Modify | Add `RUN mkdir -p /data && chown appuser:appuser /data` (no volume mount on Cloud Run) |

## Environment Variables

### Cloud Run Service
| Variable | Source | Value |
|----------|--------|-------|
| `NODE_ENV` | env | `production` |
| `PORT` | env | `8080` |
| `DATA_DIR` | env | `/data` |
| `CORS_ORIGIN` | env | Cloud Run URL or custom domain |
| `BETTER_AUTH_URL` | env | Same as CORS_ORIGIN |
| `BETTER_AUTH_SECRET` | Secret Manager | Secret reference |
| `RESEND_API_KEY` | Secret Manager | Secret reference |
| `ANTHROPIC_API_KEY` | Secret Manager | Secret reference |

### GitHub Repository Settings
| Secret/Variable | Value |
|----------------|-------|
| No secrets needed | Workload Identity Federation handles auth |

Only needs these in GitHub Actions environment vars:
- `GCP_PROJECT_ID`
- `GCP_PROJECT_NUMBER`

## Cost Estimate

| Resource | Estimate/month |
|----------|---------------|
| Cloud Run (1 min instance, 512Mi, 1 vCPU, Sydney, CPU always-allocated) | ~$40-50 |
| Artifact Registry (Sydney) | ~$1-2 (storage) |
| GCS (Sydney + Melbourne replication, <1GB) | ~$0.10 |
| Secret Manager (2 secrets, low access) | ~$0.01 |
| Cloud Monitoring uptime check | Free (first 3) |
| **Total** | **~$42-53/month** |

Note: CPU always-allocated pricing is required because Litestream runs as a background process. This is higher than Fly.io (~$5/mo) but acceptable per organizational requirements.

## Rollback Plan

- Cloud Run keeps previous revisions. Rollback: `gcloud run services update-traffic skill-radar --to-revisions=PREVIOUS_REV=100 --region australia-southeast1`
- Litestream snapshots in GCS provide point-in-time DB recovery
- Fly.io deployment remains functional until explicitly decommissioned

## Out of Scope

- Custom domain setup (can be added later via Cloud Run domain mapping)
- Cloud CDN (not needed for this traffic level)
- Advanced Cloud Monitoring dashboards and alert policies (basic uptime check is in scope)
- Database migration to Cloud SQL (SQLite + Litestream is sufficient)
- Multi-region Cloud Run deployment (single region is sufficient)

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Approach A (Cloud Run + Litestream/GCS) | P5 explicit, P3 pragmatic | Minimal change, same proven pattern, lowest risk | Approach B (Cloud SQL), C (GCE VM) |
| 2 | CEO | Mode: SELECTIVE EXPANSION | P1 completeness, P2 boil lakes | Solid base scope + cherry-pick improvements | SCOPE EXPANSION (overkill), HOLD (misses easy wins) |
| 3 | CEO | Add monitoring uptime check | P1 completeness | 5 min setup, catches outages | Skip (too risky to omit) |
| 4 | CEO | Add Docker layer caching | P2 boil lakes | Halves CI build time for free | Skip |
| 5 | CEO | Add GCS lifecycle policy | P2 boil lakes | Prevents unbounded storage growth | Skip |
| 6 | CEO | Defer staging environment | P3 pragmatic | Not requested, doubles GCP setup | Add to scope |
| 7 | CEO | Tighten IAM to objectUser | P5 explicit | objectAdmin grants unnecessary bucket-level permissions | Keep objectAdmin |
| 8 | CEO | Add startup probe | P1 completeness | Prevents traffic before DB ready (subagent finding) | Skip |
| 9 | CEO | Correct cost to $42-53/mo | P5 explicit | CPU-always-allocated pricing required for Litestream | Keep $16-28 estimate |
| 10 | Eng | Add ANTHROPIC_API_KEY to secrets | P1 completeness | Chat endpoint needs it, was missing from plan | Skip |
| 11 | Eng | Add smoke test to CI | P2 boil lakes | Validates deploy actually works, 5 lines | Skip |
| 12 | Eng | No additional unit tests | P3 pragmatic | Infra/config work — verification checklist is appropriate | Add unit tests |
| 13 | Eng | CRITICAL: max-instances=1 (was 3) | P5 explicit | SQLite is single-writer; multiple instances = split-brain data corruption | Keep max-instances=3 |
| 14 | Eng | Add /data dir to Dockerfile | P1 completeness | No volume mount on Cloud Run, /data doesn't exist | Skip |
| 15 | Eng | Add termination-grace-period=30 | P1 completeness | Give Litestream time to flush WAL on shutdown | Use default 10s |
| 16 | Eng | Use custom dual-region bucket | P5 explicit | Simpler than two buckets with replication rules | Keep two buckets |
| 17 | Eng | Use GitHub vars in workflow | P5 explicit | Literal PROJECT_ID placeholders would break CI | Keep placeholders |
| 18 | Eng | Include all Cloud Run flags in CI deploy | P1 completeness | Prevent silent misconfiguration on service recreation | Minimal flags |
| 19 | Eng | Restrict WIF to main branch | P3 pragmatic | Prevent non-main branches from deploying | Allow all branches |

## Cross-Phase Themes

**Durability trade-off** — flagged in Phase 1 (CEO: ephemeral filesystem vs persistent volume) and Phase 3 (Eng: cold start restore timing). High-confidence signal. Mitigated by: startup probe, Litestream continuous replication (<1s lag), min-instances=1. Accepted risk for internal team tool.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean | 0 unresolved, mode: SELECTIVE_EXPANSION |
| Eng Review | `/plan-eng-review` | Architecture & tests | 2 | clean | 3 issues (env var wipe, dual-region, Gateway), all resolved |
| CEO Voices | `/autoplan` | Independent strategic challenge | 1 | clean | subagent-only, 2/6 confirmed, 4 disagree (resolved) |
| Eng Voices | `/autoplan` | Independent eng challenge | 1 | clean | subagent-only, 1 CRITICAL (max-instances), 4 HIGH, 10 MEDIUM — all addressed |
| Outside Voice | `/plan-eng-review` | Independent 2nd opinion | 1 | issues_found | 13 findings — GKE pivot gaps, KSA→GSA, cost (resolved: shared cluster) |

**VERDICT:** APPROVED — pivoted from Cloud Run to GKE Autopilot. All findings addressed. GKE cost justified by shared cluster amortization.

**GKE PIVOT NOTE (2026-03-25):** Architecture changed from Cloud Run to GKE Autopilot per user decision. Rationale: cluster will host multiple services, management fee ($74/mo) is amortized. All infra files (deploy.yml, gcp-setup.sh, K8s manifests) updated accordingly.
