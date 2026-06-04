<!--
  RepairDemo.vue

  In-docs version of chapter 06's hand-repair editor. Math/ops come from
  @warp-math/repair (no copy); the UI is a thin Vue wrapper around the
  same drawTimeline / pick helpers the standalone demo uses, redrawn here
  so it can react to VitePress's light/dark toggle via chartColors().
-->
<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed, nextTick } from "vue";
import {
  deleteBeat,
  insertBeat,
  moveBeat,
  validateAgainstMeter,
} from "@warp-math/repair";
import { chartColors, onThemeChange } from "./chart-theme.mjs";

const PAD = 24;

// ---------------------------------------------------------------------------
// Default broken fixture, identical to the standalone demo so readers see
// the same starting state in both places. Inlined to avoid the docs build
// having to fetch from the standalone bundle.
// ---------------------------------------------------------------------------
function defaultFixture() {
  const SEC_PER_BEAT = 0.5;
  const markers = [];
  for (let i = 0; i < 16; i++) markers.push({ second: i * SEC_PER_BEAT });
  const downbeatIndices = [0, 4, 8, 12];
  // extra beat at bar 2
  markers.splice(6, 0, { second: 2.75 });
  for (let i = 0; i < downbeatIndices.length; i++) {
    if (downbeatIndices[i] >= 6) downbeatIndices[i] += 1;
  }
  // dropped beat in bar 3
  const bar3Down = downbeatIndices[2];
  const dropIdx = bar3Down + 2;
  markers.splice(dropIdx, 1);
  for (let i = 0; i < downbeatIndices.length; i++) {
    if (downbeatIndices[i] > dropIdx) downbeatIndices[i] -= 1;
  }
  // mistimed last beat of bar 4
  const bar4Down = downbeatIndices[3];
  const lastBeatOfBar4 = bar4Down + 3;
  markers[lastBeatOfBar4] = { second: markers[lastBeatOfBar4].second - 0.04 };
  return { markers, downbeatIndices };
}

const canvas = ref(null);
const ui = reactive({
  markers: [],
  downbeatIndices: [],
  selected: null,
  expectedBpb: 4,
  errorMsg: "",
});

const bars = computed(() =>
  validateAgainstMeter(ui.markers, ui.downbeatIndices, ui.expectedBpb)
);
const summary = computed(() => {
  const realBars = bars.value.filter((b) => !b.isPickup && !b.isTrailing);
  const correct = realBars.filter((b) => b.ok).length;
  return {
    beats: ui.markers.length,
    downs: ui.downbeatIndices.length,
    correct,
    total: realBars.length,
    done: realBars.length > 0 && correct === realBars.length,
  };
});

function reset() {
  const fix = defaultFixture();
  ui.markers = fix.markers;
  ui.downbeatIndices = fix.downbeatIndices;
  ui.selected = null;
  ui.errorMsg = "";
}

