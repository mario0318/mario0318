param([switch]$Apply, [switch]$Preview)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$project = 'r3-m318'
$region = 'us-central1'
$service = 'mario0318-site'
$bucket = 'mario0318-sungolog-r3-m318'
$firebaseProject = 'mario0318-terminal-live'
$schedulerEmail = "sungolog-sync@$project.iam.gserviceaccount.com"
$job = 'sungolog-source-check'

function Invoke-Cloud {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CloudArgs)
    $previousMetrics = $env:CLOUDSDK_METRICS_ENVIRONMENT
    try {
        $env:CLOUDSDK_METRICS_ENVIRONMENT = (($previousMetrics + ' gcs-skills gcs-skills/1.0 (skill:google-cloud-storage-basics)').Trim())
        $result = & gcloud @CloudArgs
        if ($LASTEXITCODE -ne 0) { throw "gcloud failed: $($CloudArgs[0..([Math]::Min(2,$CloudArgs.Length - 1))] -join ' ')" }
        return $result
    } finally { $env:CLOUDSDK_METRICS_ENVIRONMENT = $previousMetrics }
}

Write-Host "sungolog deployment plan: existing $service in $project/$region"
Write-Host "private Standard bucket gs://$bucket, uniform access, public access prevention, seven-day soft delete"
Write-Host 'existing Google sign-in, owner mario0318@gmail.com; archives stay private until explicitly published'
Write-Host 'one source-check job at 00:18, 06:18, 12:18 and 18:18 UTC, authenticated with OIDC'
Write-Host 'target additional cost $0 within remaining shared free quotas; scheduler otherwise $0.10/month'
Write-Host 'traffic, storage overage, build artifacts and consumed shared quotas can add usage charges'
if (-not $Apply) { Write-Host 'Plan only. No remote resources changed. -Apply executes this plan.'; exit 0 }

& (Join-Path $PSScriptRoot 'repair-gcloud-session.ps1')
$env:CLOUDSDK_CORE_DISABLE_USAGE_REPORTING = 'true'
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = 'true'

# Do not make infrastructure changes until the code checks pass.
& node --test tests/sungolog.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Archive tests failed.' }
& node test-terminal.mjs
if ($LASTEXITCODE -ne 0) { throw 'Terminal tests failed.' }

$runtimeEmail = (Invoke-Cloud run services describe $service --project $project --region $region '--format=value(spec.template.spec.serviceAccountName)').Trim()
if (-not $runtimeEmail) { throw 'Existing Cloud Run service identity could not be determined.' }

# Read-only baseline checks. Lack of access remains undetermined, not a claim
# that the project already enforces these policies.
foreach ($constraint in @('gcp.restrictTLSVersion','storage.secureHttpTransport','storage.restrictAuthTypes')) {
    try { Invoke-Cloud org-policies describe $constraint --project $project --effective --format=json | Out-Null }
    catch { Write-Warning "Project policy $constraint could not be verified." }
}

Invoke-Cloud services enable storage.googleapis.com --project $project --quiet | Out-Null
if (-not $Preview) { Invoke-Cloud services enable cloudscheduler.googleapis.com --project $project --quiet | Out-Null }
$buckets = Invoke-Cloud storage buckets list --project $project '--format=value(name)'
if (@($buckets) -notcontains $bucket -and @($buckets) -notcontains "gs://$bucket/") {
    # A global name collision fails creation. Never adopt another project's bucket.
    Invoke-Cloud storage buckets create "gs://$bucket" --project $project --location $region --default-storage-class STANDARD --uniform-bucket-level-access --public-access-prevention --soft-delete-duration 7d --quiet | Out-Null
}
$bucketInfo = (Invoke-Cloud storage buckets describe "gs://$bucket" --format=json | Out-String | ConvertFrom-Json)
$pap = $bucketInfo.public_access_prevention
if (-not $pap) { $pap = $bucketInfo.iamConfiguration.publicAccessPrevention }
$uniform = $bucketInfo.uniform_bucket_level_access
if ($null -eq $uniform) { $uniform = $bucketInfo.iamConfiguration.uniformBucketLevelAccess.enabled }
if ($pap -ne 'enforced' -or $uniform -ne $true) { throw 'Archive bucket must have uniform access and enforced public access prevention.' }
if ($bucketInfo.location -ne 'US-CENTRAL1') { throw 'Archive bucket must be in us-central1 for this deployment.' }
Invoke-Cloud storage buckets add-iam-policy-binding "gs://$bucket" "--member=serviceAccount:$runtimeEmail" --role=roles/storage.objectUser --quiet | Out-Null

if (-not $Preview) {
    $accounts = Invoke-Cloud iam service-accounts list --project $project '--format=value(email)'
    if (@($accounts) -notcontains $schedulerEmail) { Invoke-Cloud iam service-accounts create sungolog-sync --project $project '--display-name=sungolog source checks' --quiet | Out-Null }
}

