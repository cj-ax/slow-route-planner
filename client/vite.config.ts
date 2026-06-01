import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to the local Express server so the app works with no
    // .env (client uses same-origin "/api", just like on Vercel).
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  // @srp/shared is a source-only workspace package; don't pre-bundle it.
  optimizeDeps: {
    exclude: ["@srp/shared"],
  },
});
