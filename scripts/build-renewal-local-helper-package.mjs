import fs from "node:fs";
import path from "node:path";
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

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
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
    "",
    "직접 실행 명령:",
    "  scripts\\renewal-helper-start.cmd",
    "  scripts\\renewal-helper-stop.cmd",
    "  scripts\\renewal-helper-status.cmd",
    "  scripts\\renewal-helper-uninstall.cmd"
  ].join("\r\n");

  fs.writeFileSync(path.join(outputRoot, "README.txt"), content, "utf8");
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
      "echo AUTO-TAX renewal helper autostart removed.",
      "pause"
    ]
  };

  for (const [scriptName, lines] of Object.entries(cmdScripts)) {
    writeWindowsCmdScript(path.join(scriptsDir, scriptName), lines);
  }
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
  writePackageReadme();

  console.log(`output=${outputRoot}`);
}

await main();
