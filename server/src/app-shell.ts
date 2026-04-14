import fs from "node:fs";
import path from "node:path";
import express, { type Response } from "express";
import type { AppStore } from "./store-contract.js";

type AppShellDeps = {
  app: express.Express;
  store: AppStore | null;
  requirePlatformAdmin: (res: Response) => unknown;
  webDist: string;
  renewalHelperZipPath?: string | null;
};

export function registerAppShell(deps: AppShellDeps): void {
  const { app, store, requirePlatformAdmin, webDist, renewalHelperZipPath } = deps;
  const renewalHelperMetadataPath = renewalHelperZipPath
    ? path.join(path.dirname(renewalHelperZipPath), "renewal-local-helper.json")
    : null;

  app.get("/api/logs", async (_req, res) => {
    requirePlatformAdmin(res);
    if (!store) {
      res.json([]);
      return;
    }

    res.json(await store.listLogs());
  });

  app.get("/downloads/renewal-local-helper.zip", (_req, res, next) => {
    if (!renewalHelperZipPath || !fs.existsSync(renewalHelperZipPath)) {
      next();
      return;
    }

    res.download(renewalHelperZipPath, "renewal-local-helper.zip");
  });

  app.get("/downloads/renewal-local-helper.json", (_req, res, next) => {
    if (!renewalHelperMetadataPath || !fs.existsSync(renewalHelperMetadataPath)) {
      next();
      return;
    }

    res.type("application/json");
    res.sendFile(renewalHelperMetadataPath);
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
