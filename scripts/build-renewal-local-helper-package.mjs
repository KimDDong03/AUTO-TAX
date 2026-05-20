import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(repoRoot, "dist", "renewal-local-helper");
const appDir = path.join(outputRoot, "app");
const appNodeModulesDir = path.join(appDir, "node_modules");
const runtimeDir = path.join(outputRoot, "runtime");
const scriptsDir = path.join(outputRoot, "scripts");
const helperReleaseSourcePath = path.join(repoRoot, "scripts", "renewal-local-helper-release.json");
const outputMetadataPath = path.join(repoRoot, "dist", "renewal-local-helper.json");
const outputZipPath = path.join(repoRoot, "dist", "renewal-local-helper.zip");
const outputExePath = path.join(repoRoot, "dist", "renewal-local-helper.exe");
const staticDownloadDir = path.join(repoRoot, "web", "public", "downloads");
const staticDownloadMetadataPath = path.join(staticDownloadDir, "renewal-local-helper.json");
const staticDownloadZipPath = path.join(staticDownloadDir, "AT helper.zip");
const staticDownloadExePath = path.join(staticDownloadDir, "AT helper.exe");
const legacyStaticDownloadZipPath = path.join(staticDownloadDir, "renewal-local-helper.zip");
const legacyStaticDownloadExePath = path.join(staticDownloadDir, "renewal-local-helper.exe");
const runtimeVersionPath = path.join(appDir, "renewal-local-helper-release.json");
const installerStagingDir = path.join(repoRoot, "dist", "renewal-local-helper-installer");
const installerIconSourcePath = path.join(repoRoot, "scripts", "assets", "helper-installer-icon.png");
const ZIP_BASENAME = "AT helper";
const EXE_BASENAME = "AT helper";

function resolveVersionedZipFileName(version) {
  const safeVersion = typeof version === "string" && version.trim() ? version.trim() : "0.0.0";
  return `${ZIP_BASENAME}-${safeVersion}.zip`;
}

function resolveVersionedExeFileName(version) {
  const safeVersion = typeof version === "string" && version.trim() ? version.trim() : "0.0.0";
  return `${EXE_BASENAME}-${safeVersion}.exe`;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readHelperReleaseConfig() {
  const config = readJsonFile(helperReleaseSourcePath);
  const latestVersion = typeof config.version === "string" ? config.version.trim() : "";
  const minSupportedVersion =
    typeof config.minSupportedVersion === "string" ? config.minSupportedVersion.trim() : latestVersion;
  const releasedAt = typeof config.releasedAt === "string" ? config.releasedAt.trim() : "";

  if (!latestVersion) {
    throw new Error(`Local helper release metadata is missing version: ${helperReleaseSourcePath}`);
  }

  if (!minSupportedVersion) {
    throw new Error(`Local helper release metadata is missing minSupportedVersion: ${helperReleaseSourcePath}`);
  }

  if (!releasedAt) {
    throw new Error(`Local helper release metadata is missing releasedAt: ${helperReleaseSourcePath}`);
  }

  return {
    latestVersion,
    minSupportedVersion,
    releasedAt
  };
}

function buildHelperReleaseMetadata() {
  const config = readHelperReleaseConfig();
  return {
    latestVersion: config.latestVersion,
    minSupportedVersion: config.minSupportedVersion,
    downloadUrl: `/downloads/${encodeURIComponent(resolveVersionedExeFileName(config.latestVersion))}`,
    zipDownloadUrl: `/downloads/${encodeURIComponent(resolveVersionedZipFileName(config.latestVersion))}`,
    releasedAt: config.releasedAt
  };
}

function resetDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EBUSY") {
      throw new Error(`${dirPath} is busy. Stop the local helper first, then package it again.`);
    }
    throw error;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyRecursive(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function writeWindowsCmdScript(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\r\n")}\r\n`, "ascii");
}

function writePackageReadme() {
  const content = [
    "AT helper",
    "",
    "1. Copy this folder to the customer PC.",
    "2. Run scripts\\renewal-helper-install.cmd.",
    "3. The installer starts the latest AT helper automatically after install.",
    "4. Use AUTO-TAX Helper Start / Stop / Status shortcuts as needed.",
    "5. Disable Autostart only removes logon autostart. Start / Stop / Status shortcuts stay available.",
    "",
    "Manual commands:",
    "  scripts\\renewal-helper-start.cmd",
    "  scripts\\renewal-helper-stop.cmd",
    "  scripts\\renewal-helper-status.cmd",
    "  scripts\\renewal-helper-uninstall.cmd"
  ].join("\r\n");

  fs.writeFileSync(path.join(outputRoot, "README.txt"), content, "utf8");
}

function writeZipArchive(archivePath = outputZipPath) {
  if (fs.existsSync(archivePath)) {
    fs.rmSync(archivePath, { force: true });
  }

  const sourcePattern = path.join(outputRoot, "*").replace(/\\/g, "\\\\");
  const destinationPath = archivePath.replace(/\\/g, "\\\\");
  const command = `Compress-Archive -Path "${sourcePattern}" -DestinationPath "${destinationPath}" -Force`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(
      `Failed to create renewal helper zip: ${result.stderr?.trim() || result.stdout?.trim() || "PowerShell failed"}`
    );
  }
}

