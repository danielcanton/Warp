import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    host: true,
    https: false,
  },
  build: {
    outDir: "dist",
    target: "es2020",
  },
});
