import fs from "node:fs";
import path from "node:path";
import express, { type Response } from "express";
import type { AppStore } from "./store-contract.js";

type AppShellDeps = {
  app: express.Express;
  store: AppStore | null;
  requirePlatformAdmin: (res: Response) => unknown;
  webDist: string;
};

export function registerAppShell(deps: AppShellDeps): void {
  const { app, store, requirePlatformAdmin, webDist } = deps;

  app.get("/api/logs", async (_req, res) => {
    requirePlatformAdmin(res);
    if (!store) {
      res.json([]);
      return;
    }

    res.json(await store.listLogs());
  });

  if (!fs.existsSync(webDist)) {
    return;
  }

  app.use(express.static(webDist));
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(webDist, "index.html"));
  });
}
