import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the API runs in Docker on 8090; Vite forwards API and CV requests to it.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8090", "/cv": "http://localhost:8090" } },
});
