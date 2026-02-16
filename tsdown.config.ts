import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  platform: "node",
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: [/.*/],
  inlineOnly: false,
})