$serviceUrl = (Invoke-Cloud run services describe $service --project $project --region $region '--format=value(status.url)').Trim()
$audience = "$serviceUrl/api/sungolog/sync"
$keyName = 'projects/526649182798/locations/global/keys/ed744fe6-2ae1-41c5-b45b-e51716f46963'
$browserKey = (Invoke-Cloud services api-keys get-key-string $keyName --project $firebaseProject '--format=value(keyString)').Trim()
if (-not $browserKey) { throw 'Existing Firebase browser configuration could not be retrieved.' }

# Firebase browser keys are public configuration. No private service-account
# keys are created, exported, printed, or included in the repository.
$cloudAccess = (Invoke-Cloud auth print-access-token).Trim()
$authHeaders = @{ Authorization = "Bearer $cloudAccess"; 'x-goog-user-project' = $firebaseProject }
$authConfigURL = "https://identitytoolkit.googleapis.com/admin/v2/projects/$firebaseProject/config"
$authConfig = Invoke-RestMethod -Uri $authConfigURL -Headers $authHeaders
if (@($authConfig.authorizedDomains) -notcontains 'mario0318.com') {
    $authBody = @{ authorizedDomains = @(@($authConfig.authorizedDomains) + 'mario0318.com' | Select-Object -Unique) } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Patch -Uri "${authConfigURL}?updateMask=authorizedDomains" -Headers $authHeaders -ContentType 'application/json' -Body $authBody | Out-Null
}
$cloudAccess = $null
$keyConfig = Invoke-Cloud services api-keys describe $keyName --project $firebaseProject --format=json | Out-String | ConvertFrom-Json
$referrers = @($keyConfig.restrictions.browserKeyRestrictions.allowedReferrers)
if ($referrers -notcontains 'https://mario0318.com/*') {
    $referrers = @($referrers + 'https://mario0318.com/*' | Select-Object -Unique)
    Invoke-Cloud services api-keys update $keyName --project $firebaseProject "--allowed-referrers=$($referrers -join ',')" --quiet | Out-Null
}

$environmentUpdate = "SUNGOLOG_BUCKET=$bucket,SUNGOLOG_FIREBASE_API_KEY=$browserKey,SUNGOLOG_SYNC_EMAIL=$schedulerEmail,SUNGOLOG_SYNC_AUDIENCE=$audience"
Invoke-Cloud run deploy $service --source . --project $project --region $region --platform managed --memory 512Mi --min-instances 0 --max-instances 1 --concurrency 4 --no-cpu-boost --timeout 300 "--update-env-vars=$environmentUpdate" --no-traffic --tag sungolog-review --quiet | Out-Null
$browserKey = $null
$release = Invoke-Cloud run services describe $service --project $project --region $region '--format=json(status.traffic,status.latestReadyRevisionName)' | Out-String | ConvertFrom-Json
$previewURL = @($release.status.traffic | Where-Object { $_.tag -eq 'sungolog-review' })[0].url
if (-not $previewURL) { throw 'The preview revision URL was not returned.' }
$health = Invoke-RestMethod -Uri "$previewURL/api/sungolog/status"
if (-not $health.configured) { throw 'The preview does not report configured storage.' }
$feed = Invoke-RestMethod -Uri "$previewURL/api/sungolog/posts"
if ($Preview) {
    Write-Host "Preview verified with $($feed.posts.Count) public entries. Production traffic was not changed."
    Write-Host "$previewURL/sungolog/"
    exit 0
}
Invoke-Cloud run services update-traffic $service --project $project --region $region "--to-revisions=$($release.status.latestReadyRevisionName)=100" --quiet | Out-Null

$jobs = Invoke-Cloud scheduler jobs list --project $project --location $region '--format=value(name)'
$schedulerArgs = @('scheduler','jobs')
if (@($jobs | Where-Object { $_ -match "/$job$" }).Count) { $schedulerArgs += @('update','http') } else { $schedulerArgs += @('create','http') }
$schedulerArgs += @($job,'--project',$project,'--location',$region,'--schedule','18 */6 * * *','--time-zone','Etc/UTC','--uri',$audience,'--http-method','POST','--oidc-service-account-email',$schedulerEmail,'--oidc-token-audience',$audience,'--attempt-deadline','300s','--max-retry-attempts','0','--quiet')
Invoke-Cloud @schedulerArgs | Out-Null

$health = Invoke-RestMethod -Uri "$serviceUrl/api/sungolog/status"
if (-not $health.configured) { throw 'Deployed archive does not report configured storage.' }
$feed = Invoke-RestMethod -Uri "$serviceUrl/api/sungolog/posts"
Write-Host "Deployed sungolog. $($feed.posts.Count) public entries."
Write-Host 'https://mario0318.com/sungolog/'
