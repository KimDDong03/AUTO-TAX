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

$helperPort = Get-HelperPort
$candidateProcessIds = New-Object System.Collections.Generic.HashSet[int]

try {
  @(Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $helperPort -State Listen -ErrorAction Stop |
    Select-Object -ExpandProperty OwningProcess -Unique) | ForEach-Object {
      [void]$candidateProcessIds.Add([int]$_)
    }
} catch {
  # The helper might not currently be listening.
}

@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and (
    $_.CommandLine -like "*renewal-local-helper.ts*" -or
    $_.CommandLine -like "*start-renewal-local-helper.ps1*"
  )
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

  if ($taskKillSucceeded) {
    $stoppedProcessIds += $processId
  }
}

Write-Output "status=$(if ($stoppedProcessIds.Count -gt 0) { 'stopped' } else { 'not-running' })"
Write-Output "port=$helperPort"
Write-Output "stoppedProcessCount=$($stoppedProcessIds.Count)"
Write-Output "stoppedProcessIds=$(if ($stoppedProcessIds.Count -gt 0) { $stoppedProcessIds -join ',' } else { '' })"
