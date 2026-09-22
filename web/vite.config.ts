import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The portal is served by the Node app from web/dist. In dev, proxy the API
// routes to the local server so `npm run dev` here works against it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:8080",
      "/admin": "http://localhost:8080",
      "/v1": "http://localhost:8080",
      "/status": "http://localhost:8080",
      "/health": "http://localhost:8080",
    },
  },
  build: { outDir: "dist" },
});
