import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devHost = process.env.HOST || "localhost";

export default defineConfig({
  plugins: [react()],
  server: {
    host: devHost,
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
