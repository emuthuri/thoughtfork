[CmdletBinding()]
param(
    [ValidateRange(1024,65535)][int]$Port = 4173,
    [ValidateSet('Auto','Browser')][string]$BrowserMode = 'Auto',
    [string]$NodePath,
    [switch]$NoBrowser,
    [switch]$NoErrorDialog,
    [switch]$PassThru
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'launcher-common.ps1')
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$url = "http://127.0.0.1:$Port"
$mutex = $null; $ownsMutex = $false; $started = $false; $serverProcess = $null
try {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'server.js') -PathType Leaf)) { throw 'The thoughtFork application is incomplete. Keep the launcher inside the downloaded project folder.' }
    $identity = Get-ThoughtForkIdentity $projectRoot
    $mutex = New-Object Threading.Mutex($false, ('Local\thoughtFork-launch-' + $identity))
    try { $ownsMutex = $mutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { throw 'Another thoughtFork launch is still starting. Wait a moment, then try again.' }
    $health = Get-ThoughtForkHealth $url
    if ($health) {
        if ($health.application -ne 'thoughtFork' -or $health.launchProtocol -ne 1 -or $health.projectId -ne $identity) { throw "Port $Port belongs to another application or another thoughtFork copy. No process was stopped. Close that server normally, or use the matching project shortcut." }
    } else {
        if (Test-ThoughtForkPort $Port) { throw "Port $Port is already in use, possibly by an older Research Ledger/Threadmark server. Stop that server normally with Ctrl+C and reopen thoughtFork. No duplicate writer was started and no existing process was stopped." }
        $node = Find-ThoughtForkNode $NodePath
        $version = (& $node --version 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 20) { throw 'thoughtFork needs Node.js 20 or newer. Update Node.js from nodejs.org and try again.' }
        $logDir = Join-Path $env:LOCALAPPDATA 'thoughtFork\logs'
        [void][IO.Directory]::CreateDirectory($logDir)
        $stdout = Join-Path $logDir ($identity + '.out.log'); $stderr = Join-Path $logDir ($identity + '.error.log')
        foreach ($log in @($stdout,$stderr)) { if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1MB) { Move-Item -LiteralPath $log -Destination ($log + '.previous') -Force } }
        $priorPort = $env:PORT
        try { $env:PORT = [string]$Port; $serverProcess = Start-Process -FilePath $node -ArgumentList @('"' + (Join-Path $projectRoot 'server.js') + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru }
        finally { $env:PORT = $priorPort }
        $started = $true; $deadline = [DateTime]::UtcNow.AddSeconds(25)
        do {
            $health = Get-ThoughtForkHealth $url
            if ($health -and $health.application -eq 'thoughtFork' -and $health.launchProtocol -eq 1 -and $health.projectId -eq $identity) { break }
            $serverProcess.Refresh()
            if ($serverProcess.HasExited) { $detail = if (Test-Path -LiteralPath $stderr) { (Get-Content -LiteralPath $stderr -Tail 12) -join [Environment]::NewLine } else { '' }; throw "The thoughtFork server exited before it was ready. An existing writer may own this notebook. No writer protection was bypassed.`n$detail`nStartup logs: $logDir" }
            Start-Sleep -Milliseconds 180
        } while ([DateTime]::UtcNow -lt $deadline)
        if (-not $health -or $health.application -ne 'thoughtFork' -or $health.projectId -ne $identity) { throw "thoughtFork did not become ready within 25 seconds. Check $stderr. The launcher did not terminate any process; resolve the startup problem before retrying." }
    }
    $window = if ($NoBrowser) { 'none' } else { Open-ThoughtForkWindow -Url $url -BrowserMode $BrowserMode -ProjectRoot $projectRoot }
    if ($PassThru) { [pscustomobject]@{ Started=$started; Url=$url; ServerPid=$health.pid; Window=$window; Mode=$health.mode; ProjectId=$identity } | ConvertTo-Json -Compress }
} catch {
    if ($NoErrorDialog) { [Console]::Error.WriteLine($_.Exception.Message) } else { Show-ThoughtForkError $_.Exception.Message }
    exit 1
} finally { if ($ownsMutex) { $mutex.ReleaseMutex() }; if ($mutex) { $mutex.Dispose() } }
