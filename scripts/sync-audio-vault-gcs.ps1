$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

$Project = $env:AUDIO_VAULT_PROJECT
if (-not $Project) { $Project = "r3-m318" }

$Bucket = $env:AUDIO_VAULT_BUCKET
if (-not $Bucket) { $Bucket = "mario0318-audio-vault-r3-m318" }

$Location = $env:AUDIO_VAULT_LOCATION
if (-not $Location) { $Location = "us-central1" }

$LocalVault = Resolve-Path -LiteralPath "public/audio-vault"
$Manifest = Resolve-Path -LiteralPath "public/tracks.json"
$ObjectPrefix = "audio-vault"
$UrlPrefix = "https://storage.googleapis.com/$Bucket/$ObjectPrefix/"
$Gcloud = "gcloud.cmd"

$personalLocal = Get-ChildItem -LiteralPath $LocalVault -Recurse -File |
  Where-Object { $_.FullName -split '[\\/]' | Where-Object { $_.ToLowerInvariant() -eq "personal" } }
if ($personalLocal) {
  throw "Refusing to sync: public/audio-vault contains a Personal path segment."
}

$manifestText = Get-Content -LiteralPath $Manifest -Raw
if ($manifestText -match '(?i)(^|[\\/])personal([\\/]|$)') {
  throw "Refusing to sync: public/tracks.json appears to reference a Personal path segment."
}

$PreviousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
& $Gcloud storage buckets describe "gs://$Bucket" --project $Project *> $null
$BucketExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $PreviousErrorActionPreference
if (-not $BucketExists) {
  & $Gcloud storage buckets create "gs://$Bucket" --project $Project --location $Location --uniform-bucket-level-access --no-public-access-prevention
}

& $Gcloud storage buckets add-iam-policy-binding "gs://$Bucket" --project $Project --member allUsers --role roles/storage.objectViewer *> $null

& $Gcloud storage rsync $LocalVault "gs://$Bucket/$ObjectPrefix" --project $Project --recursive --checksums-only --cache-control "public, max-age=31536000, immutable"

node -e "const fs=require('fs'); const manifest='public/tracks.json'; const prefix=process.argv[1]; const tracks=JSON.parse(fs.readFileSync(manifest,'utf8')); for (const t of tracks) t.url = prefix + String(t.url).split('/').pop(); fs.writeFileSync(manifest, JSON.stringify(tracks, null, 2) + '\n');" $UrlPrefix

Write-Output "audio vault synced"
Write-Output "bucket: gs://$Bucket/$ObjectPrefix"
Write-Output "urlPrefix: $UrlPrefix"
