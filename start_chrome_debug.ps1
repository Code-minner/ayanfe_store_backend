# Start your REAL Chrome with remote debugging so Google login works.
# Close all Chrome windows first, then run this script.
# After you pass Cloudflare (+ optional login), run:
#   python download_product_images.py --connect

$chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) {
  $chrome = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chrome)) {
  Write-Error "Google Chrome not found."
  exit 1
}

$userData = Join-Path $PSScriptRoot "chrome_debug_profile"
New-Item -ItemType Directory -Force -Path $userData | Out-Null

Write-Host "Starting Chrome (debug port 9222)..."
Write-Host "1) Pass Cloudflare"
Write-Host "2) Sign in if you want (this is a normal Chrome, Google should allow it)"
Write-Host "3) Leave Chrome open"
Write-Host "4) In another terminal: python download_product_images.py --connect"
Write-Host ""

Start-Process -FilePath $chrome -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$userData",
  "https://ayanfettogracious.com/"
)
