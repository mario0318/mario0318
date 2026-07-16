$ErrorActionPreference = "Stop"

$service = "mario0318-site"
$region = "us-central1"
$project = "r3-m318"

gcloud run deploy $service `
  --source . `
  --region $region `
  --project $project `
  --platform managed `
  --allow-unauthenticated `
  --memory 256Mi `
  --min-instances 0 `
  --max-instances 1 `
  --concurrency 80 `
  --no-cpu-boost `
  --quiet
