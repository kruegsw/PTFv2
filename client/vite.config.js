import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  root: "src",
  // In production build, the game is served at /ptf/
  // In dev, it's served at root
  base: command === "build" ? "/ptf/" : "/",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
}));
