import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** After build, inject the app-shell file list and a build id into dist/sw.js. */
function serviceWorkerManifest(): Plugin {
  return {
    name: "sw-precache-manifest",
    apply: "build",
    closeBundle() {
      const dist = join(__dirname, "dist");
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (!p.endsWith("sw.js") && !p.endsWith(".map")) files.push("./" + relative(dist, p).split("\\").join("/"));
        }
      };
      walk(dist);
      const swPath = join(dist, "sw.js");
      const id = Date.now().toString(36);
      const src = readFileSync(swPath, "utf8")
        .replace("__BUILD_ID__", id)
        .replace("self.__PRECACHE__ || []", JSON.stringify(["./", ...files]));
      writeFileSync(swPath, src);
    },
  };
}

export default defineConfig({
  // Relative base so the same build works at /<repo>/ on GitHub Pages and at / locally.
  base: "./",
  plugins: [react(), serviceWorkerManifest()],
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
  test: { environment: "node" },
} as never);
