import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    mcp: "server/mcp.ts",
    cli: "server/cli.ts",
  },
  outDir: "dist-server",
  format: ["esm"],
  target: "node18",
  platform: "node",
  splitting: false,
  clean: true,
});
