# Sync shared/engine -> browser and Edge Function copies.
# Edit only shared/engine/, then run this script.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'shared\engine'
$dests = @(
  (Join-Path $root 'assets\js\game\engine'),
  (Join-Path $root 'supabase\functions\_shared\engine')
)

if (-not (Test-Path $src)) {
  Write-Error "Source not found: $src"
}

foreach ($dest in $dests) {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Get-ChildItem -Path $src -Filter '*.mjs' | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $dest $_.Name) -Force
  }
  Write-Host "Synced -> $dest"
}

Write-Host 'Done.'
