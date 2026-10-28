Set-StrictMode -Version Latest

function Get-ThoughtForkIdentity([string]$ProjectRoot) {
    $normalized = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\', '/').Replace('\', '/').ToLowerInvariant()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalized)))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Get-ThoughtForkHealth([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri ($Url + '/api/health') -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) { return ($response.Content | ConvertFrom-Json) }
    } catch { }
    return $null
}

function Test-ThoughtForkPort([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try { $pending = $client.BeginConnect('127.0.0.1', $Port, $null, $null); if (-not $pending.AsyncWaitHandle.WaitOne(700)) { return $false }; $client.EndConnect($pending); return $true }
    catch { return $false } finally { $client.Dispose() }
}

function Find-ThoughtForkNode([string]$Override) {
    if ($Override) { if (Test-Path -LiteralPath $Override -PathType Leaf) { return (Get-Item -LiteralPath $Override).FullName }; throw 'Node.js was not found at the requested path. Install Node.js 20 or newer, then run thoughtFork again.' }
    $command = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    foreach ($candidate in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw 'Node.js is not installed or could not be found. Install Node.js 20 or newer from nodejs.org, then open thoughtFork again.'
}

function Find-ThoughtForkEdge {
    $command = Get-Command msedge.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    foreach ($candidate in @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe")) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

function Focus-ThoughtForkWindow {
    if (-not ('ThoughtFork.NativeWindow' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace ThoughtFork {
 public static class NativeWindow {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
 }
}
'@
    }
    $handle = [ThoughtFork.NativeWindow]::FindWindow('Chrome_WidgetWin_1', 'thoughtFork')
    if ($handle -eq [IntPtr]::Zero) { return $false }
    [void][ThoughtFork.NativeWindow]::ShowWindow($handle, 9)
    return [ThoughtFork.NativeWindow]::SetForegroundWindow($handle)
}

function Open-ThoughtForkWindow([string]$Url, [string]$BrowserMode = 'Auto', [string]$EdgeExecutable = '', [string]$ProjectRoot = '') {
    if ($BrowserMode -eq 'Auto') {
        if (-not $ProjectRoot -and (Focus-ThoughtForkWindow)) { return 'focused' }
        if (-not $EdgeExecutable) { $EdgeExecutable = Find-ThoughtForkEdge }
        if ($EdgeExecutable -and $ProjectRoot) { return Open-ThoughtForkIdentifiedWindow -Url $Url -ProjectRoot $ProjectRoot -EdgeExecutable $EdgeExecutable }
        if ($EdgeExecutable) {
            try { Start-Process -FilePath $EdgeExecutable -ArgumentList @("--app=$Url") -ErrorAction Stop | Out-Null; return 'edge' }
            catch { } # A browser installation may be missing or restricted; use the registered browser.
        }
    }
    Start-Process -FilePath $Url -ErrorAction Stop | Out-Null
    return 'browser'
}

function Show-ThoughtForkError([string]$Message) {
    try { Add-Type -AssemblyName System.Windows.Forms; [void][Windows.Forms.MessageBox]::Show($Message, 'thoughtFork could not open', 'OK', 'Error') }
    catch { Write-Error $Message }
}

function Initialize-ThoughtForkShellIdentity {
    if (-not ('ThoughtFork.ShellIdentity' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'shell-identity.cs') }
}
function Get-ThoughtForkAppId([string]$ProjectRoot) { return 'org.thoughtFork.local.' + (Get-ThoughtForkIdentity $ProjectRoot).Substring(0,24) }
function Set-ThoughtForkShortcutIdentity([string]$File, [string]$ProjectRoot) {
    Initialize-ThoughtForkShellIdentity
    [ThoughtFork.ShellIdentity]::SetShortcut($File, (Get-ThoughtForkAppId $ProjectRoot))
}
function Open-ThoughtForkIdentifiedWindow([string]$Url, [string]$ProjectRoot, [string]$EdgeExecutable, [string]$ProfileDirectory = '') {
    Initialize-ThoughtForkShellIdentity
    $appId = Get-ThoughtForkAppId $ProjectRoot
    $before = @([ThoughtFork.ShellIdentity]::Windows())
    foreach ($handle in $before) {
        if ([ThoughtFork.ShellIdentity]::WindowId($handle) -eq $appId) { [void][ThoughtFork.ShellIdentity]::Focus($handle); return 'focused' }
    }
    $arguments = @("--app=$Url")
    if ($ProfileDirectory) { $arguments += @('--user-data-dir="' + $ProfileDirectory + '"', '--no-first-run', '--no-default-browser-check') }
    Start-Process -FilePath $EdgeExecutable -ArgumentList $arguments -ErrorAction Stop | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        $new = @([ThoughtFork.ShellIdentity]::Windows() | Where-Object { $_ -notin $before })
        if ($new.Count -eq 1) {
            $command = '"' + (Join-Path $env:SystemRoot 'System32\wscript.exe') + '" //nologo "' + (Join-Path $ProjectRoot 'launch-thoughtfork.vbs') + '"'
            $icon = (Join-Path $ProjectRoot 'public\icons\thoughtfork.ico') + ',0'
            [ThoughtFork.ShellIdentity]::SetWindow($new[0], $appId, $command, $icon)
            if ([ThoughtFork.ShellIdentity]::WindowId($new[0]) -ne $appId) { throw 'The thoughtFork window identity could not be verified.' }
            return 'edge'
        }
        Start-Sleep -Milliseconds 150
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Edge opened, but thoughtFork could not identify exactly one new app window for taskbar grouping. Close duplicate thoughtFork windows and relaunch. The notebook server remains safe.'
}
