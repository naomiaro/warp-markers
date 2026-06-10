<!--
  MeterDemo.vue

  In-docs version of chapter 04's "meter is not tempo" demo. Math comes from
  @warp-math/meter (barPositionOf) and @warp-math/the-math (piecewiseConstantMap,
  pin). Renders the beat timeline + a proof table that highlights downbeats;
  dragging the middle warp marker moves the downbeat IN SECONDS but never
  in identity.
-->
<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { barPositionOf } from "@warp-math/meter/meter.js";
import { piecewiseConstantMap } from "@warp-math/the-math/tempo-map.js";
import { pin } from "@warp-math/the-math/warp-marker.js";
import { chartColors, onThemeChange } from "./chart-theme.mjs";

const N_BEATS = 12;

const PRESETS = {
  "4-4": [{ fromBeat: 0, beatsPerBar: 4 }],
  "3-4": [{ fromBeat: 0, beatsPerBar: 3 }],
  switch: [
    { fromBeat: 0, beatsPerBar: 4 },
    { fromBeat: 8, beatsPerBar: 3 },
  ],
};

function defaultWarpModel(bpm) {
  const secPerBeat = 60 / bpm;
  const mid = Math.floor(N_BEATS / 2);
  // No {beat:0, second:0} anchor -- beat maps don't have a beat 0; the
  // math layer's implicit lead-in segment handles the gap from (0,0)
  // to the first marker.
  return [
    { beat: mid, second: mid * secPerBeat },
    { beat: N_BEATS, second: N_BEATS * secPerBeat },
  ];
}

const ui = reactive({
  preset: "switch",
  bpm: 120,
  model: defaultWarpModel(120),
});

const canvas = ref(null);

function tempoMap() {
  return piecewiseConstantMap(ui.model);
}
function durationSec() {
  return ui.model[ui.model.length - 1].second + 0.5;
}

