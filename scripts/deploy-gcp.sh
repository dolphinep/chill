#!/usr/bin/env bash
set -e

# ==============================================================================
# Chill - GCP Cloud Run Unified Demo Deployment Script
# ==============================================================================

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${2:-asia-southeast1}"
REPO_NAME="chill-repo"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: GCP Project ID is required."
  echo "Usage: ./scripts/deploy-gcp.sh <PROJECT_ID> [REGION]"
  exit 1
fi

echo "🚀 Deploying Chill Unified Demo to Google Cloud Platform..."
echo "  - Project ID : $PROJECT_ID"
echo "  - Region     : $REGION"
echo "  - Repository : $REPO_NAME"

# 1. Enable Required GCP APIs
echo "📦 Enabling GCP Services..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT_ID"

# 2. Ensure Artifact Registry repository exists
echo "📦 Checking Artifact Registry..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "  Creating Artifact Registry repository '$REPO_NAME'..."
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Docker repository for Chill project" \
    --project="$PROJECT_ID"
fi

IMAGE_TAG="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/chill-demo:latest"

# 3. Build & Push Unified Docker Image (Web + WebSocket Relay)
echo "🔨 Building & Pushing Unified Docker image (Next.js + Multiplayer Relay)..."
gcloud builds submit \
  --project="$PROJECT_ID" \
  --tag="$IMAGE_TAG" \
  .

# 4. Deploy Unified Container to Cloud Run
echo "🚀 Deploying 'chill-demo' to Cloud Run..."
gcloud run deploy chill-demo \
  --image="$IMAGE_TAG" \
  --platform=managed \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --allow-unauthenticated \
  --session-affinity \
  --timeout=3600 \
  --port=8080 \
  --min-instances=0 \
  --max-instances=5 \
  --memory=1Gi \
  --cpu=1

SERVICE_URL=$(gcloud run services describe chill-demo \
  --platform=managed \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.url)")

echo "=============================================================================="
echo "🎉 Chill Demo Deployment Completed Successfully!"
echo "🌐 Demo URL: $SERVICE_URL"
echo "   (ทั้ง Web 3D และ Multiplayer WebSocket ทำงานร่วมกันบน URL นี้อัตโนมัติ)"
echo "=============================================================================="
