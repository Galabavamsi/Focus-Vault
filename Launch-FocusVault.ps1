$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $PSScriptRoot

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "dist\index.html"))) {
  npm run build
}

& (Join-Path $PSScriptRoot "node_modules\.bin\electron.cmd") $PSScriptRoot
