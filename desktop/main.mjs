import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, shell } from "electron";

const apiServerUrl = "http://127.0.0.1:4300";
const devServerUrl = "http://127.0.0.1:5173";
const useEmbeddedServer = app.isPackaged || process.env.AUTO_TAX_ELECTRON_USE_DIST === "1";

let mainWindow = null;
let embeddedServer = null;

async function waitForServerReady(url, retries = 50) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the local server is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error("AUTO-TAX 로컬 서버 시작을 확인하지 못했습니다.");
}

async function startEmbeddedServer() {
  if (embeddedServer) return embeddedServer;

  const appRoot = app.getAppPath();
  const databaseFile = path.join(app.getPath("userData"), "auto-tax.db");
  const serverModuleUrl = pathToFileURL(path.join(appRoot, "dist", "server", "main.js")).href;
  const { startServer } = await import(serverModuleUrl);

  embeddedServer = startServer({
    rootDir: appRoot,
    databaseFile,
    port: 4300
  });

  await waitForServerReady(apiServerUrl);
  return embeddedServer;
}

function stopEmbeddedServer() {
  if (!embeddedServer) return;
  embeddedServer.scheduler.stop();
  embeddedServer.server.close();
  embeddedServer = null;
}

async function createMainWindow() {
  if (useEmbeddedServer) {
    await startEmbeddedServer();
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), "desktop", "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(useEmbeddedServer ? apiServerUrl : devServerUrl);

  if (!useEmbeddedServer) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  void createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  stopEmbeddedServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
