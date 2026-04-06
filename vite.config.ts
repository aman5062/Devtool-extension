import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        popup: resolve(__dirname, "popup.html"),
        dashboard: resolve(__dirname, "dashboard.html"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") return "background.js";
          if (chunkInfo.name === "content") return "content.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        // Force all background dependencies into the background chunk
        manualChunks(id, { getModuleInfo }) {
          const mod = getModuleInfo(id);
          if (!mod) return;
          // If this module is only imported by the background entry, keep it there
          const importers = mod.importers ?? [];
          const isOnlyUsedByBackground = importers.every(
            (imp) => imp.includes("background") || imp.includes("filterLogic")
          );
          if (isOnlyUsedByBackground) return; // let rollup inline it into background.js
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
});
