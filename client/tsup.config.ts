import { defineConfig } from "tsup";

export default defineConfig([
  // Existing ESM/CJS build (unchanged behaviour)
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: false,
    clean: false,
    outDir: "dist",
    platform: "browser",
    treeshake: true,
    splitting: true,
    skipNodeModulesBundle: false,
    esbuildOptions(options) {
      options.define = {
        ...options.define,
        "process.env.NODE_ENV": '"production"',
      };
    },
  },
  // Standalone IIFE bundle for CDN / <script> tag usage
  {
    entry: { paymaster: "src/standalone.ts" },
    format: ["iife"],
    globalName: "Paymaster",
    minify: true,
    sourcemap: false,
    clean: false,
    outDir: "dist",
    platform: "browser",
    // Rename output from paymaster.global.js → paymaster.min.js
    outExtension: () => ({ js: ".min.js" }),
    // Bundle @stellar/stellar-sdk so the output is fully self-contained
    noExternal: [/.*/],
    esbuildOptions(options) {
      options.define = {
        ...options.define,
        "process.env.NODE_ENV": '"production"',
        // Prevent dotenv / Node built-ins from breaking in the browser
        "process.env": "{}",
        global: "globalThis",
      };
    },
  },
  // CLI build
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["cjs"],
    clean: false,
    outDir: "dist",
    platform: "node",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