function writePngBackedIconFile(iconPath) {
  if (!fs.existsSync(installerIconSourcePath)) {
    throw new Error(`Could not find helper installer icon: ${installerIconSourcePath}`);
  }

  const pngBytes = fs.readFileSync(installerIconSourcePath);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(pngBytes.length, 14);
  header.writeUInt32LE(header.length, 18);
  fs.writeFileSync(iconPath, Buffer.concat([header, pngBytes]));
}

function writeInstallerSourceFile(sourcePath) {
  const source = String.raw`
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

namespace AutoTaxRenewalHelperInstaller
{
  public static class Program
  {
    public static int Main()
    {
      string payloadDir = Path.Combine(Path.GetTempPath(), "auto-tax-renewal-local-helper-" + Guid.NewGuid().ToString("N"));
      string zipPath = Path.Combine(payloadDir, "renewal-local-helper.zip");

      try
      {
        Directory.CreateDirectory(payloadDir);
        using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("renewal-local-helper.zip"))
        {
          if (resource == null)
          {
            throw new InvalidOperationException("Installer payload is missing.");
          }

          using (FileStream output = File.Create(zipPath))
          {
            resource.CopyTo(output);
          }
        }

        RunPowerShell("-NoProfile -ExecutionPolicy Bypass -Command \"Expand-Archive -LiteralPath '" + zipPath.Replace("'", "''") + "' -DestinationPath '" + payloadDir.Replace("'", "''") + "' -Force\"");
        string installScript = Path.Combine(payloadDir, "scripts", "install-renewal-local-helper-autostart.ps1");
        RunPowerShell("-NoProfile -ExecutionPolicy Bypass -File \"" + installScript + "\" -StartNow");

        Console.WriteLine();
        Console.WriteLine("AUTO-TAX renewal helper install completed.");
        Console.WriteLine("Press any key to close.");
        Console.ReadKey(true);
        return 0;
      }
      catch (Exception error)
      {
        Console.WriteLine();
        Console.Error.WriteLine("AUTO-TAX renewal helper install failed.");
        Console.Error.WriteLine(error.Message);
        Console.WriteLine("Press any key to close.");
        Console.ReadKey(true);
        return 1;
      }
    }

    private static void RunPowerShell(string arguments)
    {
      ProcessStartInfo startInfo = new ProcessStartInfo("powershell.exe", arguments);
      startInfo.UseShellExecute = false;
      Process process = Process.Start(startInfo);
      process.WaitForExit();

      if (process.ExitCode != 0)
      {
        throw new InvalidOperationException("PowerShell command failed with exit code " + process.ExitCode + ".");
      }
    }
  }
}
`;
  fs.writeFileSync(sourcePath, source.trimStart(), "utf8");
}

