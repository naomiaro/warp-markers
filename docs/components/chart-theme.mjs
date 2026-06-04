// ===========================================================================
// chart-theme.mjs
//
// One helper that every chart / canvas component asks for its palette, so the
// docs site's interactive visuals stay readable when the reader flips
// VitePress's dark-mode toggle.
//
// Why this exists instead of CSS-only theming: Chart.js draws to a <canvas>
// (bitmap, not SVG), so CSS variables don't reach the rendered pixels --
// we have to feed Chart.js literal color values at construction time. To
// adapt to the toggle, components destroy and rebuild the chart when the
// `.dark` class on <html> changes. The helper exposes a MutationObserver
// shim so each component doesn't have to wire that itself.
// ===========================================================================

function isDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

// Both palettes were chosen to clear roughly 4.5:1 contrast against their
// respective backgrounds (the WCAG AA target for body text). The accent
// orange (#b8470b in light, #f08648 in dark) is the only color that doesn't
// adapt -- it's used for highlights against neutral backgrounds in both modes
// and reads in both.
const LIGHT = {
  line: "#2a2a30",
  axis: "#2a2a30",
  grid: "#e9e4d9",
  accent: "#b8470b",
  accentSoft: "rgba(184, 71, 11, 0.18)",
  accentStrong: "rgba(184, 71, 11, 0.32)",
  markerOutline: "#faf7f2",
  flag: "#c83737",
  ok: "#4a7c4a",
  downbeat: "#2a2a30",
  beat: "#6b6b75",
  rule: "#cdc9c1",
};
const DARK = {
  line: "#e6e6e6",
  axis: "#c8c8c8",
  grid: "#3a3a40",
  accent: "#f08648",          // brighter orange so it doesn't get muddy on dark
  accentSoft: "rgba(240, 134, 72, 0.22)",
  accentStrong: "rgba(240, 134, 72, 0.38)",
  markerOutline: "#1b1b1f",
  flag: "#ff7a7a",            // brighter red for dark-mode readability
  ok: "#7eb37e",
  downbeat: "#f0f0f0",
  beat: "#a8a8a8",
  rule: "#4a4a4f",
};

export function chartColors() {
  return isDark() ? DARK : LIGHT;
}

// Apply Chart.js global defaults (axis text + tick color, default grid color).
// Call once per chart construction; effective for charts created AFTER the call.
export function applyChartDefaults(Chart) {
  const C = chartColors();
  Chart.defaults.color = C.axis;
  Chart.defaults.borderColor = C.grid;
}

// Wire a callback that fires whenever the .dark class on <html> toggles.
// Returns a cleanup function. Safe in SSR (returns a no-op).
export function onThemeChange(cb) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => {};
  }
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "class") {
        cb(chartColors());
        return;
      }
    }
  });
  obs.observe(document.documentElement, { attributes: true });
  return () => obs.disconnect();
}
