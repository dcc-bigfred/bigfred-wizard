import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const devHost = process.env.HOST || "localhost";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // material-ui-flags still imports SvgIcon from @material-ui/core (v4).
    alias: {
      "@material-ui/core": path.resolve(rootDir, "node_modules/@mui/material"),
    },
  },
  server: {
    host: devHost,
    allowedHosts: ["bigfred-wizard.local", "bigfred.local"],
    port: 5175,
    proxy: {
      "/api": { target: "http://localhost:8091", changeOrigin: true },
      "/healthz": { target: "http://localhost:8091", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    // The hub tablet ships an older Chromium; keep the bundle in range.
    target: "chrome87",
    sourcemap: false,
  },
});
