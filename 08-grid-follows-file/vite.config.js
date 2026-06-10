import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built bundle works at any URL prefix -- the chapter
  // ships both as a standalone dev app AND as a static drop into the docs
  // site at /warp-markers/08-grid-follows-file/.
  base: "./",
  // The entry module top-level-awaits editor.ready() (the dawcore engine
  // bootstrap, same pattern as waveform-playlist's own examples); the
  // default es2020 target rejects TLA, so target the modern baseline.
  build: { target: "esnext" },
  server: { open: true },
  resolve: { preserveSymlinks: false },
});
