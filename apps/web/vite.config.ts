import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // The drawing board loads its fonts from here (see features/drawing-board) instead of a CDN, so it works offline.
    viteStaticCopy({
      targets: [{ src: "node_modules/@excalidraw/excalidraw/dist/prod/fonts/**/*", dest: "excalidraw/fonts", rename: { stripBase: 6 } }],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": process.env.BRIDGE_URL ?? "http://127.0.0.1:8787",
    },
  },
});
