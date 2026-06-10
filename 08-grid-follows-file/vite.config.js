import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built bundle works at any URL prefix -- the chapter
  // ships both as a standalone dev app AND as a static drop into the docs
  // site at /warp-markers/08-grid-follows-file/.
  base: "./",
  // NOTE: no top-level await in src/main.js -- under production chunking
  // the dynamically-imported engine chunk statically imports shared
  // helpers back from the entry chunk, and a TLA-suspended entry module
  // deadlocks that cycle silently. Keep the bootstrap inside init().
  server: { open: true },
  resolve: { preserveSymlinks: false },
});
