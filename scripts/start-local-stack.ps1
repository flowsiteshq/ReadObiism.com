$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$worker = Join-Path $root 'worker'
$logs = Join-Path $worker '.wrangler\local-stack-logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
function Is-Listening([int]$port) {
  return [bool](netstat -ano -p tcp | Select-String -Pattern "^\s*TCP\s+127\.0\.0\.1:$port\s+\S+\s+LISTENING\s+")
}
$line = Get-Content (Join-Path $worker '.dev.vars') | Where-Object { $_ -match '^OBI_MYSQL_LOCAL_SYNC_SECRET=' }
if (@($line).Count -ne 1) { throw 'Local sync secret missing or duplicated in worker/.dev.vars.' }
$env:OBI_MYSQL_LOCAL_SYNC_SECRET = $line.Substring($line.IndexOf('=') + 1)
$env:OBI_MYSQL_LOCAL_ENABLED = '1'
$env:API_ORIGIN = 'http://127.0.0.1:8899'
$env:OBI_ALLOW_LOOPBACK_ORIGINS = '1'
Remove-Item Env:OBI_FIVE_SERVER_ORIGIN -ErrorAction SilentlyContinue
if (-not (Is-Listening 8799)) {
  $cli = Join-Path $worker 'node_modules\wrangler\bin\wrangler.js'
  if (-not (Test-Path -LiteralPath $cli)) { throw 'Worker dependencies missing. Run npm install inside the worker folder.' }
  Start-Process node.exe -ArgumentList @(('"' + $cli + '"'), 'dev', '--local', '--port', '8799', '--ip', '127.0.0.1', '--persist-to', '.wrangler/rebuild-state') -WorkingDirectory $worker -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'worker.out.log') -RedirectStandardError (Join-Path $logs 'worker.err.log')
}
if (-not (Is-Listening 8899)) {
  Start-Process 'C:\xampp\php\php.exe' -ArgumentList '-S','127.0.0.1:8899','api/local-php-bridge.php' -WorkingDirectory $worker -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'php.out.log') -RedirectStandardError (Join-Path $logs 'php.err.log')
}
if (-not (Is-Listening 5514)) {
  Start-Process node.exe -ArgumentList @('scripts/dev-proxy.mjs', '"."') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'proxy.out.log') -RedirectStandardError (Join-Path $logs 'proxy.err.log')
  Start-Process 'C:\xampp\php\php.exe' -ArgumentList 'api/retry-local-account-sync.php','--watch' -WorkingDirectory $worker -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'retry.out.log') -RedirectStandardError (Join-Path $logs 'retry.err.log')
}
Write-Output 'Local services requested. Open http://127.0.0.1:5514/. Check worker/.wrangler/local-stack-logs if a service fails.'