function writeInstallerCompileScript(scriptPath, sourcePath, iconPath, zipPath, exePath) {
  const script = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName Microsoft.CSharp
$provider = New-Object Microsoft.CSharp.CSharpCodeProvider
$parameters = New-Object System.CodeDom.Compiler.CompilerParameters
$parameters.GenerateExecutable = $true
$parameters.OutputAssembly = ${JSON.stringify(exePath)}
$parameters.MainClass = "AutoTaxRenewalHelperInstaller.Program"
$parameters.CompilerOptions = "/target:exe /win32icon:${iconPath.replace(/\\/g, "\\\\")} /resource:${zipPath.replace(/\\/g, "\\\\")},renewal-local-helper.zip"
[void]$parameters.ReferencedAssemblies.Add("System.dll")
$result = $provider.CompileAssemblyFromFile($parameters, ${JSON.stringify(sourcePath)})
if ($result.Errors.HasErrors) {
  $messages = @()
  foreach ($errorItem in $result.Errors) {
    $messages += $errorItem.ToString()
  }
  throw ($messages -join [Environment]::NewLine)
}
`;
  fs.writeFileSync(scriptPath, script.trimStart(), "utf8");
}

function writeInstallerExe(versionedZipPath, exePath) {
  resetDir(installerStagingDir);
  copyRecursive(versionedZipPath, path.join(installerStagingDir, "renewal-local-helper.zip"));
  const stagedZipPath = path.join(installerStagingDir, "renewal-local-helper.zip");
  const iconPath = path.join(installerStagingDir, "helper-installer.ico");
  const sourcePath = path.join(installerStagingDir, "AutoTaxRenewalHelperInstaller.cs");
  const compileScriptPath = path.join(installerStagingDir, "compile-installer.ps1");
  writePngBackedIconFile(iconPath);
  writeInstallerSourceFile(sourcePath);
  writeInstallerCompileScript(compileScriptPath, sourcePath, iconPath, stagedZipPath, exePath);

  if (fs.existsSync(exePath)) {
    fs.rmSync(exePath, { force: true });
  }

  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", compileScriptPath], {
    cwd: installerStagingDir,
    encoding: "utf8"
  });

  if (result.status !== 0 || !fs.existsSync(exePath)) {
    throw new Error(
      `Failed to create renewal helper installer exe: ${result.stderr?.trim() || result.stdout?.trim() || "PowerShell compile failed"}`
    );
  }
}

function syncStaticDownloadAsset(versionedZipPath, versionedStaticZipPath, versionedExePath, versionedStaticExePath) {
  fs.mkdirSync(staticDownloadDir, { recursive: true });
  copyRecursive(versionedZipPath, versionedStaticZipPath);
  copyRecursive(versionedZipPath, staticDownloadZipPath);
  copyRecursive(versionedZipPath, legacyStaticDownloadZipPath);
  copyRecursive(versionedExePath, versionedStaticExePath);
  copyRecursive(versionedExePath, staticDownloadExePath);
  copyRecursive(versionedExePath, legacyStaticDownloadExePath);
  copyRecursive(outputMetadataPath, staticDownloadMetadataPath);
}

async function buildBundle() {
  await esbuild.build({
    entryPoints: [path.join(repoRoot, "scripts", "renewal-local-helper.ts")],
    outfile: path.join(appDir, "renewal-local-helper.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: false,
    minify: true,
    legalComments: "none",
    define: {
      "process.env.AUTO_TAX_RENEWAL_AGENT_DISABLE_AUTO_START": "\"1\""
    },
    external: ["playwright"]
  });
}

function copyRuntime() {
  const nodeExe = process.execPath;
  if (!fs.existsSync(nodeExe)) {
    throw new Error(`Could not find node.exe: ${nodeExe}`);
  }

  copyRecursive(nodeExe, path.join(runtimeDir, "node.exe"));
}

function copyPlaywrightRuntime() {
  const playwrightDir = path.join(repoRoot, "node_modules", "playwright");
  const playwrightCoreDir = path.join(repoRoot, "node_modules", "playwright-core");

  if (!fs.existsSync(playwrightDir) || !fs.existsSync(playwrightCoreDir)) {
    throw new Error("Could not find playwright or playwright-core. Run npm install and try again.");
  }

  copyRecursive(playwrightDir, path.join(appNodeModulesDir, "playwright"));
  copyRecursive(playwrightCoreDir, path.join(appNodeModulesDir, "playwright-core"));
}

function copyScripts() {
  const powershellScriptNames = [
    "start-renewal-local-helper.ps1",
    "stop-renewal-local-helper.ps1",
    "status-renewal-local-helper.ps1",
    "install-renewal-local-helper-autostart.ps1",
    "uninstall-renewal-local-helper-autostart.ps1"
  ];

  for (const scriptName of powershellScriptNames) {
    copyRecursive(path.join(repoRoot, "scripts", scriptName), path.join(scriptsDir, scriptName));
  }

  const cmdScripts = {
    "renewal-helper-install.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0install-renewal-local-helper-autostart.ps1\" -StartNow",
      "if errorlevel 1 goto :fail",
      "echo.",
      "echo AUTO-TAX renewal helper install completed.",
      "pause",
      "exit /b 0",
      "",
      ":fail",
      "set \"_exit=%errorlevel%\"",
      "echo.",
      "echo AUTO-TAX renewal helper install failed.",
      "pause",
      "exit /b %_exit%"
    ],
    "renewal-helper-start.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0start-renewal-local-helper.ps1\" -Detached",
      "if errorlevel 1 goto :fail",
      "echo.",
      "echo AUTO-TAX renewal helper started.",
      "pause",
      "exit /b 0",
      "",
      ":fail",
      "set \"_exit=%errorlevel%\"",
      "echo.",
      "echo AUTO-TAX renewal helper start failed.",
      "pause",
      "exit /b %_exit%"
    ],
    "renewal-helper-stop.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0stop-renewal-local-helper.ps1\"",
      "if errorlevel 1 goto :fail",
      "echo.",
      "echo AUTO-TAX renewal helper stopped.",
      "pause",
      "exit /b 0",
      "",
      ":fail",
      "set \"_exit=%errorlevel%\"",
      "echo.",
      "echo AUTO-TAX renewal helper stop failed.",
      "pause",
      "exit /b %_exit%"
    ],
    "renewal-helper-status.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File \"%~dp0status-renewal-local-helper.ps1\""
    ],
    "renewal-helper-uninstall.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0uninstall-renewal-local-helper-autostart.ps1\"",
      "if errorlevel 1 goto :fail",
      "echo.",
      "echo AUTO-TAX renewal helper autostart removed. Start/Stop/Status shortcuts stay available.",
      "pause",
      "exit /b 0",
      "",
      ":fail",
      "set \"_exit=%errorlevel%\"",
      "echo.",
      "echo AUTO-TAX renewal helper autostart removal failed.",
      "pause",
      "exit /b %_exit%"
    ]
  };

  for (const [scriptName, lines] of Object.entries(cmdScripts)) {
    writeWindowsCmdScript(path.join(scriptsDir, scriptName), lines);
  }
}

function writeReleaseMetadataAssets() {
  const metadata = buildHelperReleaseMetadata();
  writeJsonFile(outputMetadataPath, metadata);
  writeJsonFile(runtimeVersionPath, {
    version: metadata.latestVersion,
    releasedAt: metadata.releasedAt
  });
}

async function main() {
  const metadata = buildHelperReleaseMetadata();
  const versionedZipPath = path.join(repoRoot, "dist", resolveVersionedZipFileName(metadata.latestVersion));
  const versionedStaticZipPath = path.join(staticDownloadDir, resolveVersionedZipFileName(metadata.latestVersion));
  const versionedExePath = path.join(repoRoot, "dist", resolveVersionedExeFileName(metadata.latestVersion));
  const versionedStaticExePath = path.join(staticDownloadDir, resolveVersionedExeFileName(metadata.latestVersion));

  resetDir(outputRoot);
  fs.mkdirSync(appNodeModulesDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(scriptsDir, { recursive: true });

  await buildBundle();
  copyRuntime();
  copyPlaywrightRuntime();
  copyScripts();
  writeReleaseMetadataAssets();
  writePackageReadme();
  writeZipArchive(versionedZipPath);
  if (fs.existsSync(outputZipPath)) {
    fs.rmSync(outputZipPath, { force: true });
  }
  fs.copyFileSync(versionedZipPath, outputZipPath);
  writeInstallerExe(versionedZipPath, versionedExePath);
  if (fs.existsSync(outputExePath)) {
    fs.rmSync(outputExePath, { force: true });
  }
  fs.copyFileSync(versionedExePath, outputExePath);
  syncStaticDownloadAsset(versionedZipPath, versionedStaticZipPath, versionedExePath, versionedStaticExePath);

  console.log(`output=${outputRoot}`);
  console.log(`metadata=${outputMetadataPath}`);
  console.log(`zip=${versionedZipPath}`);
  console.log(`legacyZip=${outputZipPath}`);
  console.log(`exe=${versionedExePath}`);
  console.log(`legacyExe=${outputExePath}`);
  console.log(`publicMetadata=${staticDownloadMetadataPath}`);
  console.log(`publicZip=${versionedStaticZipPath}`);
  console.log(`publicLegacyZip=${staticDownloadZipPath}`);
  console.log(`publicExe=${versionedStaticExePath}`);
  console.log(`publicLegacyExe=${staticDownloadExePath}`);
}

await main();
