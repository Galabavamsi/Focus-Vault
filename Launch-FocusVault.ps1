$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $PSScriptRoot

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "dist\index.html"))) {
  npm run build
}

$electronExe = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"
$electronCmd = Join-Path $PSScriptRoot "node_modules\.bin\electron.cmd"

if (Test-Path -LiteralPath $electronExe) {
  Start-Process -FilePath $electronExe -ArgumentList "`"$PSScriptRoot`"" -WorkingDirectory $PSScriptRoot
  exit
}

Start-Process -FilePath $electronCmd -ArgumentList "`"$PSScriptRoot`"" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