// ---------------------------------------------------------------------------
// Canvas drawing. Same layout as the standalone (bar background shading,
// downbeat ticks, beat dots, bar labels) but reading from chartColors()
// each draw so VitePress's dark-mode toggle is respected.
// ---------------------------------------------------------------------------
function draw() {
  const c = canvas.value;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = c.clientWidth;
  const cssH = c.clientHeight;
  if (c.width !== cssW * dpr || c.height !== cssH * dpr) {
    c.width = cssW * dpr;
    c.height = cssH * dpr;
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (ui.markers.length === 0) return;

  const C = chartColors();
  // Per-mode bar fills. Soft-green when ok, soft-red when not, neutral
  // grey for pickup / trailing. Derived from the palette so dark mode adjusts.
  const ok = "rgba(74, 124, 74, 0.20)";
  const bad = "rgba(200, 55, 55, 0.20)";
  const pickup = "rgba(128, 128, 140, 0.18)";

  const dur = ui.markers[ui.markers.length - 1].second + 0.5;
  const xFor = (sec) => PAD + (sec / dur) * (cssW - 2 * PAD);

  // Bar background shading.
  for (const bar of bars.value) {
    const x0 = xFor(ui.markers[bar.fromIndex].second);
    const x1 =
      bar.toIndex + 1 < ui.markers.length
        ? xFor(ui.markers[bar.toIndex + 1].second)
        : xFor(dur);
    let fill = pickup;
    if (!bar.isPickup && !bar.isTrailing) fill = bar.ok ? ok : bad;
    ctx.fillStyle = fill;
    ctx.fillRect(x0, cssH * 0.08, x1 - x0, cssH * 0.6);
  }

  // Bar labels (above) + wrong-count callout (below).
  for (const bar of bars.value) {
    const x = xFor(ui.markers[bar.fromIndex].second);
    if (!bar.isPickup && !bar.isTrailing) {
      ctx.fillStyle = bar.ok ? "#4a7c4a" : "#c83737";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`bar ${bar.bar}`, x, cssH * 0.06);
      if (!bar.ok) {
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(
          `${bar.beatCount} beats — expected ${ui.expectedBpb}`,
          x,
          cssH * 0.78
        );
      }
      ctx.textAlign = "left";
    }
  }

  // Baseline + beat ticks.
  ctx.strokeStyle = C.rule;
  ctx.beginPath();
  ctx.moveTo(PAD, cssH * 0.65);
  ctx.lineTo(cssW - PAD, cssH * 0.65);
  ctx.stroke();
  const downSet = new Set(ui.downbeatIndices);
  for (let i = 0; i < ui.markers.length; i++) {
    const x = xFor(ui.markers[i].second);
    const isDown = downSet.has(i);
    ctx.strokeStyle = isDown ? C.downbeat : C.beat;
    ctx.lineWidth = isDown ? 2.2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, isDown ? cssH * 0.18 : cssH * 0.42);
    ctx.lineTo(x, cssH * 0.65);
    ctx.stroke();
  }

  // Draggable beat dots.
  for (let i = 0; i < ui.markers.length; i++) {
    const x = xFor(ui.markers[i].second);
    const y = cssH * 0.65;
    const isSelected = ui.selected === i;
    const r = isSelected ? 9 : 6;
    ctx.fillStyle = isSelected ? C.accent : C.accent;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isSelected ? C.downbeat : C.markerOutline;
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.stroke();
  }
}

watch([() => ui.markers, () => ui.downbeatIndices, () => ui.selected, () => ui.expectedBpb], draw, { deep: true });

let cleanupTheme = null;
let cleanupResize = null;

onMounted(async () => {
  await nextTick();
  if (!canvas.value) return;
  reset();
  draw();
  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas.value);
  cleanupResize = () => ro.disconnect();
  cleanupTheme = onThemeChange(() => draw());
});
onBeforeUnmount(() => {
  cleanupTheme?.();
  cleanupResize?.();
});

// ---------------------------------------------------------------------------
// Pointer / keyboard wiring -- same model as the standalone demo:
//   pointerdown on a beat dot -> select (start drag)
//   pointerdown elsewhere     -> insert at that time
//   pointermove during drag   -> moveBeat
//   Delete / Backspace        -> deleteBeat on the selected index
// ---------------------------------------------------------------------------
let dragIndex = null;
let dragMoved = false;
let originalMarkers = null;
const HIT_RADIUS = 14;

