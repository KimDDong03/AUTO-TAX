[CmdletBinding(SupportsShouldProcess = $true)]
param()

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
  @(Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $helperPort -State Listen -ErrorAction Stop |
    Select-Object -ExpandProperty OwningProcess -Unique) | ForEach-Object {
      [void]$candidateProcessIds.Add([int]$_)
    }
} catch {
  # The helper might not currently be listening.
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

Write-Output "status=$(if ($stoppedProcessIds.Count -gt 0) { 'stopped' } else { 'not-running' })"
Write-Output "port=$helperPort"
Write-Output "stoppedProcessCount=$($stoppedProcessIds.Count)"
Write-Output "stoppedProcessIds=$(if ($stoppedProcessIds.Count -gt 0) { $stoppedProcessIds -join ',' } else { '' })"
