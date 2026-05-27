[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$RemoveInstallRoot
)

$ErrorActionPreference = "Stop"

$taskName = "AUTO-TAX Renewal Local Helper"
$uninstallKeyPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AUTO-TAX Renewal Local Helper"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$expectedInstallRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "AUTO-TAX\\renewal-local-helper"))
$shortcutNames = @(
  "AUTO-TAX Helper Start.lnk",
  "AUTO-TAX Helper Stop.lnk",
  "AUTO-TAX Helper Status.lnk",
  "AUTO-TAX Helper Disable Autostart.lnk"
)
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($RemoveInstallRoot -and $installRoot -ine $expectedInstallRoot) {
  throw "Refusing to remove unexpected AT helper install root: $installRoot"
}

function Remove-HelperShortcuts {
  param(
    [string[]]$Names
  )

  foreach ($shortcutName in $Names) {
    $shortcutPath = Join-Path $desktopPath $shortcutName
    if (Test-Path $shortcutPath) {
      Remove-Item -LiteralPath $shortcutPath -Force
    }
  }
}

if ($existingTask -and $PSCmdlet.ShouldProcess($taskName, "Unregister renewal local helper scheduled task")) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

if ($RemoveInstallRoot) {
  $stopScript = Join-Path $scriptDir "stop-renewal-local-helper.ps1"
  if (Test-Path $stopScript) {
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript | Out-Null
    } catch {
      Write-Warning "Failed to stop AT helper before uninstall: $($_.Exception.Message)"
    }
  }

  Remove-HelperShortcuts -Names $shortcutNames

  if ($PSCmdlet.ShouldProcess($uninstallKeyPath, "Remove Windows uninstall entry")) {
    Remove-Item -Path $uninstallKeyPath -Recurse -Force -ErrorAction SilentlyContinue
  }

  if ($PSCmdlet.ShouldProcess($installRoot, "Remove AT helper install files")) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
} else {
  Remove-HelperShortcuts -Names @("AUTO-TAX Helper Disable Autostart.lnk")
}

Write-Output "taskName=$taskName"
Write-Output "status=$(if ($existingTask) { 'removed' } else { 'absent' })"
Write-Output "installRoot=$installRoot"
Write-Output "installRootRemoved=$(if ($RemoveInstallRoot) { 'true' } else { 'false' })"
