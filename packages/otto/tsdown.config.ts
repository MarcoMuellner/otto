import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  platform: "node",
  format: ["esm"],
  banner: {
    js: [
      'import { fileURLToPath } from "node:url";',
      'import { dirname as __ottoDirname } from "node:path";',
      "const __filename = fileURLToPath(import.meta.url);",
      "const __dirname = __ottoDirname(__filename);",
    ].join("\n"),
  },
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: [/.*/],
  inlineOnly: false,
})
