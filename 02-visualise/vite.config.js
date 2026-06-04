import { defineConfig } from "vite";

// The visualisation imports 01-the-math through the npm workspace symlink,
// so Vite must follow that link when resolving modules.
export default defineConfig({
  server: { open: true },
  resolve: { preserveSymlinks: false },
});