function pickIndex(clientX, clientY) {
  const rect = canvas.value.getBoundingClientRect();
  const dur = ui.markers[ui.markers.length - 1].second + 0.5;
  const xFor = (sec) => PAD + (sec / dur) * (rect.width - 2 * PAD);
  const y = rect.height * 0.65;
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  let best = null;
  let bestDist = HIT_RADIUS;
  for (let i = 0; i < ui.markers.length; i++) {
    const d = Math.hypot(mx - xFor(ui.markers[i].second), my - y);
    if (d < bestDist) { best = i; bestDist = d; }
  }
  return best;
}
function timeAt(clientX) {
  const rect = canvas.value.getBoundingClientRect();
  const dur = ui.markers[ui.markers.length - 1].second + 0.5;
  const x = clientX - rect.left;
  if (x < PAD || x > rect.width - PAD) return null;
  return ((x - PAD) / (rect.width - 2 * PAD)) * dur;
}
function showError(msg) {
  ui.errorMsg = msg;
  setTimeout(() => { if (ui.errorMsg === msg) ui.errorMsg = ""; }, 3000);
}

function onPointerDown(e) {
  const idx = pickIndex(e.clientX, e.clientY);
  if (idx != null) {
    dragIndex = idx;
    dragMoved = false;
    originalMarkers = ui.markers;
    ui.selected = idx;
    canvas.value.setPointerCapture?.(e.pointerId);
    return;
  }
  const sec = timeAt(e.clientX);
  if (sec == null || sec < 0) return;
  try {
    const r = insertBeat(ui.markers, ui.downbeatIndices, sec);
    ui.markers = r.markers;
    ui.downbeatIndices = r.downbeatIndices;
    ui.selected = r.insertedAt;
  } catch (err) {
    showError(err.message);
  }
}
function onPointerMove(e) {
  if (dragIndex == null) return;
  dragMoved = true;
  const sec = timeAt(e.clientX);
  if (sec == null) return;
  try {
    ui.markers = moveBeat(originalMarkers, dragIndex, sec);
  } catch { /* mid-drag invalid: keep showing original */ }
}
function onPointerUp(e) {
  if (dragIndex == null) return;
  dragIndex = null;
  dragMoved = false;
  originalMarkers = null;
  if (canvas.value?.hasPointerCapture?.(e.pointerId)) {
    canvas.value.releasePointerCapture(e.pointerId);
  }
}
function onKey(e) {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (ui.selected == null) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  e.preventDefault();
  try {
    const r = deleteBeat(ui.markers, ui.downbeatIndices, ui.selected);
    ui.markers = r.markers;
    ui.downbeatIndices = r.downbeatIndices;
    ui.selected = ui.selected > 0 ? ui.selected - 1 : null;
  } catch (err) {
    showError(err.message);
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <ClientOnly>
    <div class="wm-demo">
      <h4>06 · hand-repair editor</h4>
      <div class="controls">
        <button type="button" @click="reset">reset to default (broken)</button>
        <label>beats per bar
          <input type="number" min="2" max="12" v-model.number="ui.expectedBpb" style="width:4em" />
        </label>
        <span class="readout">
          beats {{ summary.beats }} · downbeats {{ summary.downs }} ·
          bars correct {{ summary.correct }} / {{ summary.total }}
        </span>
        <span v-if="summary.done" class="done">all bars correct ✓</span>
      </div>
      <div style="height: 200px;">
        <canvas
          ref="canvas"
          style="width:100%;height:100%;display:block;cursor:pointer;touch-action:none"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        ></canvas>
      </div>
      <p v-if="ui.errorMsg" class="hint" style="color:#c83737;font-style:normal">{{ ui.errorMsg }}</p>
      <p class="hint">
        Drag a beat dot to move it. Click a dot to select, then press
        <kbd>Delete</kbd> to remove it. Click empty space to insert a beat.
        Bars with the expected count glow green; wrong-count bars are flagged
        with the actual count.
      </p>
    </div>
  </ClientOnly>
</template>

<style scoped>
kbd {
  border: 1px solid var(--vp-c-divider);
  border-bottom-width: 2px;
  border-radius: 3px;
  padding: 0 0.35em;
  background: var(--vp-c-bg);
  font-family: var(--vp-font-family-mono);
  font-size: 0.85em;
}
.done {
  background: rgba(74, 124, 74, 0.22);
  color: #4a7c4a;
  padding: 0.2em 0.6em;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.9rem;
}
</style>
