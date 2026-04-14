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
const staticDownloadDir = path.join(repoRoot, "web", "public", "downloads");
const staticDownloadMetadataPath = path.join(staticDownloadDir, "renewal-local-helper.json");
const staticDownloadZipPath = path.join(staticDownloadDir, "renewal-local-helper.zip");
const runtimeVersionPath = path.join(appDir, "renewal-local-helper-release.json");

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
    throw new Error(`로컬 헬퍼 release metadata의 version이 비어 있습니다: ${helperReleaseSourcePath}`);
  }

  if (!minSupportedVersion) {
    throw new Error(`로컬 헬퍼 release metadata의 minSupportedVersion이 비어 있습니다: ${helperReleaseSourcePath}`);
  }

  if (!releasedAt) {
    throw new Error(`로컬 헬퍼 release metadata의 releasedAt이 비어 있습니다: ${helperReleaseSourcePath}`);
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
    downloadUrl: "/downloads/renewal-local-helper.zip",
    releasedAt: config.releasedAt
  };
}

function resetDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EBUSY") {
      throw new Error(`${dirPath} 폴더가 사용 중입니다. 로컬 헬퍼가 실행 중이면 먼저 종료한 뒤 다시 패키징하세요.`);
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
    "AUTO-TAX Renewal Local Helper",
    "",
    "1. this folder 전체를 고객 PC에 복사합니다.",
    "2. scripts\\renewal-helper-install.cmd 를 더블클릭합니다.",
    "3. 설치 후 바탕화면의 AUTO-TAX Helper Start / Stop / Status 바로가기를 사용합니다.",
    "4. Disable Autostart는 로그인 자동실행만 끄고 Start / Stop / Status 바로가기는 유지합니다.",
    "",
    "직접 실행 명령:",
    "  scripts\\renewal-helper-start.cmd",
    "  scripts\\renewal-helper-stop.cmd",
    "  scripts\\renewal-helper-status.cmd",
    "  scripts\\renewal-helper-uninstall.cmd"
  ].join("\r\n");

  fs.writeFileSync(path.join(outputRoot, "README.txt"), content, "utf8");
}

function writeZipArchive() {
  if (fs.existsSync(outputZipPath)) {
    fs.rmSync(outputZipPath, { force: true });
  }

  const sourcePattern = path.join(outputRoot, "*").replace(/\\/g, "\\\\");
  const destinationPath = outputZipPath.replace(/\\/g, "\\\\");
  const command = `Compress-Archive -Path "${sourcePattern}" -DestinationPath "${destinationPath}" -Force`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`renewal helper zip 생성에 실패했습니다: ${result.stderr?.trim() || result.stdout?.trim() || "powershell 실패"}`);
  }
}

function syncStaticDownloadAsset() {
  fs.mkdirSync(staticDownloadDir, { recursive: true });
  copyRecursive(outputZipPath, staticDownloadZipPath);
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
    define: {
      "process.env.AUTO_TAX_RENEWAL_AGENT_DISABLE_AUTO_START": "\"1\""
    },
    external: ["playwright"]
  });
}

function copyRuntime() {
  const nodeExe = process.execPath;
  if (!fs.existsSync(nodeExe)) {
    throw new Error(`node.exe를 찾지 못했습니다: ${nodeExe}`);
  }

  copyRecursive(nodeExe, path.join(runtimeDir, "node.exe"));
}

function copyPlaywrightRuntime() {
  const playwrightDir = path.join(repoRoot, "node_modules", "playwright");
  const playwrightCoreDir = path.join(repoRoot, "node_modules", "playwright-core");

  if (!fs.existsSync(playwrightDir) || !fs.existsSync(playwrightCoreDir)) {
    throw new Error("playwright 또는 playwright-core 모듈을 찾지 못했습니다. npm install 후 다시 시도하세요.");
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
      "echo.",
      "echo AUTO-TAX renewal helper install completed.",
      "pause"
    ],
    "renewal-helper-start.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0start-renewal-local-helper.ps1\" -Detached",
      "echo.",
      "echo AUTO-TAX renewal helper started.",
      "pause"
    ],
    "renewal-helper-stop.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0stop-renewal-local-helper.ps1\"",
      "echo.",
      "echo AUTO-TAX renewal helper stopped.",
      "pause"
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
      "echo.",
      "echo AUTO-TAX renewal helper autostart removed. Start/Stop/Status shortcuts stay available.",
      "pause"
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
  writeZipArchive();
  syncStaticDownloadAsset();

  console.log(`output=${outputRoot}`);
  console.log(`metadata=${outputMetadataPath}`);
  console.log(`zip=${outputZipPath}`);
  console.log(`publicMetadata=${staticDownloadMetadataPath}`);
  console.log(`publicZip=${staticDownloadZipPath}`);
}

await main();
