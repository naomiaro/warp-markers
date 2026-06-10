# warp-math — context for Claude Code

## What this repo is
An educational walkthrough of tempo-map / warp-marker math: pure functions, an
integral made visible, the same math driving Web Audio, the meter layer as a
separate concern, and an anomaly-detection chapter for real beat-tracker data.
Nine npm workspaces; chapters are read in order.

```
01-the-math       @warp-math/the-math       integral + 4 BPM regimes (closed-form ×3, numerical ×1) + pin()
02-visualise      @warp-math/visualise      Vite + Chart.js: tempo curve + draggable warp map
03-real-audio     @warp-math/real-audio     beat_this .beats parser + plain Web Audio playback
04-meter          @warp-math/meter          barPositionOf / clickForBeat — arithmetic, no calculus
05-messy-data     @warp-math/messy-data     instantaneousBpms / flagAnomalies / monotonicityHoles
06-repair         @warp-math/repair         insert/delete/move repairs + validateAgainstMeter editor
07-ppqn-grid      @warp-math/ppqn-grid      tick ↔ β ↔ second + alignBeats/segmentRates (warp onto a grid)
shared-beats-io   @warp-math/beats-io       .beats TSV parse/export + meterMapFromBeats (shared by chapters)
docs              @warp-math/docs           VitePress + KaTeX math + Vue demos that import chapter math
```

## Working agreements (recurring across briefs)
- **Always update this CLAUDE.md when you learn something non-obvious** about the repo, toolchain, or a gotcha that bit you. Future Claude shouldn't have to rediscover it.
- **Four number systems coexist; don't conflate them.** (1) **Array index** — 0-based, JS convention, used to access `markers[]`. (2) **`.beat` field / beat number** — 1-based, matches `beat_this`'s convention that beat maps never have a beat 0. (3) **β** — continuous integration variable, `β = 0` is the integration anchor before any beat. (4) **tick** (chapter 07) — 0-based *integer*, tick 0 anchored at beat 1 (DAW position 1.1.0), so `β = tick/PPQN + 1`; fractional ticks are rejected by design. `barPositionOf` accepts a 0-based `beatIndex` but returns 1-based `bar` and `positionInBar`. The first marker is `{beat: 1, second: t_first}` with no `{0,0}` sentinel; the math layer's implicit lead-in segment handles the gap from (0,0) to the first marker.
- **Never alter derivation comments in `01-the-math`.** The math comments ARE the teaching content; add new ones, don't rewrite.
- **Core chapters (01–07) stay plain Web Audio** — no `@dawcore/*` or `@waveform-playlist/*` there. **Advanced chapters (08+) may use `@dawcore/*`** (rule amended 2026-06-10): they bridge the tutorial math into the maintainer's production packages — e.g. `@dawcore/transport`'s `TempoMap` implements the same three regimes chapter 01 derives (step = piecewise-constant, linear = the ln closed form, curve = trapezoidal), tick-based per chapter 07.
- **Demos in docs import chapter math from workspace packages**, never a copy. Zero drift is the constraint.
- **Small, labelled commits per task.** Commit messages favor "why" over "what."

## Tests
- `npm test` at the repo root runs all workspaces (Vitest). Last known: 21 + 8 + 8 + 5 + 7 + 15 = 64 green.
- Tests are worked examples: state the property in prose, then assert numerically.
- **The canvas/demo layer is untested** — and that's exactly where index/beat conflation hides. A 0-based array index passed to `beatsToSeconds` doesn't throw (β = 0 is the legal anchor, returning second 0); it silently draws everything one beat early. The 2026-06 audit found this exact bug in three renderers that all postdated the 1-indexing refactor. When touching draw code, prefer `model[i].beat` over `i + 1` arithmetic at the call site — it stays correct if numbering ever changes again.

