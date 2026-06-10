# warp-math — context for Claude Code

## What this repo is
An educational walkthrough of tempo-map / warp-marker math, complete at ten
chapters + an appendix (`docs/in-the-wild.md`): the integral and its regimes,
visualization, real audio, meter, messy data and repair, the PPQN grid, and
the warp triptych (bend the sound / bend the grid / bend neither) — with
chapters 08 and 10 proving the tutorial math equivalent to the maintainer's
production `@dawcore/transport` TempoMap/MeterMap. Twelve npm workspaces;
read in order.

```
01-the-math       @warp-math/the-math       integral + 4 BPM regimes (closed-form ×3, numerical ×1) + pin()
02-visualise      @warp-math/visualise      Vite + Chart.js: tempo curve + draggable warp map
03-real-audio     @warp-math/real-audio     beat_this .beats parser + plain Web Audio playback
04-meter          @warp-math/meter          barPositionOf / clickForBeat — arithmetic, no calculus
05-messy-data     @warp-math/messy-data     instantaneousBpms / flagAnomalies / monotonicityHoles
06-repair         @warp-math/repair         insert/delete/move repairs + validateAgainstMeter editor
07-ppqn-grid      @warp-math/ppqn-grid      tick ↔ β ↔ second + alignBeats/segmentRates (warp onto a grid)
08-grid-follows-file  @warp-math/grid-follows-file  inverse warp via @dawcore/transport: beat map → tempo events, audio untouched
09-time-stretch   @warp-math/time-stretch   granular scheduling math: ch07 rates sampled as grains, pitch untouched
10-bar-arithmetic @warp-math/bar-arithmetic barAtTick atlas: bar numbers across meter changes, proven vs MeterMap
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
- `npm test` at the repo root runs all workspaces (Vitest). Last known: 21 + 8 + 8 + 5 + 11 + 15 + 21 + 21 + 21 = 131 green.
- **Known defects in the real beat-map samples** (repaired per issue #10): `otherside.beats` row 56 is a ghost beat (0.100 s gap; the "5/4 bar" is tracker noise, not a meter change — don't cite it as a true meter-change fixture), and `scar_tissue.beats` ends with a phantom 1-beat bar (final beat mislabeled beatInBar=1). `bastard.beats` (Ben Folds) is the GENUINE mixed-meter fixture — 73 meter regions, bars of 1–7 beats, clean beat times — though its many 1/4 bars are partly tracker phase noise. The repair pipeline (ch05 detect → ch06 localize/repair → beats-io export → ch08 conform) lives in `08-grid-follows-file/repair-pipeline.test.js`; `otherside-repaired.beats` is its byte-for-byte output and a regeneration guard asserts that.
- Planned chapters and deferred follow-ups are GitHub issues (`gh issue list`) — check before proposing new chapter work. (#8 meter changes, #9 time-stretch, #10 meter repair are all CLOSED — shipped as chapters 10, 09, and the ch06 relabel/pipeline work respectively.)
- **Chapter 08's tests import `@dawcore/transport` (published npm dist) in Node** — its `TempoMap` is pure (no AudioContext at construction), so the three-way equivalence tests (chapter-01 map ↔ chapter-08 reference ↔ production TempoMap) run headless without mocks.
- **Set `editor.bpm` BEFORE installing tempo events** — the setter forwards to `engine.setTempo`, which writes the adapter's tempo map at tick 0; assigning it after overwrites the tick-0 entry with the median BPM and shifts every beat by a constant offset (wfp#406 measured 97 ms).
- **Never hand-animate `daw-playhead`** — the editor drives it through the `secondsToTicks` bridge *with latency compensation*; manual `startBeatsAnimationWithMap` wiring undoes it.
- **Sanitize beats files at demo boundaries, not in libraries** — `@dawcore/transport` ≥0.0.11 `TempoMap` rejects degenerate BPM, so demos dedupe detections <50 ms apart (1200 BPM ceiling) before planning; chapter libraries stay strict and chapter 05 is the principled treatment.
- **After any `@dawcore/*` version bump:** `npm install && npm test` (chapter 08's equivalence suite is the upgrade canary — it proves the published TempoMap against chapter-01 math), then check upstream commits to `examples/dawcore-native/beat-map-grid.html` for demo-pattern fixes to port, then verify the BUILT bundle (`vite build` + `vite preview`), never dev only.
- IDE TypeScript diagnostics like "Could not find a declaration file for '@warp-math/...'" and `webkitAudioContext` complaints are pre-existing noise — the workspaces are plain JS with no .d.ts; don't chase them.
- **NEVER top-level-await in a bundled Vite entry that uses `@dawcore/components`.** `editor.ready()` dynamically imports `@waveform-playlist/engine`; under production chunking the engine chunk statically imports shared helpers BACK from the entry chunk, and a TLA-suspended entry deadlocks that cycle — silently (no error, pending promises, dead UI), and ONLY in builds (dev serves pre-bundled deps with no back-edge; the upstream unbundled examples are also immune, so don't copy their TLA pattern). Bootstrap inside an `init()` function and gate handlers on its promise — see `08-grid-follows-file/src/main.js`.
- **The grid is always full bars** (maintainer rule): the first downbeat goes on a bar boundary, pickups fill the tail of the bar before it, and the empty lead-in bars run at the first segment's tempo. `gridPlanFromBeats` in chapter 08 encodes this; don't anchor file beat 1 at tick 0 when the `.beats` file declares a pickup.
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
- Handoff briefs (`HANDOFF*.md`) are untracked; delete after execution. **The chapter-handoff pattern is proven (07, 09, 10 — zero test failures):** chat writes pure math + tests against a brief that specs exact APIs, house conventions, and precomputed worked numbers; in-repo work does integration, demos, real-file tests, and wiring. Published `@dawcore/*` packages are pure enough for chat to import in its own equivalence tests.
- **New chapter wiring (six places):** root `workspaces` array; extractor `SOURCES` (+ `RULE_LINKS` for new `RULE (...)` names); the Chapters nav dropdown; the sidebar; the home-page card grid in `docs/index.md`; `build-chapter-demos.mjs` `CHAPTERS` if it ships an app. Chapter links live in the dropdown — the flat top bar was retired at ten chapters.
- **Never commit audio files.** `.beats` maps only; the audio they describe lives in the waveform-playlist beat-demos folder (path in CLAUDE.local.md). `Bastard.wav`-style files at the repo root are working copies, not repo content.
