import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = path.resolve(webRoot, "..");

export default defineConfig({
  root: webRoot,
  envDir: projectRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(webRoot, "src")
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4300"
    }
  },
  build: {
    outDir: path.resolve(webRoot, "../dist/web"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react";
          }
          if (id.includes("node_modules/@supabase/supabase-js")) {
            return "supabase";
          }
          if (id.includes("node_modules/@e965/xlsx")) {
            return "xlsx";
          }
          return undefined;
        }
      }
    }
  }
});
