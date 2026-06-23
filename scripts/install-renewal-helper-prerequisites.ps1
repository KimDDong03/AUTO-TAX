[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateSet("Warn", "Stop")]
  [string]$FailureAction = "Warn"
)

$ErrorActionPreference = "Stop"

$defaultMagicPkiUrl = "https://hometax.speedycdn.net/dn_dir/veraport/magic-pki/magicline4nx_setup.exe"
$defaultSecuKitNxsUrl = "https://download.signgate.com/download/certmgt/secukitnx/issue/1.0.8.2/SecuKitNXS.exe"

function Resolve-DownloadUrl {
  param(
    [string]$EnvironmentVariableName,
    [string]$DefaultUrl
  )

  $configuredUrl = [Environment]::GetEnvironmentVariable($EnvironmentVariableName, "Process")
  if ([string]::IsNullOrWhiteSpace($configuredUrl)) {
    $configuredUrl = [Environment]::GetEnvironmentVariable($EnvironmentVariableName, "User")
  }
  if ([string]::IsNullOrWhiteSpace($configuredUrl)) {
    $configuredUrl = [Environment]::GetEnvironmentVariable($EnvironmentVariableName, "Machine")
  }

  if ([string]::IsNullOrWhiteSpace($configuredUrl)) {
    return $DefaultUrl
  }

  return $configuredUrl.Trim()
}

function Get-InstalledApplicationNames {
  $registryPaths = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )

  $names = New-Object System.Collections.Generic.List[string]
  foreach ($registryPath in $registryPaths) {
    try {
      @(Get-ItemProperty -Path $registryPath -ErrorAction Stop) | ForEach-Object {
        if (-not [string]::IsNullOrWhiteSpace($_.DisplayName)) {
          $names.Add([string]$_.DisplayName)
        }
      }
    } catch {
      # Some registry hives can be unavailable under limited accounts.
    }
  }

  return @($names)
}

function Test-AnyInstalledApplicationName {
  param(
    [string[]]$InstalledApplicationNames,
    [string[]]$NameFragments
  )

  foreach ($installedName in $InstalledApplicationNames) {
    foreach ($fragment in $NameFragments) {
      if ($installedName.IndexOf($fragment, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        return $true
      }
    }
  }

  return $false
}

function Test-LocalPortListening {
  param(
    [int[]]$Ports
  )

  foreach ($port in $Ports) {
    try {
      $listener = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $port -State Listen -ErrorAction Stop |
        Select-Object -First 1
      if ($listener) {
        return $true
      }
    } catch {
      # Listener not present.
    }
  }

  return $false
}

function Invoke-PrerequisiteInstaller {
  param(
    [string]$Id,
    [string]$DisplayName,
    [string]$DownloadUrl
  )

  if ([string]::IsNullOrWhiteSpace($DownloadUrl)) {
    throw "$DisplayName download URL is empty."
  }

  $uri = [System.Uri]$DownloadUrl
  $extension = [System.IO.Path]::GetExtension($uri.AbsolutePath)
  if ([string]::IsNullOrWhiteSpace($extension)) {
    $extension = ".exe"
  }

  $downloadDir = Join-Path ([System.IO.Path]::GetTempPath()) ("auto-tax-helper-prerequisites-" + [Guid]::NewGuid().ToString("N"))
  $installerPath = Join-Path $downloadDir ($Id + $extension)

  try {
    if (-not $PSCmdlet.ShouldProcess($DisplayName, "Download and run prerequisite installer")) {
      Write-Output "prerequisiteResult=$Id status=whatif"
      return
    }

    New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
    Write-Output "prerequisiteDownload=$Id url=$DownloadUrl"
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $installerPath -UseBasicParsing -ErrorAction Stop

    if (-not (Test-Path $installerPath)) {
      throw "$DisplayName installer download did not create a file."
    }

    $downloadedBytes = (Get-Item -LiteralPath $installerPath).Length
    if ($downloadedBytes -le 0) {
      throw "$DisplayName installer download returned an empty file."
    }

    Write-Output "prerequisiteInstall=$Id bytes=$downloadedBytes"
    $process = Start-Process -FilePath $installerPath -Wait -PassThru
    Write-Output "prerequisiteInstallerExit=$Id code=$($process.ExitCode)"
    if ($process.ExitCode -ne 0) {
      throw "$DisplayName installer exited with code $($process.ExitCode)."
    }
  } finally {
    try {
      if (Test-Path $downloadDir) {
        Remove-Item -LiteralPath $downloadDir -Recurse -Force -ErrorAction SilentlyContinue
      }
    } catch {
      # Temporary installer files can be left for Windows cleanup if a process still holds them.
    }
  }
}

function Invoke-WithFailurePolicy {
  param(
    [scriptblock]$Action,
    [string]$Id,
    [string]$DisplayName
  )

  try {
    & $Action
    return
  } catch {
    $message = "$DisplayName prerequisite install failed: $($_.Exception.Message)"
    if ($FailureAction -eq "Stop") {
      throw $message
    }

    Write-Warning $message
    Write-Output "prerequisiteResult=$Id status=failed"
    return
  }
}

$installedApplicationNames = @(Get-InstalledApplicationNames)
$magicPkiInstalled = (Test-AnyInstalledApplicationName `
  -InstalledApplicationNames $installedApplicationNames `
  -NameFragments @("MagicLine4NX", "MAGIC-PKI")) -or (Test-LocalPortListening -Ports @(42235))
$secukitInstalled = (Test-AnyInstalledApplicationName `
  -InstalledApplicationNames $installedApplicationNames `
  -NameFragments @("SecuKit NXS", "SecuKitNX", "SecuKit")) -or (Test-LocalPortListening -Ports @(14315, 14319))

Write-Output "prerequisiteStatus=magic-pki installed=$(if ($magicPkiInstalled) { 'true' } else { 'false' })"
Write-Output "prerequisiteStatus=secukit-nxs installed=$(if ($secukitInstalled) { 'true' } else { 'false' })"

if (-not $magicPkiInstalled) {
  $magicPkiUrl = Resolve-DownloadUrl `
    -EnvironmentVariableName "AUTO_TAX_MAGIC_PKI_DOWNLOAD_URL" `
    -DefaultUrl $defaultMagicPkiUrl
  Invoke-WithFailurePolicy `
    -Id "magic-pki" `
    -DisplayName "HomeTax MAGIC-PKI" `
    -Action { Invoke-PrerequisiteInstaller -Id "magic-pki" -DisplayName "HomeTax MAGIC-PKI" -DownloadUrl $magicPkiUrl }
} else {
  Write-Output "prerequisiteResult=magic-pki status=already-installed"
}

if (-not $secukitInstalled) {
  $secukitUrl = Resolve-DownloadUrl `
    -EnvironmentVariableName "AUTO_TAX_SECUKIT_NXS_DOWNLOAD_URL" `
    -DefaultUrl $defaultSecuKitNxsUrl
  Invoke-WithFailurePolicy `
    -Id "secukit-nxs" `
    -DisplayName "SignGate SecuKit NXS" `
    -Action { Invoke-PrerequisiteInstaller -Id "secukit-nxs" -DisplayName "SignGate SecuKit NXS" -DownloadUrl $secukitUrl }
} else {
  Write-Output "prerequisiteResult=secukit-nxs status=already-installed"
}
