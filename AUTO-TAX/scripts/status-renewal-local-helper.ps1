[CmdletBinding()]
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

function Get-LocalRenewalHelperHealth {
  param(
    [int]$Port
  )

  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -Method Get -TimeoutSec 2
  } catch {
    return $null
  }
}

$helperPort = Get-HelperPort
$taskName = "AUTO-TAX Renewal Local Helper"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$health = Get-LocalRenewalHelperHealth -Port $helperPort

$owningProcessIds = @()
try {
  $owningProcessIds = @(Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $helperPort -State Listen -ErrorAction Stop |
    Select-Object -ExpandProperty OwningProcess -Unique)
} catch {
  $owningProcessIds = @()
}

$isRunning = $health -or $owningProcessIds.Count -gt 0

Write-Output "status=$(if ($isRunning) { 'running' } else { 'stopped' })"
Write-Output "port=$helperPort"
Write-Output "taskName=$taskName"
Write-Output "taskState=$(if ($task) { $task.State } else { 'absent' })"
Write-Output "processIds=$(if ($owningProcessIds.Count -gt 0) { $owningProcessIds -join ',' } else { '' })"

if ($health) {
  Write-Output "version=$($health.version)"
  Write-Output "bridgeSummary=$($health.status.bridgeSummary)"
}
