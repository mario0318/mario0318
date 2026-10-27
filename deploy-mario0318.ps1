$ErrorActionPreference = "Stop"

# Always deploy from the app directory so `--source .` is this app, never the
# parent folder — running from C:\Projects once uploaded every sibling project.
Set-Location $PSScriptRoot

$service = "mario0318-site"
$region = "us-central1"
$project = "r3-m318"

gcloud run deploy $service `
  --source . `
  --region $region `
  --project $project `
  --platform managed `
  --allow-unauthenticated `
  --memory 512Mi `
  --min-instances 0 `
  --max-instances 1 `
  --concurrency 4 `
  --timeout 300 `
  --no-cpu-boost `
  --quiet

# Traffic may be pinned to a fixed revision (scripts/deploy-sungolog.ps1 does
# that), in which case the deploy above doesn't go live on its own.
gcloud run services update-traffic $service --region $region --project $project --to-latest --quiet
