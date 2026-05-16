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
  $configuredPort = 0
  if ([int]::TryParse($configuredPortValue, [ref]$configuredPort) -and $configuredPort -gt 0) {
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
      ($_.Name -ieq "node.exe" -or $_.Name -ieq "cmd.exe") -and
      $_.CommandLine -and (
        $_.CommandLine -like "*renewal-local-helper.ts*" -or
        $_.CommandLine -like "*renewal-local-helper.cjs*" -or
        $_.CommandLine -like "*renewal-local-helper.mjs*"
      )
    } | Select-Object -First 1
    return $null -ne $process
  } catch {
    return $false
  }
}

function CommandLineContains {
  param(
    [string]$CommandLine,
    [string]$Needle
  )

  if ([string]::IsNullOrWhiteSpace($CommandLine) -or [string]::IsNullOrWhiteSpace($Needle)) {
    return $false
  }

  return $CommandLine.IndexOf($Needle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Wait-LocalRenewalHelperStop {
  param(
    [int]$Port,
    [int]$Attempts = 60,
    [int]$DelayMs = 500
  )

  for ($attempt = 0; $attempt -lt $Attempts; $attempt += 1) {
    if (-not (Test-LocalRenewalHelperRunning -Port $Port)) {
      return $true
    }

    if (($attempt % 5) -eq 0) {
      $elapsed = [math]::Round(($attempt + 1) * $DelayMs / 1000, 1)
      Write-Output "waiting-for-stop=ongoing attempt=$($attempt + 1)/$Attempts elapsedSec=$elapsed"
    }
    Start-Sleep -Milliseconds $DelayMs
  }

  return $false
}

function Wait-LocalRenewalHelperStart {
  param(
    [int]$Port,
    [int]$Attempts = 60,
    [int]$DelayMs = 500
  )

  for ($attempt = 0; $attempt -lt $Attempts; $attempt += 1) {
    if (Test-LocalRenewalHelperRunning -Port $Port) {
      return $true
    }

    if (($attempt % 5) -eq 0) {
      $elapsed = [math]::Round(($attempt + 1) * $DelayMs / 1000, 1)
      Write-Output "waiting-for-start=ongoing attempt=$($attempt + 1)/$Attempts elapsedSec=$elapsed"
    }
    Start-Sleep -Milliseconds $DelayMs
  }

  return $false
}

function Get-LocalRenewalHelperProcessIds {
  param(
    [int]$Port,
    [string[]]$LauncherScriptPaths = @()
  )

  $candidateProcessIds = New-Object System.Collections.Generic.HashSet[int]

  try {
    @(Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess -Unique) | ForEach-Object {
        [void]$candidateProcessIds.Add([int]$_)
      }
  } catch {
    # The helper may no longer be listening. Fall back to process inspection.
  }

  try {
    @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
      $commandLine = $_.CommandLine
      if ([string]::IsNullOrWhiteSpace($commandLine)) {
        return $false
      }

      if (($_.Name -ieq "node.exe" -or $_.Name -ieq "cmd.exe") -and (
        $commandLine.IndexOf("renewal-local-helper.ts", [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        $commandLine.IndexOf("renewal-local-helper.cjs", [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        $commandLine.IndexOf("renewal-local-helper.mjs", [System.StringComparison]::OrdinalIgnoreCase) -ge 0
      )) {
        return $true
      }

      if ($_.Name -ieq "powershell.exe") {
        foreach ($launcherScriptPath in @($LauncherScriptPaths | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
          if (CommandLineContains -CommandLine $commandLine -Needle $launcherScriptPath) {
            return $true
          }
        }
      }

      return $false
    }) | ForEach-Object {
      [void]$candidateProcessIds.Add([int]$_.ProcessId)
    }
  } catch {
    # Ignore process inspection failures and return whatever we already found.
  }

  return @($candidateProcessIds)
}

function Stop-LocalRenewalHelperViaWmi {
  param(
    [int[]]$ProcessIds
  )

  foreach ($processId in @($ProcessIds | Select-Object -Unique)) {
    if ($processId -le 0) {
      continue
    }

    try {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
      if ($process) {
        [void](Invoke-CimMethod -InputObject $process -MethodName Terminate -ErrorAction Stop)
      }
    } catch {
      # Ignore individual WMI termination failures and let the caller verify shutdown.
    }
  }
}

function Stop-LocalRenewalHelperProcessTree {
  param(
    [int[]]$ProcessIds
  )

  Stop-LocalRenewalHelperViaWmi -ProcessIds $ProcessIds

  foreach ($processId in @($ProcessIds | Select-Object -Unique)) {
    if ($processId -le 0) {
      continue
    }

    $taskKillSucceeded = $false
    try {
      & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
      $taskKillSucceeded = ($LASTEXITCODE -eq 0)
    } catch {
      $taskKillSucceeded = $false
    }

    if ($taskKillSucceeded) {
      continue
    }

    try {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    } catch {
      # Ignore individual termination failures and let the caller verify shutdown.
    }
  }
}

function Stop-ExistingLocalRenewalHelper {
  param(
    [int]$Port,
    [string]$TaskName,
    [string[]]$StopScripts,
    [string]$PowerShellExe,
    [string[]]$LauncherScriptPaths
  )

  try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
  } catch {
    # The scheduled task may not currently be running.
  }

  foreach ($stopScript in $StopScripts) {
    if (-not (Test-Path $stopScript)) {
      continue
    }

    try {
      & $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $stopScript 2>$null | Out-Null
    } catch {
      # Ignore stop script failures and fall back to process-based termination below.
    }

    if (Wait-LocalRenewalHelperStop -Port $Port -Attempts 8 -DelayMs 500) {
      return $true
    }
  }

  for ($attempt = 0; $attempt -lt 2; $attempt += 1) {
    $processIds = @(Get-LocalRenewalHelperProcessIds -Port $Port -LauncherScriptPaths $LauncherScriptPaths)
    if ($processIds.Count -eq 0 -and -not (Test-LocalRenewalHelperRunning -Port $Port)) {
      return $true
    }

    Stop-LocalRenewalHelperProcessTree -ProcessIds $processIds
    if (Wait-LocalRenewalHelperStop -Port $Port -Attempts 8 -DelayMs 500) {
      return $true
    }

    Start-Sleep -Milliseconds 250
  }

  return -not (Test-LocalRenewalHelperRunning -Port $Port)
}

function Copy-InstallFilesWithRetry {
  param(
    [string]$SourceRoot,
    [string]$InstallRoot,
    [int]$Attempts = 6,
    [int]$DelayMs = 1000,
    [switch]$AllowLockedRuntimeNode
  )

  $sourceFiles = Get-ChildItem -LiteralPath $SourceRoot -Recurse -File -ErrorAction Stop
  $totalFiles = $sourceFiles.Count
  $copiedCount = 0
  $skippedCount = 0
  $current = 0
  Write-Output "copy-start totalFiles=$totalFiles"

  foreach ($sourceFile in $sourceFiles) {
    $current += 1
    $relativePath = $sourceFile.FullName.Substring($SourceRoot.Length).TrimStart('\', '/')
    $destinationPath = Join-Path $InstallRoot $relativePath
    $lastError = $null
    $copied = $false

    for ($attempt = 0; $attempt -lt $Attempts; $attempt += 1) {
      if ($attempt -eq 0) {
        Write-Output "copying=$current/$totalFiles $relativePath"
      }
      try {
        New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
        Copy-Item -LiteralPath $sourceFile.FullName -Destination $destinationPath -Force
        $copied = $true
        break
      } catch {
        $lastError = $_
        if ($attempt -lt ($Attempts - 1)) {
          Write-Warning "copy-retry file=$relativePath attempt=$($attempt + 1)/$Attempts delayMs=$DelayMs"
          Start-Sleep -Milliseconds $DelayMs
        }
      }
    }

    if ($copied) {
      $copiedCount += 1
      continue
    }

    if ($AllowLockedRuntimeNode -and $relativePath -ieq "runtime\node.exe") {
      $skippedCount += 1
      Write-Output "copy-skipped=runtime\\node.exe (in use)"
      Write-Warning "Skipping runtime\\node.exe replacement because the helper runtime is still in use. The new helper will fully activate after the old process exits."
      continue
    }

    if ($lastError) {
      throw $lastError
    }
  }

  Write-Output "copy-complete copied=$copiedCount skipped=$skippedCount total=$totalFiles"
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
$restartRequired = $false
$stopScriptCandidates = @(
  (Join-Path $installRoot "scripts\\stop-renewal-local-helper.ps1"),
  (Join-Path $sourceRoot "scripts\\stop-renewal-local-helper.ps1")
) | Select-Object -Unique
$launcherScriptCandidates = @(
  (Join-Path $installRoot "scripts\\start-renewal-local-helper.ps1"),
  (Join-Path $sourceRoot "scripts\\start-renewal-local-helper.ps1")
) | Select-Object -Unique

if (Test-LocalRenewalHelperRunning -Port $helperPort) {
  Write-Output "running-detected=true"
  $stopped = $false
  if ($PSCmdlet.ShouldProcess("AUTO-TAX renewal helper", "Stop running helper before reinstall")) {
    $stopped = Stop-ExistingLocalRenewalHelper `
      -Port $helperPort `
      -TaskName $taskName `
      -StopScripts $stopScriptCandidates `
      -PowerShellExe $powershellExe `
      -LauncherScriptPaths $launcherScriptCandidates
  } elseif ($WhatIfPreference) {
    $stopped = $true
  }

  if (-not $stopped -and -not $WhatIfPreference) {
    Write-Warning "Failed to stop the running AUTO-TAX helper automatically. The install will continue, but the updated helper will not take effect until the current process exits or Windows is restarted."
    $restartRequired = $true
  }
}

if ($isPackagedInstall -and ($sourceRoot -ne $installRoot)) {
  if ($PSCmdlet.ShouldProcess($installRoot, "Copy packaged renewal helper files to stable install location")) {
    Copy-InstallFilesWithRetry -SourceRoot $sourceRoot -InstallRoot $installRoot -AllowLockedRuntimeNode:$restartRequired
  }
}

$launcherScript = Join-Path $installRoot "scripts\\start-renewal-local-helper.ps1"
$stopScript = Join-Path $installRoot "scripts\\stop-renewal-local-helper.ps1"
$statusScript = Join-Path $installRoot "scripts\\status-renewal-local-helper.ps1"
$uninstallScript = Join-Path $installRoot "scripts\\uninstall-renewal-local-helper-autostart.ps1"
$currentUser = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\$($env:USERNAME)" } else { $env:USERNAME }
$desktopPath = [Environment]::GetFolderPath("Desktop")

if (-not (Test-Path $launcherScript)) {
  throw "Helper launcher script not found: $launcherScript"
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
    -Description "AUTO-TAX local certificate helper autostart" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Force | Out-Null
}

if ($StartNow -and -not $restartRequired -and $PSCmdlet.ShouldProcess("AUTO-TAX renewal helper", "Start helper immediately after install")) {
  & $powershellExe -NoProfile -ExecutionPolicy Bypass -File $launcherScript -Detached | Out-Null
  $started = [bool](Wait-LocalRenewalHelperStart -Port $helperPort)
  Write-Output "startResult=$(if ($started) { 'running' } else { 'timeout' })"
}

if (-not $SkipDesktopShortcuts) {
  $shortcutTargets = @(
    @{
      Name = "AUTO-TAX Helper Start.lnk"
      Target = $powershellExe
      Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcherScript`" -Detached"
      Description = "AUTO-TAX local certificate helper start"
    },
    @{
      Name = "AUTO-TAX Helper Stop.lnk"
      Target = $powershellExe
      Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$stopScript`""
      Description = "AUTO-TAX local certificate helper stop"
    },
    @{
      Name = "AUTO-TAX Helper Status.lnk"
      Target = $powershellExe
      Arguments = "-NoProfile -NoExit -ExecutionPolicy Bypass -File `"$statusScript`""
      Description = "AUTO-TAX local certificate helper status"
    },
    @{
      Name = "AUTO-TAX Helper Disable Autostart.lnk"
      Target = $powershellExe
      Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$uninstallScript`""
      Description = "AUTO-TAX local certificate helper disable autostart"
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
Write-Output "restartRequired=$(if ($restartRequired) { 'true' } else { 'false' })"
Write-Output "startDeferred=$(if ($restartRequired -and $StartNow) { 'true' } else { 'false' })"
