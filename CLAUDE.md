# warp-math — context for Claude Code

## What this repo is
An educational walkthrough of tempo-map / warp-marker math: pure functions, an
integral made visible, the same math driving Web Audio, the meter layer as a
separate concern, and an anomaly-detection chapter for real beat-tracker data.
Six npm workspaces; chapters are read in order.

```
01-the-math       @warp-math/the-math       integral + 4 BPM regimes (closed-form ×3, numerical ×1) + pin()
02-visualise      @warp-math/visualise      Vite + Chart.js: tempo curve + draggable warp map
03-real-audio     @warp-math/real-audio     beat_this .beats parser + plain Web Audio playback
04-meter          @warp-math/meter          barPositionOf / clickForBeat — arithmetic, no calculus
05-messy-data     @warp-math/messy-data     instantaneousBpms / flagAnomalies / monotonicityHoles
docs              @warp-math/docs           VitePress + KaTeX math + Vue demos that import chapter math
```

## Working agreements (recurring across briefs)
- **Never alter derivation comments in `01-the-math`.** The math comments ARE the teaching content; add new ones, don't rewrite.
- **No `@dawcore/*` or `@waveform-playlist/*` dependencies.** Plain Web Audio only.
- **Demos in docs import chapter math from workspace packages**, never a copy. Zero drift is the constraint.
- **Small, labelled commits per task.** Commit messages favor "why" over "what."

## Tests
- `npm test` at the repo root runs all workspaces (Vitest). Last known: 21 + 8 + 8 = 37 green.
- Tests are worked examples: state the property in prose, then assert numerically.

## Docs build pipeline
- `docs/scripts/extract-derivations.mjs` scans chapter `.js` for `// <doc id="...">` … `// </doc>` sentinels, strips `// ` prefixes + `===`/`---` rules, writes Markdown partials to `docs/.generated/` (gitignored). Pages include them via `<!--@include: ./.generated/<id>.md-->`. **Sentinels are the seam; do not paste comment prose into `.md`.**
- Extractor is **math-aware**: indented math-y lines become `$$...$$` display blocks with ASCII → LaTeX (`beta` → `\beta`, `integral 0..X of E db` → `\int_0^X E \, db`, `*` → `\cdot`, etc.); prose lines get Unicode (β, Δ). `RULE (name): expr` paragraphs render as styled blockquote callouts with a Wikipedia "learn more ↗" link from the `RULE_LINKS` map — add new rule names there to wire links automatically.
- `npm run docs:build --workspace docs` runs the extractor (`predocs:build` hook) then `vitepress build`.
- `base: '/warp-markers/'` in `.vitepress/config.mjs` is required for GitHub project Pages — wrong base = broken CSS/JS.
- `markdown: { math: true }` needs `markdown-it-mathjax3` (already in devDeps); KaTeX-style `$...$` and `$$...$$` syntax.
- Mermaid diagrams need `vitepress-plugin-mermaid` + `mermaid` devDeps; wrap `defineConfig` with `withMermaid(...)`. After Mermaid lands the JS bundle exceeds 500 kB — VitePress warns, expected.
- Deploy: `.github/workflows/deploy-docs.yml` on push to `main`. Manual one-time: Settings → Pages → Source = GitHub Actions.

## Common gotchas
- **Chart.js + `maintainAspectRatio: false`** needs a *fixed-height parent* (`<div class="chart-wrap" style="height:320px">` around the `<canvas>`). Without it the canvas grows unboundedly in a CSS feedback loop.
- **VitePress `<ClientOnly>` slot mounts one tick after its wrapping component.** Canvas refs are null at first `onMounted`. Pattern: `onMounted(async () => { await nextTick(); if (!canvas.value) return; … })`.
- **Headless Playwright `AudioContext.currentTime`** advances faster than wallclock (no audio sink). Don't rely on real-time clock behavior in automated playback tests; verify math via deterministic round-trip tables instead.
- **`Read` tool can't open PNGs > 2000px tall.** Full-page screenshots → `type: "jpeg"`.
- **Mermaid's diagram font renders Greek letters poorly** (β looks like B at default size). Use plain-English node names with italic math hints in `<i>...</i>` subtitles, not math glyphs in node/edge labels. Math symbols stay in body text where KaTeX typesets them.
- **Static math figures via Chart.js polygons:** rectangle/trapezoid under a curve = one dataset per polygon with `fill:true` and a `(xL,0) → (xL,y) → (xR,y) → (xR,0)` point sequence. See `docs/components/RiemannRectangles.vue` / `TrapezoidSlices.vue` for the pattern.
- **Existing chapter demos use Chart.js + plain JS.** Stay on that toolchain; do not introduce React, Tailwind, etc.

## Useful one-liners
- Run a chapter's dev server in isolation: `cd <chapter> && npx vite --port 51XX --open=false` (use a unique port; old processes linger as background jobs).
- Preview built docs: `cd docs && npx vitepress preview . --port 5184`.
- Re-run the derivation extractor without a full docs build: `node docs/scripts/extract-derivations.mjs`.
- Handoff briefs (`HANDOFF*.md`) are sometimes untracked. After execution, delete with `rm`; if tracked, `git rm` first.
