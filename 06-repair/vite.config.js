import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works both at the dev-server root and when
  // dropped into the docs site at /warp-markers/demos/06-repair/.
  base: "./",
  server: { open: true },
  resolve: { preserveSymlinks: false },
});
