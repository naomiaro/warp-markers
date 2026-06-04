import { defineConfig } from "vite";

// The visualisation imports 01-the-math through the npm workspace symlink,
// so Vite must follow that link when resolving modules.
export default defineConfig({
  // Relative base so the built bundle works at any URL prefix -- the chapter
  // ships both as a standalone dev app AND as a static drop into the docs
  // site at /warp-markers/02-visualise/.
  base: "./",
  server: { open: true },
  resolve: { preserveSymlinks: false },
});
