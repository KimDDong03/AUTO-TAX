[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = "Stop"

$taskName = "AUTO-TAX Renewal Local Helper"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutNames = @(
  "AUTO-TAX Helper Start.lnk",
  "AUTO-TAX Helper Stop.lnk",
  "AUTO-TAX Helper Status.lnk",
  "AUTO-TAX Helper Disable Autostart.lnk"
)
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if (-not $existingTask) {
  foreach ($shortcutName in $shortcutNames) {
    $shortcutPath = Join-Path $desktopPath $shortcutName
    if (Test-Path $shortcutPath) {
      Remove-Item -LiteralPath $shortcutPath -Force
    }
  }
  Write-Output "taskName=$taskName"
  Write-Output "status=absent"
  exit 0
}

if ($PSCmdlet.ShouldProcess($taskName, "Unregister renewal local helper scheduled task")) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

foreach ($shortcutName in $shortcutNames) {
  $shortcutPath = Join-Path $desktopPath $shortcutName
  if (Test-Path $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
  }
}

Write-Output "taskName=$taskName"
Write-Output "status=removed"
