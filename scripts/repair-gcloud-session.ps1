# Use a writable SDK configuration without braces in its path. Google SDK's
# config_db_path.format() interprets the braces in sandbox temp paths as keys.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$roamingData = if ($env:APPDATA) { $env:APPDATA } else { 'C:\Users\Mario\AppData\Roaming' }
$sourceConfig = if ($env:CLOUDSDK_CONFIG) { $env:CLOUDSDK_CONFIG } else { Join-Path $roamingData 'gcloud' }
if (-not (Test-Path -LiteralPath (Join-Path $sourceConfig 'configurations'))) {
    throw 'The existing Google Cloud configuration directory was not found.'
}
$sessionParent = 'C:\Users\Mario\AppData\Local\Temp'
$sessionConfig = Join-Path $sessionParent ('sungolog-gcloud-' + [guid]::NewGuid().ToString('N'))
if ($sessionConfig.Contains('{') -or $sessionConfig.Contains('}')) { throw 'SDK session path must not contain braces.' }
New-Item -ItemType Directory -Path $sessionConfig -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceConfig 'configurations') -Destination $sessionConfig -Recurse -Force
foreach ($configFile in @('credentials.db','access_tokens.db','active_config','default_configs.db','config_sentinel','hidden_gcloud_config_universe_descriptor_data_cache_configs.db')) {
    $sourceFile = Join-Path $sourceConfig $configFile
    if (Test-Path -LiteralPath $sourceFile) { Copy-Item -LiteralPath $sourceFile -Destination $sessionConfig -Force }
}
$env:CLOUDSDK_CONFIG = $sessionConfig
$env:CLOUDSDK_CORE_DISABLE_FILE_LOGGING = 'true'
Write-Host 'Google Cloud SDK session configuration prepared. Existing credentials were reused without printing their contents.'
