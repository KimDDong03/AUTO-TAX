import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] ?? "server";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mockDbFile = path.join(rootDir, "data", "mock-preview.db");

function spawnWithInheritedEnv(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

if (mode === "server") {
  spawnWithInheritedEnv(process.execPath, ["dist/server/main.js"], {
    PORT: "4302",
    AUTO_TAX_DB: mockDbFile
  });
} else if (mode === "electron") {
  spawnWithInheritedEnv("electron", ["."], {
    AUTO_TAX_ELECTRON_USE_DIST: "1",
    AUTO_TAX_DB: mockDbFile,
    AUTO_TAX_PORT: "4302"
  });
} else {
  console.error("Usage: node scripts/mock-preview.mjs <server|electron>");
  process.exit(1);
}
