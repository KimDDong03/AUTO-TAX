[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$StartNow,
  [switch]$SkipDesktopShortcuts
)

$ErrorActionPreference = "Stop"

$sourceRoot = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..")).Path
$packageAppMarker = Join-Path $sourceRoot "app\\renewal-local-helper.cjs"
$legacyPackageAppMarker = Join-Path $sourceRoot "app\\renewal-local-helper.mjs"
$defaultInstallRoot = Join-Path $env:LOCALAPPDATA "AUTO-TAX\\renewal-local-helper"
$isPackagedInstall = (Test-Path $packageAppMarker) -or (Test-Path $legacyPackageAppMarker)
$installRoot = if ($isPackagedInstall) { $defaultInstallRoot } else { $sourceRoot }

if ($isPackagedInstall -and ($sourceRoot -ne $installRoot)) {
  if ($PSCmdlet.ShouldProcess($installRoot, "Copy packaged renewal helper files to stable install location")) {
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    Copy-Item -Path (Join-Path $sourceRoot "*") -Destination $installRoot -Recurse -Force
  }
}

$taskName = "AUTO-TAX Renewal Local Helper"
$launcherScript = Join-Path $installRoot "scripts\\start-renewal-local-helper.ps1"
$stopScript = Join-Path $installRoot "scripts\\stop-renewal-local-helper.ps1"
$statusScript = Join-Path $installRoot "scripts\\status-renewal-local-helper.ps1"
$uninstallScript = Join-Path $installRoot "scripts\\uninstall-renewal-local-helper-autostart.ps1"
$powershellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
$currentUser = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\$($env:USERNAME)" } else { $env:USERNAME }
$desktopPath = [Environment]::GetFolderPath("Desktop")

if (-not (Test-Path $launcherScript)) {
  throw "시작 스크립트를 찾지 못했습니다: $launcherScript"
}

$action = New-ScheduledTaskAction `
  -Execute $powershellExe `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherScript`" -Detached" `
  -WorkingDirectory $installRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable

if ($PSCmdlet.ShouldProcess($taskName, "Register renewal local helper scheduled task")) {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Description "AUTO-TAX 고객용 로컬 공동인증서 헬퍼 자동 실행" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Force | Out-Null
}

if ($StartNow -and $PSCmdlet.ShouldProcess($taskName, "Start renewal local helper scheduled task")) {
  Start-ScheduledTask -TaskName $taskName
}

if (-not $SkipDesktopShortcuts) {
  $shortcutTargets = @(
    @{
      Name = "AUTO-TAX Helper Start.lnk"
      Target = $powershellExe
      Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcherScript`" -Detached"
      Description = "AUTO-TAX 로컬 공동인증서 헬퍼 시작"
    },
    @{
      Name = "AUTO-TAX Helper Stop.lnk"
      Target = $powershellExe
      Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$stopScript`""
      Description = "AUTO-TAX 로컬 공동인증서 헬퍼 종료"
    },
    @{
      Name = "AUTO-TAX Helper Status.lnk"
      Target = $powershellExe
      Arguments = "-NoProfile -NoExit -ExecutionPolicy Bypass -File `"$statusScript`""
      Description = "AUTO-TAX 로컬 공동인증서 헬퍼 상태 확인"
    },
    @{
      Name = "AUTO-TAX Helper Disable Autostart.lnk"
      Target = $powershellExe
      Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$uninstallScript`""
      Description = "AUTO-TAX 로컬 공동인증서 헬퍼 로그인 자동실행만 해제"
    }
  )

  $wshShell = New-Object -ComObject WScript.Shell
  foreach ($shortcut in $shortcutTargets) {
    if (-not (Test-Path $shortcut.Target)) {
      continue
    }

    $shortcutPath = Join-Path $desktopPath $shortcut.Name
    if (-not $PSCmdlet.ShouldProcess($shortcutPath, "Create desktop shortcut")) {
      continue
    }
    $shellShortcut = $wshShell.CreateShortcut($shortcutPath)
    $shellShortcut.TargetPath = $shortcut.Target
    $shellShortcut.Arguments = $shortcut.Arguments
    $shellShortcut.WorkingDirectory = $installRoot
    $shellShortcut.Description = $shortcut.Description
    $shellShortcut.IconLocation = "$powershellExe,0"
    $shellShortcut.Save()
  }
}

Write-Output "taskName=$taskName"
Write-Output "sourceRoot=$sourceRoot"
Write-Output "installRoot=$installRoot"
Write-Output "launcherScript=$launcherScript"
Write-Output "currentUser=$currentUser"
Write-Output "desktopShortcuts=$(if ($SkipDesktopShortcuts) { 'skipped' } else { 'created' })"
