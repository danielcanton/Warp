import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [tailwindcss()],
  server: {
    host: true,
    https: false,
  },
  build: {
    outDir: "dist",
    target: "es2020",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
      },
    },
  },
});
