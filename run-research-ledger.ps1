Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is not installed or is not on PATH." -ForegroundColor Red
  Write-Host "Install Node.js 18 or newer and try again."
  Read-Host "Press Enter to close"
  exit 1
}
node server.js --open
