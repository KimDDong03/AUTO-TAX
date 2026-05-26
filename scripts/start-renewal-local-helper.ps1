[CmdletBinding()]
param(
  [switch]$ValidateOnly,
  [switch]$Detached,
  [switch]$Foreground,
  [switch]$Restart,
  [switch]$SkipTray
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

function Wait-LocalRenewalHelperStop {
  param(
    [int]$Port,
    [int]$Attempts = 30,
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

function Start-HelperTray {
  param(
    [string]$RepoRoot,
    [int]$Port
  )

  $trayExe = Join-Path $RepoRoot "app\\ATHelperTray.exe"
  if (-not (Test-Path $trayExe)) {
    return
  }

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $trayExe
  $startInfo.Arguments = "--port $Port"
  $startInfo.WorkingDirectory = $RepoRoot
  $startInfo.UseShellExecute = $true
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  [System.Diagnostics.Process]::Start($startInfo) | Out-Null
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$bundledNodeExe = Join-Path $repoRoot "runtime\\node.exe"
$bundledHelperScript = Join-Path $repoRoot "app\\renewal-local-helper.cjs"
$bundledHelperScriptLegacy = Join-Path $repoRoot "app\\renewal-local-helper.mjs"
$helperScript = Join-Path $repoRoot "scripts\\renewal-local-helper.ts"
$tsxCmd = Join-Path $repoRoot "node_modules\\.bin\\tsx.cmd"
$helperPort = Get-HelperPort
$powershellExe = (Get-Command powershell.exe -ErrorAction Stop).Source

if (
  -not (Test-Path $helperScript) -and
  -not (
    (Test-Path $bundledNodeExe) -and
    ((Test-Path $bundledHelperScript) -or (Test-Path $bundledHelperScriptLegacy))
  )
) {
  throw "Local helper script not found: $helperScript"
}

$alreadyRunning = Test-LocalRenewalHelperRunning -Port $helperPort

if ($Detached -and -not $Foreground) {
  if ($Restart -and $alreadyRunning) {
    $stopScript = Join-Path $scriptDir "stop-renewal-local-helper.ps1"
    if (-not (Test-Path $stopScript)) {
      throw "Local helper stop script not found: $stopScript"
    }

    & $powershellExe -NoProfile -ExecutionPolicy Bypass -File $stopScript | Out-Null
    if (-not (Wait-LocalRenewalHelperStop -Port $helperPort)) {
      throw "Could not stop the running helper before restart."
    }

    $alreadyRunning = $false
  }

  if ($alreadyRunning) {
    if (-not $SkipTray) {
      Start-HelperTray -RepoRoot $repoRoot -Port $helperPort
    }
    Write-Output "status=already-running"
    Write-Output "port=$helperPort"
    exit 0
  }

  $argumentList = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-WindowStyle", "Hidden",
    "-File", $MyInvocation.MyCommand.Path,
    "-Foreground"
  )

  $helperStartInfo = New-Object System.Diagnostics.ProcessStartInfo
  $helperStartInfo.FileName = $powershellExe
  $helperStartInfo.Arguments = ($argumentList | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }) -join " "
  $helperStartInfo.WorkingDirectory = $repoRoot
  $helperStartInfo.UseShellExecute = $true
  $helperStartInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  [System.Diagnostics.Process]::Start($helperStartInfo) | Out-Null
  Start-Sleep -Milliseconds 1200
  if (-not $SkipTray) {
    Start-HelperTray -RepoRoot $repoRoot -Port $helperPort
  }

  $status = if (Test-LocalRenewalHelperRunning -Port $helperPort) { "started" } else { "starting" }
  Write-Output "status=$status"
  Write-Output "port=$helperPort"
  exit 0
}

$command = $null
$arguments = @()

if ((Test-Path $bundledNodeExe) -and ((Test-Path $bundledHelperScript) -or (Test-Path $bundledHelperScriptLegacy))) {
  $command = $bundledNodeExe
  $arguments = @($(if (Test-Path $bundledHelperScript) { $bundledHelperScript } else { $bundledHelperScriptLegacy }))
} elseif (Test-Path $tsxCmd) {
  $command = $tsxCmd
  $arguments = @($helperScript)
} else {
  $npmCmdInfo = Get-Command npm.cmd -ErrorAction SilentlyContinue
  $npmCmd = if ($npmCmdInfo) { $npmCmdInfo.Source } else { $null }
  if (-not $npmCmd) {
    throw "Could not find tsx.cmd or npm.cmd. Run npm install first."
  }

  $command = $npmCmd
  $arguments = @("exec", "tsx", "--", $helperScript)
}

if ($ValidateOnly) {
  Write-Output "repoRoot=$repoRoot"
  Write-Output "helperScript=$helperScript"
  Write-Output "port=$helperPort"
  Write-Output "alreadyRunning=$alreadyRunning"
  Write-Output "command=$command"
  Write-Output "arguments=$($arguments -join ' ')"
  exit 0
}

if ($alreadyRunning) {
  Write-Output "status=already-running"
  Write-Output "port=$helperPort"
  exit 0
}

Push-Location $repoRoot
try {
  & $command @arguments
} finally {
  Pop-Location
}
