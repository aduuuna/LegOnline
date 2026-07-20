# Points Asterisk's advertised addresses at this PC's *current* LAN IP.
# Run this whenever the PC changes networks (new WiFi, hotspot, DHCP renewal),
# then re-register in the app. The app side needs nothing — it auto-detects
# the PC's IP from the Metro dev-server connection.
$ErrorActionPreference = "Stop"
$serverDir = $PSScriptRoot

# The interface that owns the default route is the one other devices reach us on.
$route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -AddressFamily IPv4 |
  Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1
$lanIp = (Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 |
  Select-Object -First 1).IPAddress
$containerIp = docker inspect legonline-asterisk --format "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}"
if (-not $lanIp) { throw "Could not determine this PC's LAN IP." }
if (-not $containerIp) { throw "Could not determine the Asterisk container's IP - is legonline-asterisk running?" }
Write-Host "LAN IP: $lanIp   container IP: $containerIp"

$enc = New-Object System.Text.UTF8Encoding($false)

$pjsip = "$serverDir\asterisk\pjsip.conf"
$t = [System.IO.File]::ReadAllText($pjsip)
$t = $t -replace "(?m)^external_media_address = .+$", "external_media_address = $lanIp"
$t = $t -replace "(?m)^external_signaling_address = .+$", "external_signaling_address = $lanIp"
[System.IO.File]::WriteAllText($pjsip, $t, $enc)

$rtp = "$serverDir\asterisk\rtp.conf"
$t = [System.IO.File]::ReadAllText($rtp)
$t = $t -replace "(?m)^[0-9.]+ => [0-9.]+$", "$containerIp => $lanIp"
[System.IO.File]::WriteAllText($rtp, $t, $enc)

Write-Host "Config updated. Restarting Asterisk ..."
docker restart legonline-asterisk | Out-Null
Write-Host "Done - register the app against ws://${lanIp}:8088/ws (it will prefill this automatically)."
