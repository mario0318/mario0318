$ErrorActionPreference = "Stop"

$project = "mario0318-terminal-live"
$keyName = "projects/526649182798/locations/global/keys/ed744fe6-2ae1-41c5-b45b-e51716f46963"
$configPath = Join-Path $PSScriptRoot "admin\firebase-config.json"

$apiKey = gcloud services api-keys get-key-string $keyName `
  --project $project `
  --format "value(keyString)"

if (-not $apiKey) {
  throw "Unable to retrieve the Firebase browser key."
}

$config = [ordered]@{
  apiKey = $apiKey.Trim()
  authDomain = "$project.firebaseapp.com"
  projectId = $project
  appId = "1:526649182798:web:a6eed4b37970138f0d911f"
  messagingSenderId = "526649182798"
}

try {
  $config | ConvertTo-Json -Compress | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
  npx --yes firebase-tools@15.24.0 deploy `
    --only hosting `
    --project $project `
    --non-interactive
} finally {
  Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue
}
