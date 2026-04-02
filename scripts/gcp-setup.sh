#!/usr/bin/env bash
#
# GCP Infrastructure Setup — skill-radar (GKE Autopilot)
# =======================================================
# Idempotent: safe to re-run. Each command checks before creating.
#
# Prerequisites:
#   - gcloud CLI authenticated: gcloud auth login
#   - Billing account linked to the project
#   - GitHub CLI authenticated: gh auth login
#
# Usage:
#   bash scripts/gcp-setup.sh
#
set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────
PROJECT_ID="sinapse-core"
PROJECT_NUMBER="188660852606"
REGION="australia-southeast1"
GITHUB_REPO="Y0lan/skills-graph"

# Service names
APP_NAME="skill-radar"
CLUSTER_NAME="${APP_NAME}"
BUCKET_NAME="${APP_NAME}-litestream-backup"
AR_REPO="${APP_NAME}"                        # Artifact Registry repo
RUNTIME_SA="${APP_NAME}-runtime"             # GKE pod identity (GSA)
DEPLOY_SA="github-deploy"                   # GitHub Actions deploy SA
WIF_POOL="github-actions"
WIF_PROVIDER="github"

# ─── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
step() { echo -e "\n${GREEN}▸ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
info() { echo -e "  $1"; }

# ─── Preflight ──────────────────────────────────────────────────────────────
step "Preflight checks"

gcloud projects describe "$PROJECT_ID" --format="value(projectId)" > /dev/null 2>&1 \
  || { echo -e "${RED}ERROR: Project $PROJECT_ID not found. Run: gcloud auth login${NC}"; exit 1; }
info "Project: $PROJECT_ID ($PROJECT_NUMBER)"

gcloud config set project "$PROJECT_ID" --quiet

# ─── Step 1: Enable APIs ───────────────────────────────────────────────────
step "Step 1/8 — Enable APIs"

APIS=(
  container.googleapis.com
  compute.googleapis.com
  artifactregistry.googleapis.com
  iamcredentials.googleapis.com
  iam.googleapis.com
  cloudresourcemanager.googleapis.com
)

gcloud services enable "${APIS[@]}" --quiet
info "Enabled: ${APIS[*]}"

# ─── Step 2: GKE Autopilot Cluster ───────────────────────────────────────
step "Step 2/8 — GKE Autopilot Cluster"

if gcloud container clusters describe "$CLUSTER_NAME" --region="$REGION" --format="value(name)" > /dev/null 2>&1; then
  info "Cluster $CLUSTER_NAME already exists"
else
  info "Creating GKE Autopilot cluster (this takes 5-10 minutes)..."
  gcloud container clusters create-auto "$CLUSTER_NAME" \
    --region="$REGION" \
    --release-channel=stable \
    --quiet
  info "Created cluster: $CLUSTER_NAME"
fi

# Get credentials for kubectl
gcloud container clusters get-credentials "$CLUSTER_NAME" --region="$REGION" --quiet
info "kubectl configured for $CLUSTER_NAME"

# ─── Step 3: Artifact Registry ─────────────────────────────────────────────
step "Step 3/8 — Artifact Registry"

if gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --format="value(name)" > /dev/null 2>&1; then
  info "Repository $AR_REPO already exists"
else
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Docker images for $APP_NAME" \
    --quiet
  info "Created repository: $AR_REPO"
fi

# ─── Step 4: GCS Bucket (dual-region: Sydney + Melbourne) ──────────────────
step "Step 4/8 — GCS Bucket (Litestream backup)"

if gcloud storage buckets describe "gs://$BUCKET_NAME" > /dev/null 2>&1; then
  info "Bucket $BUCKET_NAME already exists"
else
  gcloud storage buckets create "gs://$BUCKET_NAME" \
    --placement=australia-southeast1,australia-southeast2 \
    --default-storage-class=STANDARD \
    --uniform-bucket-level-access \
    --public-access-prevention \
    --quiet
  info "Created bucket: $BUCKET_NAME (dual-region: Sydney + Melbourne)"
fi

# Lifecycle: delete objects older than 90 days (old WAL segments)
cat > /tmp/lifecycle.json << 'LIFECYCLE'
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {"age": 90}
    }
  ]
}
LIFECYCLE

gcloud storage buckets update "gs://$BUCKET_NAME" --lifecycle-file=/tmp/lifecycle.json --quiet
rm /tmp/lifecycle.json
info "Lifecycle policy: auto-delete after 90 days"

# ─── Step 5: Service Accounts ──────────────────────────────────────────────
step "Step 5/8 — Service Accounts"

# Runtime SA (used by GKE pods via Workload Identity)
if gcloud iam service-accounts describe "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" > /dev/null 2>&1; then
  info "Runtime SA already exists"
