[CmdletBinding(SupportsShouldProcess = $true)]
param()

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

function Test-LocalTcpPortOpen {
  param(
    [int]$Port,
    [int]$TimeoutMs = 350
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connectTask = $client.ConnectAsync("127.0.0.1", $Port)
    if (-not $connectTask.Wait($TimeoutMs)) {
      return $false
    }

    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Get-LocalTcpListeningProcessIds {
  param(
    [int]$Port
  )

  $processIds = New-Object System.Collections.Generic.HashSet[int]
  try {
    $netstatLines = & netstat.exe -ano -p tcp 2>$null
    foreach ($line in @($netstatLines)) {
      $normalized = ($line -replace "\s+", " ").Trim()
      if ([string]::IsNullOrWhiteSpace($normalized)) {
        continue
      }

      $parts = $normalized.Split(" ")
      if ($parts.Count -lt 5 -or $parts[0] -ine "TCP" -or $parts[3] -ine "LISTENING") {
        continue
      }

      if (-not $parts[1].EndsWith(":$Port", [System.StringComparison]::OrdinalIgnoreCase)) {
        continue
      }

      $processId = 0
      if ([int]::TryParse($parts[4], [ref]$processId) -and $processId -gt 0) {
        [void]$processIds.Add($processId)
      }
    }
  } catch {
    # Ignore netstat failures and let the caller use process-name fallbacks.
  }

  return @($processIds)
}

function Test-LocalRenewalHelperRunning {
  param(
    [int]$Port
  )

  if (Test-LocalTcpPortOpen -Port $Port) {
    return $true
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

function Request-LocalRenewalHelperShutdown {
  param(
    [int]$Port
  )

  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/shutdown" -Method Post -TimeoutSec 3
    return $response.ok -eq $true
  } catch {
    return $false
  }
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

function Stop-HelperTray {
  $trayProcesses = @(Get-Process -Name "ATHelperTray" -ErrorAction SilentlyContinue)
  foreach ($trayProcess in $trayProcesses) {
    try {
      Stop-Process -Id $trayProcess.Id -Force -ErrorAction SilentlyContinue
    } catch {
      # Ignore tray shutdown failures; the helper process shutdown is verified separately.
    }
  }
}

$helperPort = Get-HelperPort
$taskName = "AUTO-TAX Renewal Local Helper"
$candidateProcessIds = New-Object System.Collections.Generic.HashSet[int]
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherScriptPath = (Join-Path $scriptDir "start-renewal-local-helper.ps1")

try {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
} catch {
  # The scheduled task may not currently be running.
}

try {
  & schtasks.exe /End /TN $taskName 2>$null | Out-Null
} catch {
  # The scheduled task may already be stopped or absent.
}

$gracefulShutdownRequested = Request-LocalRenewalHelperShutdown -Port $helperPort
if ($gracefulShutdownRequested -and (Wait-LocalRenewalHelperStop -Port $helperPort)) {
  Stop-HelperTray
  Write-Output "status=stopped"
  Write-Output "port=$helperPort"
  Write-Output "stoppedProcessCount=0"
  Write-Output "stoppedProcessIds="
  exit 0
}

@(Get-LocalTcpListeningProcessIds -Port $helperPort) | ForEach-Object {
  [void]$candidateProcessIds.Add([int]$_)
}

if ($candidateProcessIds.Count -gt 0) {
  Stop-LocalRenewalHelperViaWmi -ProcessIds @($candidateProcessIds)
  if (Wait-LocalRenewalHelperStop -Port $helperPort -Attempts 8 -DelayMs 500) {
    Stop-HelperTray
    Write-Output "status=stopped"
    Write-Output "port=$helperPort"
    Write-Output "stoppedProcessCount=$($candidateProcessIds.Count)"
    Write-Output "stoppedProcessIds=$(@($candidateProcessIds) -join ',')"
    exit 0
  }
}

@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
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

  return ($_.Name -ieq "powershell.exe") -and (CommandLineContains -CommandLine $commandLine -Needle $launcherScriptPath)
}) | ForEach-Object {
  [void]$candidateProcessIds.Add([int]$_.ProcessId)
}

$stoppedProcessIds = @()
foreach ($processId in $candidateProcessIds) {
  if (-not $PSCmdlet.ShouldProcess("PID $processId", "Stop renewal local helper process tree")) {
    continue
  }

  $taskKillSucceeded = $false
  try {
    & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
    $taskKillSucceeded = ($LASTEXITCODE -eq 0)
  } catch {
    $taskKillSucceeded = $false
  }

  if (-not $taskKillSucceeded) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      $taskKillSucceeded = $true
    } catch {
      $taskKillSucceeded = $false
    }
  }

  if ($taskKillSucceeded) {
    $stoppedProcessIds += $processId
  }
}

$stopped = Wait-LocalRenewalHelperStop -Port $helperPort -Attempts 12 -DelayMs 500

if (-not $stopped) {
  Write-Output "status=failed"
  Write-Output "port=$helperPort"
  Write-Output "stoppedProcessCount=$($stoppedProcessIds.Count)"
  Write-Output "stoppedProcessIds=$(if ($stoppedProcessIds.Count -gt 0) { $stoppedProcessIds -join ',' } else { '' })"
  throw "Failed to stop the running AUTO-TAX helper."
}

Stop-HelperTray
Write-Output "status=$(if ($stoppedProcessIds.Count -gt 0 -or $gracefulShutdownRequested) { 'stopped' } else { 'not-running' })"
Write-Output "port=$helperPort"
Write-Output "stoppedProcessCount=$($stoppedProcessIds.Count)"
Write-Output "stoppedProcessIds=$(if ($stoppedProcessIds.Count -gt 0) { $stoppedProcessIds -join ',' } else { '' })"
