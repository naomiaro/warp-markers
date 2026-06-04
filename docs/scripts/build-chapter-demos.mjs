#!/usr/bin/env node
// ===========================================================================
// build-chapter-demos.mjs
//
// Builds each chapter's standalone Vite app and drops the result into
// docs/public/<chapter>/ so VitePress includes it in the final Pages
// artifact. After deploy, the standalone demos are reachable at:
//
//   https://naomiaro.github.io/warp-markers/02-visualise/
//   https://naomiaro.github.io/warp-markers/03-real-audio/
//   https://naomiaro.github.io/warp-markers/04-meter/
//   https://naomiaro.github.io/warp-markers/05-messy-data/
//
// Each chapter has `base: "./"` in its vite.config.js so the bundle uses
// relative asset paths and works under any URL prefix without rebuild.
// ===========================================================================
import { execFileSync } from "node:child_process";
import { rmSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
// Standalone demo bundles land under public/demos/<chapter>/ to avoid a route
// collision with the chapter MD pages at /warp-markers/<chapter>/, which
// VitePress's cleanUrls already maps to <chapter>.md.
const publicDir = resolve(here, "..", "public", "demos");

// Chapter folders whose `npm run build` script we run. The URL path under
// /warp-markers/ matches the folder name.
const CHAPTERS = [
  "02-visualise",
  "03-real-audio",
  "04-meter",
  "05-messy-data",
  "06-repair",
];

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

for (const chapter of CHAPTERS) {
  console.log(`\n=== ${chapter} ===`);
  const chapterDir = resolve(repoRoot, chapter);
  if (!existsSync(chapterDir)) {
    console.warn(`  ! ${chapter} folder missing, skipping`);
    continue;
  }
  // execFileSync with an arg array instead of execSync's shell string:
  // no shell parsing, no metacharacter risk even though our inputs are
  // hardcoded here (CHAPTERS / "npm" / "run" / "build").
  execFileSync("npm", ["run", "build"], { cwd: chapterDir, stdio: "inherit" });
  const distDir = resolve(chapterDir, "dist");
  const target = resolve(publicDir, chapter);
  if (existsSync(target)) rmSync(target, { recursive: true });
  cpSync(distDir, target, { recursive: true });
  console.log(`  -> ${target}`);
}
console.log(`\nbuilt ${CHAPTERS.length} chapter demo(s) into ${publicDir}`);