else
  gcloud iam service-accounts create "$RUNTIME_SA" \
    --display-name="GKE pod identity for $APP_NAME" \
    --quiet
  info "Created: ${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
fi

# Deploy SA (used by GitHub Actions)
if gcloud iam service-accounts describe "${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" > /dev/null 2>&1; then
  info "Deploy SA already exists"
else
  gcloud iam service-accounts create "$DEPLOY_SA" \
    --display-name="GitHub Actions deployer" \
    --quiet
  info "Created: ${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
fi

# ─── Step 6: IAM Bindings ──────────────────────────────────────────────────
step "Step 6/8 — IAM Bindings"

# Runtime SA: GCS access (for Litestream)
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET_NAME" \
  --member="serviceAccount:${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectUser" \
  --quiet > /dev/null
info "Runtime SA → storage.objectUser on $BUCKET_NAME"

# Deploy SA: GKE deployer + Artifact Registry writer
for role in roles/container.developer roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$role" \
    --condition=None \
    --quiet > /dev/null
  info "Deploy SA → $(basename $role)"
done

# ─── Step 7: GKE Workload Identity (KSA → GSA binding) ─────────────────────
step "Step 7/8 — GKE Workload Identity"

# Allow the K8s ServiceAccount to impersonate the GCP service account
# The KSA is created by kubectl apply -k k8s/ (service-account.yaml)
gcloud iam service-accounts add-iam-policy-binding \
  "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:${PROJECT_ID}.svc.id.goog[${APP_NAME}/${APP_NAME}]" \
  --quiet > /dev/null
info "KSA ${APP_NAME}/${APP_NAME} → GSA ${RUNTIME_SA}"

# ─── Step 8: Workload Identity Federation (GitHub Actions → GCP) ───────────
step "Step 8/8 — Workload Identity Federation"

if gcloud iam workload-identity-pools describe "$WIF_POOL" --location=global --format="value(name)" > /dev/null 2>&1; then
  info "WIF pool already exists"
else
  gcloud iam workload-identity-pools create "$WIF_POOL" \
    --location=global \
    --display-name="GitHub Actions" \
    --quiet
  info "Created WIF pool: $WIF_POOL"
fi

if gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
  --workload-identity-pool="$WIF_POOL" --location=global --format="value(name)" > /dev/null 2>&1; then
  info "WIF provider already exists"
else
  gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
    --workload-identity-pool="$WIF_POOL" \
    --location=global \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}' && assertion.ref=='refs/heads/main'" \
    --quiet
  info "Created WIF provider: $WIF_PROVIDER (restricted to $GITHUB_REPO main branch)"
fi

# Allow WIF to impersonate the deploy SA
gcloud iam service-accounts add-iam-policy-binding \
  "${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}" \
  --quiet > /dev/null
info "WIF → Deploy SA impersonation bound"

# ─── GitHub Repository Variables ───────────────────────────────────────────
step "GitHub Repository Variables"

if command -v gh > /dev/null 2>&1; then
  gh variable set GCP_PROJECT_ID --body "$PROJECT_ID" --repo "$GITHUB_REPO" --env production 2>/dev/null \
    || gh variable set GCP_PROJECT_ID --body "$PROJECT_ID" --repo "$GITHUB_REPO"
  gh variable set GCP_PROJECT_NUMBER --body "$PROJECT_NUMBER" --repo "$GITHUB_REPO" --env production 2>/dev/null \
    || gh variable set GCP_PROJECT_NUMBER --body "$PROJECT_NUMBER" --repo "$GITHUB_REPO"
  info "Set GCP_PROJECT_ID and GCP_PROJECT_NUMBER on $GITHUB_REPO"
else
  warn "gh CLI not found — set these manually in GitHub Settings > Environments > production:"
  warn "  GCP_PROJECT_ID = $PROJECT_ID"
  warn "  GCP_PROJECT_NUMBER = $PROJECT_NUMBER"
fi

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  GCP Infrastructure Ready (GKE Autopilot)${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Project:          $PROJECT_ID"
echo "  Region:           $REGION"
echo "  GKE Cluster:      $CLUSTER_NAME (Autopilot)"
echo "  Artifact Registry: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"
echo "  GCS Bucket:       gs://$BUCKET_NAME (dual-region: Sydney + Melbourne)"
echo "  Runtime SA:       ${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
echo "  Deploy SA:        ${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
echo "  WIF Pool:         $WIF_POOL (provider: $WIF_PROVIDER)"
echo ""
echo "  Next steps:"
echo "    1. Update k8s/secret.yaml with real secret values"
echo "    2. kubectl apply -k k8s/  (initial deploy)"
echo "    3. Push to main → GitHub Actions deploys automatically"
echo ""
