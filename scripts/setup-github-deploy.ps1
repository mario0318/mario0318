# One-time setup: lets GitHub Actions deploy mario0318-site without key files.
# Safe to re-run (skips anything that already exists).
# Does NOT touch your own gcloud login or deploy-mario0318.ps1.

$ErrorActionPreference = "Continue"
$project = "r3-m318"
$region  = "us-central1"
$service = "mario0318-site"
$repo    = "mario0318/mario0318"
$pool    = "github"
$prov    = "mario0318-repo"
$saName  = "github-deployer"
$sa      = "$saName@$project.iam.gserviceaccount.com"

function Check($what) { if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $what" -ForegroundColor Red; exit 1 } }

$num = gcloud projects describe $project --format="value(projectNumber)"; Check "read project number (is gcloud logged in?)"
Write-Host "project $project ($num)"

gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $project; Check "enable APIs"

gcloud iam service-accounts describe $sa --project $project *> $null
if ($LASTEXITCODE -ne 0) { gcloud iam service-accounts create $saName --project $project --display-name "GitHub Actions deployer (mario0318-site)"; Check "create service account" } else { Write-Host "service account exists" }

foreach ($role in "roles/run.sourceDeveloper", "roles/serviceusage.serviceUsageConsumer") {
  gcloud projects add-iam-policy-binding $project --member "serviceAccount:$sa" --role $role --condition=None --quiet *> $null; Check "grant $role"
}

$runtime = gcloud run services describe $service --region $region --project $project --format="value(spec.template.spec.serviceAccountName)"
if (-not $runtime) { $runtime = "$num-compute@developer.gserviceaccount.com" }
Write-Host "runtime identity: $runtime"
gcloud iam service-accounts add-iam-policy-binding $runtime --project $project --member "serviceAccount:$sa" --role roles/iam.serviceAccountUser --quiet *> $null; Check "grant actAs on runtime identity"

gcloud iam workload-identity-pools describe $pool --project $project --location global *> $null
if ($LASTEXITCODE -ne 0) { gcloud iam workload-identity-pools create $pool --project $project --location global --display-name "GitHub Actions"; Check "create pool" } else { Write-Host "pool exists" }

gcloud iam workload-identity-pools providers describe $prov --project $project --location global --workload-identity-pool $pool *> $null
if ($LASTEXITCODE -ne 0) {
  gcloud iam workload-identity-pools providers create-oidc $prov --project $project --location global --workload-identity-pool $pool --display-name "mario0318 repo, main only" --issuer-uri "https://token.actions.githubusercontent.com" --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" --attribute-condition "assertion.repository=='$repo' && assertion.ref=='refs/heads/main'"; Check "create provider"
} else { Write-Host "provider exists" }

$member = "principalSet://iam.googleapis.com/projects/$num/locations/global/workloadIdentityPools/$pool/attribute.repository/$repo"
gcloud iam service-accounts add-iam-policy-binding $sa --project $project --member $member --role roles/iam.workloadIdentityUser --quiet *> $null; Check "let the repo impersonate the deployer"

$provider = "projects/$num/locations/global/workloadIdentityPools/$pool/providers/$prov"
Write-Host ""
Write-Host "done. paste these 2 lines back to Claude:" -ForegroundColor Green
Write-Host "GCP_WIF_PROVIDER=$provider"
Write-Host "GCP_DEPLOY_SA=$sa"
