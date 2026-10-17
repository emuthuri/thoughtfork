[CmdletBinding()]
param([switch]$Desktop, [switch]$RemoveShortcuts, [switch]$ShowDialog,
      [string]$StartMenuDirectory = [Environment]::GetFolderPath('Programs'),
      [string]$DesktopDirectory = [Environment]::GetFolderPath('DesktopDirectory'))
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows\launcher-common.ps1')
$shell = $null
try {
    $launcher = Join-Path $PSScriptRoot 'launch-thoughtfork.vbs'
    if (-not $RemoveShortcuts -and -not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'The thoughtFork launcher is missing. Extract the complete application folder before setup.' }
    $shell = New-Object -ComObject WScript.Shell
    $signature = 'thoughtFork local application launcher | '
    $locations = @($StartMenuDirectory); if ($Desktop -or $RemoveShortcuts) { $locations += $DesktopDirectory }
    foreach ($folder in ($locations | Select-Object -Unique)) {
        if (-not $folder) { throw 'Windows could not locate the current-user shortcut folder.' }
        $file = Join-Path $folder 'thoughtFork.lnk'
        if (Test-Path -LiteralPath $file) {
            $old = $shell.CreateShortcut($file)
            if (-not $old.Description.StartsWith($signature) -or [IO.Path]::GetFileName($old.TargetPath) -ine 'wscript.exe' -or $old.Arguments -notmatch 'launch-thoughtfork\.vbs"?$') { throw "A different shortcut already occupies $file. It was left unchanged." }
        }
        if ($RemoveShortcuts) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }; continue }
        [void][IO.Directory]::CreateDirectory($folder)
        $link = $shell.CreateShortcut($file)
        $link.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
        $link.Arguments = '//nologo "' + $launcher + '"'
        $link.WorkingDirectory = $PSScriptRoot
        $link.Description = $signature + (Get-ThoughtForkIdentity $PSScriptRoot)
        $link.IconLocation = (Join-Path $PSScriptRoot 'public\icons\thoughtfork.ico') + ',0'
        $link.WindowStyle = 7
        $link.Save()
    }
    if ($RemoveShortcuts) { Write-Output 'Removed thoughtFork-owned shortcuts only. Application and research files are unchanged.' } else { Write-Output 'thoughtFork shortcuts are ready. No research files were changed.' }
} catch { if ($ShowDialog) { Show-ThoughtForkError $_.Exception.Message } else { [Console]::Error.WriteLine($_.Exception.Message) }; exit 1 }
finally { if ($shell) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) } }
