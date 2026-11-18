# Sync current LAN IPv4 into miniprogram/utils/config.js
#
# Why: phone hotspot / WiFi changes reassign the PC's IP (sometimes the whole subnet).
# The mini program cannot discover the PC on the LAN (WeChat gives no discovery API),
# so the PC side has to write its real address into the config before startup.
#
# Called by start-backend.cmd. Can also run manually:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sync-ip.ps1
#
# NOTE: keep this file pure ASCII. Windows PowerShell 5.1 reads .ps1 as ANSI(GBK),
# so Chinese text without a BOM breaks the parser.

$ErrorActionPreference = 'Stop'

# 1. pick LAN IPv4: prefer WLAN/Wi-Fi, skip virtual adapters and VPNs
$cands = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike '127.*' -and
    $_.IPAddress -notlike '169.254.*' -and
    $_.InterfaceAlias -notlike '*vEthernet*' -and
    $_.InterfaceAlias -notlike '*VPN*' -and
    $_.InterfaceAlias -notlike '*Loopback*'
}
$ip = ($cands | Where-Object { $_.InterfaceAlias -match 'WLAN|Wi-Fi' } | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = ($cands | Select-Object -First 1).IPAddress }
if (-not $ip) {
    Write-Host "[sync-ip] no LAN IPv4 found, skip (config.js keeps the old address)"
    exit 0
}

# 2. rewrite http://x.x.x.x:8080 in miniprogram/utils/config.js
$cfg = Join-Path $PSScriptRoot '..\miniprogram\utils\config.js'
$cfg = [System.IO.Path]::GetFullPath($cfg)
if (-not (Test-Path $cfg)) {
    Write-Host "[sync-ip] config.js not found: $cfg"
    exit 1
}

$text = [System.IO.File]::ReadAllText($cfg)
$new = [regex]::Replace($text, 'http://\d{1,3}(?:\.\d{1,3}){3}:8080', "http://${ip}:8080")

if ($new -ne $text) {
    # UTF-8 without BOM: a BOM would make the first comment line part of the code
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($cfg, $new, $utf8)
    Write-Host "[sync-ip] config.js updated -> $ip"
} else {
    Write-Host "[sync-ip] config.js already $ip"
}
Write-Host "[sync-ip] mini program should connect to http://${ip}:8080"
