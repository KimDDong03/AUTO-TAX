[CmdletBinding()]
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

function Get-LocalRenewalHelperHealth {
  param(
    [int]$Port
  )

  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -Method Get -TimeoutSec 5
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
  if ($health.status.bridgeTransportSummary) {
    Write-Output "bridgeTransportSummary=$($health.status.bridgeTransportSummary)"
  }
  if ($health.status.bridgeFunctionalSummary) {
    Write-Output "bridgeFunctionalSummary=$($health.status.bridgeFunctionalSummary)"
  }
  if ($health.popbillDebugArtifacts) {
    Write-Output "popbillDebugArtifactSupport=$(if ($health.popbillDebugArtifacts.supported) { 'enabled' } else { 'disabled' })"
    Write-Output "popbillDebugArtifactDir=$($health.popbillDebugArtifacts.artifactDir)"
    if ($health.popbillDebugArtifacts.stages) {
      Write-Output "popbillDebugArtifactStages=$($health.popbillDebugArtifacts.stages -join ',')"
    }
  }
  if ($health.popbillChooserDebug) {
    Write-Output "popbillChooserDebugAvailable=$(if ($health.popbillChooserDebug.available) { 'enabled' } else { 'disabled' })"
    Write-Output "popbillAmbiguousCnReady=$(if ($health.popbillChooserDebug.ambiguousCnReady) { 'enabled' } else { 'blocked' })"
    Write-Output "popbillElectronicTaxCertificateCount=$($health.popbillChooserDebug.electronicTaxCertificateCount)"
    Write-Output "popbillDuplicateElectronicTaxCnCount=$($health.popbillChooserDebug.duplicateElectronicTaxCnCount)"
    if ($health.popbillChooserDebug.duplicateElectronicTaxCnCandidates) {
      $duplicateCandidates = @($health.popbillChooserDebug.duplicateElectronicTaxCnCandidates | ForEach-Object {
        $indices = @($_.certificateIndices) -join '/'
        "$($_.certificateCn)[$indices]"
      })
      Write-Output "popbillDuplicateElectronicTaxCns=$($duplicateCandidates -join ',')"
    }
    if ($health.popbillChooserDebug.blockers) {
      Write-Output "popbillChooserDebugBlockers=$(@($health.popbillChooserDebug.blockers) -join ',')"
    }
    if ($health.popbillChooserDebug.message) {
      Write-Output "popbillChooserDebugMessage=$($health.popbillChooserDebug.message)"
    }
    if ($health.popbillChooserDebug.nextAction) {
      Write-Output "popbillChooserDebugNextAction=$($health.popbillChooserDebug.nextAction)"
    }
  }
}
