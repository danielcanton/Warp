import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/apple-touch-icon.png",
        "og.jpg",
        "og.png",
      ],
      manifest: {
        name: "WarpLab — Feel Spacetime Bend",
        short_name: "WarpLab",
        description:
          "Interactive gravitational wave visualizer. Watch black holes merge in 3D, hear the chirp, explore 90+ real events from LIGO/Virgo/KAGRA.",
        theme_color: "#000005",
        background_color: "#000005",
        display: "standalone",
        start_url: "/app.html",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,glsl,vert,frag}"],
        globIgnores: ["strain/**"],
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/gwosc\.org\/.*$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "gwosc-catalog",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
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