## Docs build pipeline
- `docs/scripts/extract-derivations.mjs` scans chapter `.js` for `// <doc id="...">` … `// </doc>` sentinels, strips `// ` prefixes + `===`/`---` rules, writes Markdown partials to `docs/.generated/` (gitignored). Pages include them via `<!--@include: ./.generated/<id>.md-->`. **Sentinels are the seam; do not paste comment prose into `.md`.**
- Extractor is **math-aware**: indented math-y lines become `$$...$$` display blocks with ASCII → LaTeX (`beta` → `\beta`, `integral 0..X of E db` → `\int_0^X E \, db`, `*` → `\cdot`, etc.); prose lines get Unicode (β, Δ). `RULE (name): expr` paragraphs render as styled blockquote callouts with a Wikipedia "learn more ↗" link from the `RULE_LINKS` map — add new rule names there to wire links automatically.
- `npm run docs:build --workspace docs` runs the extractor (`predocs:build` hook) then `vitepress build`.
- `base: '/warp-markers/'` in `.vitepress/config.mjs` is required for GitHub project Pages — wrong base = broken CSS/JS.
- `markdown: { math: true }` needs `markdown-it-mathjax3` (already in devDeps); KaTeX-style `$...$` and `$$...$$` syntax.
- Mermaid diagrams need `vitepress-plugin-mermaid` + `mermaid` devDeps; wrap `defineConfig` with `withMermaid(...)`. After Mermaid lands the JS bundle exceeds 500 kB — VitePress warns, expected.
- **Sitemap config:** VitePress emits sitemap URLs *without* the `base` prefix. With `base: '/warp-markers/'`, use `sitemap: { hostname: 'https://naomiaro.github.io', transformItems: (items) => items.map(i => ({ ...i, url: \`warp-markers/${i.url}\` })) }`. Pattern lifted from `/Users/naomiaro/Code/opendaw-headless/documentation/.vitepress/config.ts`. Output at `<base>/sitemap.xml` after `vitepress build`.
- **robots.txt on GitHub project Pages is path-scoped, not domain-authoritative.** Crawlers look at `https://naomiaro.github.io/robots.txt`, which is owned by the user-pages repo (different repo) -- a robots.txt at `/warp-markers/robots.txt` only governs paths under that prefix and only for crawlers that honor path-scoped policies. Keep one in `docs/public/robots.txt` to declare the sitemap location, but also submit the sitemap URL directly via Google Search Console / Bing Webmaster Tools so it's discovered independently.
- **Goatcounter analytics on localhost is a no-op** by design — its script logs "not counting because of: localhost" rather than firing on dev traffic. Don't treat that warning as a bug; counting starts once deployed.
- **Standalone chapter demos are hosted at `/warp-markers/demos/<chapter>/`.** `docs/scripts/build-chapter-demos.mjs` runs each chapter's `npm run build` (each has `base: "./"` so the bundle works at any URL prefix) and copies the result into `docs/public/demos/<chapter>/`; VitePress includes it in the final Pages artifact. The `/demos/` prefix avoids a route collision with the chapter `.md` pages at `/warp-markers/<chapter>/`. Pages link to them via raw `<a target="_blank">` (not Markdown links) so VitePress's SPA router doesn't intercept and 404. `ignoreDeadLinks` whitelists `/warp-markers/demos/`.
- **VitePress link-writing convention:** in Markdown, internal links are written WITHOUT the `base` prefix (VitePress prepends it automatically). Raw HTML `<a href>` must include the full `base + path` (no auto-prepend on HTML). Picking the wrong one produces either `/warp-markers/warp-markers/...` (double-base in Markdown) or a missing-base 404 (in HTML).
- Deploy: `.github/workflows/deploy-docs.yml` on push to `main`. Manual one-time: Settings → Pages → Source = GitHub Actions.

## Common gotchas
- **Chart.js + `maintainAspectRatio: false`** needs a *fixed-height parent* (`<div class="chart-wrap" style="height:320px">` around the `<canvas>`). Without it the canvas grows unboundedly in a CSS feedback loop.
- **VitePress `<ClientOnly>` slot mounts one tick after its wrapping component.** Canvas refs are null at first `onMounted`. Pattern: `onMounted(async () => { await nextTick(); if (!canvas.value) return; … })`.
- **Headless Playwright `AudioContext.currentTime`** advances faster than wallclock (no audio sink). Don't rely on real-time clock behavior in automated playback tests; verify math via deterministic round-trip tables instead.
- **`Read` tool can't open PNGs > 2000px tall.** Full-page screenshots → `type: "jpeg"`.
- **Mermaid's diagram font renders Greek letters poorly** (β looks like B at default size). Use plain-English node names with line-break subtitles, not math glyphs in node/edge labels. Math symbols stay in body text where KaTeX typesets them.
- **Mermaid edge labels clip on the right when the diagram is downscaled** (default `htmlLabels: true` uses `<foreignObject>` HTML, which doesn't scale with the SVG viewBox). Set `flowchart: { htmlLabels: false }` in the mermaid config so labels are `<text>`/`<tspan>` and scale uniformly. Cost: HTML tags (`<br/>`, `<b>`, `<i>`) no longer render in labels — use `\n` for line breaks, single-word first-line for emphasis.
- **Mermaid renders once per page; it does NOT re-render on VitePress's light/dark toggle.** Don't hard-code colors in `classDef`/`linkStyle` — they become invisible in the other mode. Drive all colors via CSS in `docs/.vitepress/theme/custom.css` using VitePress CSS vars (`--vp-c-bg-soft`, `--vp-c-text-1`, `--vp-c-brand-1`, `--vp-c-text-3`). Same pattern applies to any other "render-once" content (KaTeX, manually-styled SVGs) — use VitePress CSS vars, not literal hex.
- **Chart.js / canvas visuals need a theme-aware palette** — CSS vars don't reach `<canvas>` (bitmap, not SVG). Pattern in `docs/components/chart-theme.mjs`: `chartColors()` returns a `LIGHT` or `DARK` palette by reading `documentElement.classList.contains("dark")`; `applyChartDefaults(Chart)` sets axis/grid colors before construction; `onThemeChange(cb)` is a MutationObserver shim that fires on `.dark` toggle so components can destroy+rebuild. Each chart component reads `chartColors()` at build time and calls `onThemeChange` to rebuild on toggle.
- **Static math figures via Chart.js polygons:** rectangle/trapezoid under a curve = one dataset per polygon with `fill:true` and a `(xL,0) → (xL,y) → (xR,y) → (xR,0)` point sequence. See `docs/components/RiemannRectangles.vue` / `TrapezoidSlices.vue` for the pattern.
- **Existing chapter demos use Chart.js + plain JS.** Stay on that toolchain; do not introduce React, Tailwind, etc.

## Useful one-liners
- Run a chapter's dev server in isolation: `cd <chapter> && npx vite --port 51XX --open=false` (use a unique port; old processes linger as background jobs).
- Preview built docs: `cd docs && npx vitepress preview . --port 5184`.
- Re-run the derivation extractor without a full docs build: `node docs/scripts/extract-derivations.mjs`.
- Handoff briefs (`HANDOFF*.md`) are sometimes untracked. After execution, delete with `rm`; if tracked, `git rm` first.
