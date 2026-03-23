import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("autoTaxDesktop", {
  isDesktopApp: true,
  platform: process.platform
});
