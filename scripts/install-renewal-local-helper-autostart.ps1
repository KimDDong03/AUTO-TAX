[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$StartNow,
  [switch]$SkipDesktopShortcuts
)

$ErrorActionPreference = "Stop"

function Get-HelperPort {
  $configuredPortValue = if ([string]::IsNullOrWhiteSpace($env:AUTO_TAX_RENEWAL_HELPER_PORT)) {
    "35119"
  } else {
    $env:AUTO_TAX_RENEWAL_HELPER_PORT
  }
  $configuredPort = [int]$configuredPortValue
  if ($configuredPort -gt 0) {
    return $configuredPort
  }

  return 35119
}

function Test-LocalRenewalHelperRunning {
  param(
    [int]$Port
  )

  try {
    $listener = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -First 1
    if ($listener) {
      return $true
    }
  } catch {
    # Port listener not found, fall back to health probe.
  }

  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -Method Get -TimeoutSec 2
    return $response.ok -eq $true
  } catch {
    # Health probe failed, fall back to process inspection.
  }

  try {
    $process = Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
      $_.CommandLine -and (
        $_.CommandLine -like "*renewal-local-helper.ts*" -or
        $_.CommandLine -like "*start-renewal-local-helper.ps1*"
      )
    } | Select-Object -First 1
    return $null -ne $process
  } catch {
    return $false
  }
}

function Wait-LocalRenewalHelperStop {
  param(
    [int]$Port,
    [int]$Attempts = 20,
    [int]$DelayMs = 500
  )

  for ($attempt = 0; $attempt -lt $Attempts; $attempt += 1) {
    if (-not (Test-LocalRenewalHelperRunning -Port $Port)) {
      return $true
    }

    Start-Sleep -Milliseconds $DelayMs
  }

  return $false
}

$sourceRoot = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..")).Path
$packageAppMarker = Join-Path $sourceRoot "app\\renewal-local-helper.cjs"
$legacyPackageAppMarker = Join-Path $sourceRoot "app\\renewal-local-helper.mjs"
$defaultInstallRoot = Join-Path $env:LOCALAPPDATA "AUTO-TAX\\renewal-local-helper"
$isPackagedInstall = (Test-Path $packageAppMarker) -or (Test-Path $legacyPackageAppMarker)
$installRoot = if ($isPackagedInstall) { $defaultInstallRoot } else { $sourceRoot }
$taskName = "AUTO-TAX Renewal Local Helper"
$powershellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
$helperPort = Get-HelperPort
$stopScriptCandidates = @(
  (Join-Path $installRoot "scripts\\stop-renewal-local-helper.ps1"),
  (Join-Path $sourceRoot "scripts\\stop-renewal-local-helper.ps1")
) | Select-Object -Unique

if (Test-LocalRenewalHelperRunning -Port $helperPort) {
  $stopped = $false
  foreach ($stopScript in $stopScriptCandidates) {
    if (-not (Test-Path $stopScript)) {
      continue
    }

    if ($PSCmdlet.ShouldProcess("AUTO-TAX renewal helper", "Stop running helper before reinstall")) {
      & $powershellExe -NoProfile -ExecutionPolicy Bypass -File $stopScript | Out-Null
    } elseif ($WhatIfPreference) {
      $stopped = $true
      break
    }

    if (Wait-LocalRenewalHelperStop -Port $helperPort) {
      $stopped = $true
      break
    }
  }

  if (-not $stopped -and -not $WhatIfPreference) {
    throw "기존 로컬 헬퍼를 종료하지 못했습니다. 바탕화면의 AUTO-TAX Helper Stop을 먼저 실행한 뒤 다시 설치하세요."
  }
}

if ($isPackagedInstall -and ($sourceRoot -ne $installRoot)) {
  if ($PSCmdlet.ShouldProcess($installRoot, "Copy packaged renewal helper files to stable install location")) {
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    Copy-Item -Path (Join-Path $sourceRoot "*") -Destination $installRoot -Recurse -Force
  }
}

$launcherScript = Join-Path $installRoot "scripts\\start-renewal-local-helper.ps1"
$stopScript = Join-Path $installRoot "scripts\\stop-renewal-local-helper.ps1"
$statusScript = Join-Path $installRoot "scripts\\status-renewal-local-helper.ps1"
$uninstallScript = Join-Path $installRoot "scripts\\uninstall-renewal-local-helper-autostart.ps1"
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
