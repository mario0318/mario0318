# One-time setup: lets GitHub Actions deploy mario0318-site without key files.
# Only changes Google Cloud project r3-m318; changes nothing on this machine.
# Safe to re-run (skips anything that already exists).
# Written with plain if/else only (no helper functions) for Windows PowerShell 5.1.

$ErrorActionPreference = "Continue"
$project = "r3-m318"
$region  = "us-central1"
$service = "mario0318-site"
$repo    = "mario0318/mario0318"
$pool    = "github"
$prov    = "mario0318-repo"
$saName  = "github-deployer"
$sa      = "$saName@$project.iam.gserviceaccount.com"

Write-Host "[1/8] project number"
$num = gcloud projects describe $project --format="value(projectNumber)"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: read project number (is gcloud logged in?)" -ForegroundColor Red; exit 1 }
Write-Host "      $project = $num"

Write-Host "[2/8] enable APIs"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $project
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: enable APIs" -ForegroundColor Red; exit 1 }

Write-Host "[3/8] deployer service account"
gcloud iam service-accounts describe $sa --project $project *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "      exists"
} else {
  gcloud iam service-accounts create $saName --project $project --display-name "GitHub Actions deployer (mario0318-site)"
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: create service account" -ForegroundColor Red; exit 1 }
}

Write-Host "[4/8] deploy roles on project"
gcloud projects add-iam-policy-binding $project --member "serviceAccount:$sa" --role roles/run.sourceDeveloper --condition=None --quiet *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: grant run.sourceDeveloper" -ForegroundColor Red; exit 1 }
gcloud projects add-iam-policy-binding $project --member "serviceAccount:$sa" --role roles/serviceusage.serviceUsageConsumer --condition=None --quiet *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: grant serviceUsageConsumer" -ForegroundColor Red; exit 1 }

Write-Host "[5/8] act as the service's runtime identity"
$runtime = gcloud run services describe $service --region $region --project $project --format="value(spec.template.spec.serviceAccountName)"
if ("$runtime" -eq "") { $runtime = "$num-compute@developer.gserviceaccount.com" }
Write-Host "      runtime identity: $runtime"
gcloud iam service-accounts add-iam-policy-binding $runtime --project $project --member "serviceAccount:$sa" --role roles/iam.serviceAccountUser --quiet *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: grant serviceAccountUser on runtime identity" -ForegroundColor Red; exit 1 }

Write-Host "[6/8] workload identity pool"
gcloud iam workload-identity-pools describe $pool --project $project --location global *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "      exists"
} else {
  gcloud iam workload-identity-pools create $pool --project $project --location global --display-name "GitHub Actions"
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: create pool" -ForegroundColor Red; exit 1 }
}

Write-Host "[7/8] GitHub provider (mario0318/mario0318, main only)"
gcloud iam workload-identity-pools providers describe $prov --project $project --location global --workload-identity-pool $pool *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "      exists"
} else {
  gcloud iam workload-identity-pools providers create-oidc $prov --project $project --location global --workload-identity-pool $pool --display-name "mario0318 repo, main only" --issuer-uri "https://token.actions.githubusercontent.com" --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" --attribute-condition "assertion.repository=='$repo' && assertion.ref=='refs/heads/main'"
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: create provider" -ForegroundColor Red; exit 1 }
}

Write-Host "[8/8] let the repo use the deployer"
$member = "principalSet://iam.googleapis.com/projects/$num/locations/global/workloadIdentityPools/$pool/attribute.repository/$repo"
gcloud iam service-accounts add-iam-policy-binding $sa --project $project --member $member --role roles/iam.workloadIdentityUser --quiet *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: grant workloadIdentityUser" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "done. paste these 2 lines back to Claude:" -ForegroundColor Green
Write-Host "GCP_WIF_PROVIDER=projects/$num/locations/global/workloadIdentityPools/$pool/providers/$prov"
Write-Host "GCP_DEPLOY_SA=$sa"
