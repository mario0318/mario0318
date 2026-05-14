$ErrorActionPreference = "Stop"

$service = "mario0318-site"
$region = "us-central1"

gcloud run deploy $service `
  --source . `
  --region $region `
  --platform managed `
  --allow-unauthenticated `
  --memory 256Mi `
  --min-instances 0 `
  --max-instances 3 `
  --concurrency 80 `
  --quiet
