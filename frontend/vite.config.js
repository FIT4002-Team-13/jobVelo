import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    exclude: ["**/node_modules/**", "e2e/**"],
  },
  server: {
    port: 5173,
    proxy: {
      // ws:true is required so /api WebSocket upgrades (e.g. realtime
      // interview transcription) get proxied through to FastAPI in dev.
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