// --- canvas drawing --------------------------------------------------------
// Reads palette from chartColors() each draw so dark-mode toggle works
// automatically -- a MutationObserver below re-calls draw() on .dark toggle.
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

  const C = chartColors();
  const pad = 24;
  const dur = durationSec();
  const map = tempoMap();
  const meterMap = PRESETS[ui.preset];
  const xFor = (sec) => pad + (sec / dur) * (cssW - 2 * pad);

  ctx.strokeStyle = C.rule;
  ctx.beginPath();
  ctx.moveTo(pad, cssH * 0.7);
  ctx.lineTo(cssW - pad, cssH * 0.7);
  ctx.stroke();

  // i is the 0-based beat index (barPositionOf convention); beatsToSeconds
  // wants the 1-indexed beat number (i + 1). Matches the table below.
  for (let i = 0; i < N_BEATS; i++) {
    const sec = map.beatsToSeconds(i + 1);
    const { bar, isDownbeat } = barPositionOf(meterMap, i);
    const x = xFor(sec);
    ctx.strokeStyle = isDownbeat ? C.downbeat : C.beat;
    ctx.lineWidth = isDownbeat ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, isDownbeat ? cssH * 0.15 : cssH * 0.42);
    ctx.lineTo(x, cssH * 0.7);
    ctx.stroke();
    if (isDownbeat) {
      ctx.fillStyle = C.axis;
      ctx.font = "11px monospace";
      ctx.fillText(`bar ${bar}`, x + 3, cssH * 0.12);
    }
  }

  // warp markers
  for (const m of ui.model) {
    const x = xFor(m.second);
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.arc(x, cssH * 0.7, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.markerOutline;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// --- drag-to-pin -----------------------------------------------------------
let dragIndex = null;
let originalModel = null;
function pickMarker(evt) {
  const rect = canvas.value.getBoundingClientRect();
  const dur = durationSec();
  const pad = 24;
  const xFor = (sec) => pad + (sec / dur) * (rect.width - 2 * pad);
  const mx = evt.clientX - rect.left;
  const my = evt.clientY - rect.top;
  let best = null;
  let bestD = 16;
  // Skip the LAST marker (right-edge anchor). All other markers are draggable.
  for (let k = 0; k < ui.model.length - 1; k++) {
    const x = xFor(ui.model[k].second);
    const y = rect.height * 0.7;
    const d = Math.hypot(mx - x, my - y);
    if (d < bestD) { best = k; bestD = d; }
  }
  return best;
}
function pointerToSec(evt) {
  const rect = canvas.value.getBoundingClientRect();
  const pad = 24;
  return ((evt.clientX - rect.left - pad) / (rect.width - 2 * pad)) * durationSec();
}
function onDown(e) {
  const idx = pickMarker(e);
  if (idx == null) return;
  dragIndex = idx;
  originalModel = ui.model;
  canvas.value.setPointerCapture?.(e.pointerId);
}
function onMove(e) {
  if (dragIndex == null) return;
  try {
    ui.model = pin(originalModel, originalModel[dragIndex].beat, pointerToSec(e));
  } catch {}
}
function onUp(e) {
  if (dragIndex == null) return;
  dragIndex = null;
  originalModel = null;
  if (canvas.value.hasPointerCapture?.(e.pointerId)) canvas.value.releasePointerCapture(e.pointerId);
}

watch(() => [ui.preset, ui.bpm, ui.model], draw, { deep: true });
watch(() => ui.bpm, (b) => { ui.model = defaultWarpModel(b); });

let cleanupTheme = null;

onMounted(async () => {
  await nextTick();
  if (!canvas.value) return;
  canvas.value.addEventListener("pointerdown", onDown);
  canvas.value.addEventListener("pointermove", onMove);
  canvas.value.addEventListener("pointerup", onUp);
  draw();
  // redraw on resize OR theme toggle
  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas.value);
  cleanupTheme = onThemeChange(() => draw());
});

onBeforeUnmount(() => cleanupTheme?.());
</script>

<template>
  <ClientOnly>
    <div class="wm-demo">
      <h4>04 · tempo decides WHEN, meter decides WHAT</h4>
      <div class="controls">
        <label><input type="radio" v-model="ui.preset" value="4-4" /> 4/4</label>
        <label><input type="radio" v-model="ui.preset" value="3-4" /> 3/4</label>
        <label><input type="radio" v-model="ui.preset" value="switch" /> 4/4 → 3/4 at bar 3</label>
        <label>BPM <input type="range" min="60" max="200" v-model.number="ui.bpm" />
          <span class="readout">{{ ui.bpm }}</span></label>
      </div>
      <div style="height: 180px;"><canvas ref="canvas" style="width:100%;height:100%;display:block;cursor:grab;"></canvas></div>
      <p class="hint">
        Tall stroke = downbeat (per barPositionOf). Orange dot = draggable warp
        marker. Drag the middle dot left/right and watch the downbeat seconds
        shift in the table below while the bar/position columns sit still.
      </p>

      <table>
        <thead><tr><th>beat</th><th>bar (meter)</th><th>beat in bar (meter)</th><th>second (tempo)</th></tr></thead>
        <tbody>
          <!-- v-for "i in N" iterates i = 1..N (Vue convention). i is the
               1-based beat number we display AND pass to beatsToSeconds.
               barPositionOf still takes a 0-based beatIndex (i - 1). -->
          <template v-for="i in N_BEATS" :key="i">
            <tr :class="{ flag: barPositionOf(PRESETS[ui.preset], i - 1).isDownbeat }">
              <td>{{ i }}</td>
              <td>{{ barPositionOf(PRESETS[ui.preset], i - 1).bar }}</td>
              <td>{{ barPositionOf(PRESETS[ui.preset], i - 1).positionInBar }}</td>
              <td>{{ tempoMap().beatsToSeconds(i).toFixed(3) }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </ClientOnly>
</template>
