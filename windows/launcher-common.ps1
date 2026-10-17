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

function Open-ThoughtForkWindow([string]$Url, [string]$BrowserMode = 'Auto', [string]$EdgeExecutable = '') {
    if ($BrowserMode -eq 'Auto') {
        if (Focus-ThoughtForkWindow) { return 'focused' }
        if (-not $EdgeExecutable) { $EdgeExecutable = Find-ThoughtForkEdge }
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
