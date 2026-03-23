import { spawn } from "node:child_process";

const mode = process.argv[2];

if (!["pack", "installer"].includes(mode)) {
  console.error("Usage: node scripts/desktop-build.mjs <pack|installer>");
  process.exit(1);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const quoteForCmd = (value) => {
      const stringValue = String(value);
      return /[\s&()|^<>]/.test(stringValue) ? `"${stringValue.replace(/"/g, '\\"')}"` : stringValue;
    };

    const spawnCommand =
      process.platform === "win32"
        ? {
            executable: "cmd.exe",
            args: ["/d", "/s", "/c", [command, ...args.map(quoteForCmd)].join(" ")]
          }
        : {
            executable: command,
            args
          };

    const child = spawn(spawnCommand.executable, spawnCommand.args, {
      stdio: "inherit",
      shell: false
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}

async function buildPackagedApp() {
  await run("npm", ["run", "build"]);
  await run("electron-builder", ["install-app-deps"]);
  await run("node", ["scripts/fix-popbill-package.mjs"]);
  await run("electron-packager", [
    ".",
    "AUTO-TAX",
    "--platform=win32",
    "--arch=x64",
    "--out=release",
    "--overwrite",
    "--prune=true",
    "--ignore=^/data($|/)",
    "--ignore=^/release($|/)",
    "--ignore=^/server/src($|/)",
    "--ignore=^/web/src($|/)",
    "--ignore=^/docs($|/)",
    "--ignore=^/\\.env$",
    "--ignore=^/node_modules/popbill/node_modules($|/)"
  ]);
}

async function main() {
  try {
    await buildPackagedApp();

    if (mode === "installer") {
      await run("electron-builder", ["--win", "nsis", "--prepackaged", "release/AUTO-TAX-win32-x64"]);
    }
  } finally {
    await run("npm", ["rebuild", "better-sqlite3"]);
    await run("node", ["scripts/fix-popbill-package.mjs"]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
