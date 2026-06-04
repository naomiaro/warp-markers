<!--
  VisualiseDemo.vue

  In-docs version of chapter 02's tempo-curve + warp-map demo. The math comes
  from the SAME @warp-math/the-math package the standalone page uses; this
  file is a thin mount shim (template + onMounted Chart.js setup), not a
  reimplementation. All canvas / window access lives inside onMounted to
  stay SSR-safe under VitePress.
-->
<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import {
  constantMap,
  piecewiseConstantMap,
  linearRampMap,
  curvedMap,
} from "@warp-math/the-math/tempo-map.js";
import { pin } from "@warp-math/the-math/warp-marker.js";
import { Chart, registerables } from "chart.js";
import { chartColors, applyChartDefaults, onThemeChange } from "./chart-theme.mjs";

Chart.register(...registerables);

const BETA_MAX = 12;

const tempoCanvas = ref(null);
const warpCanvas = ref(null);

const ui = reactive({
  regime: "ramp",
  constantBpm: 120,
  piecewiseBpms: [120, 90, 150],
  piecewiseModel: null,
  rampStart: 80,
  rampEnd: 200,
  rampLength: 16,
  curvedStart: 80,
  curvedEnd: 200,
  curvedLength: 12,
  curvedK: 2,
  cursor: 6,
});

function initialPiecewiseModel(bpms) {
  // No {0,0} anchor: beat maps don't have a beat 0. The math layer
  // handles the (0,0) -> first-marker implicit segment automatically.
  const markers = [];
  let t = 0;
  for (let i = 0; i < bpms.length; i++) {
    t += (60 / bpms[i]) * 4;
    markers.push({ beat: (i + 1) * 4, second: t });
  }
  return markers;
}

function snapshot() {
  if (ui.regime === "constant") return { map: constantMap(ui.constantBpm), model: null };
  if (ui.regime === "ramp") return { map: linearRampMap(ui.rampStart, ui.rampEnd, ui.rampLength), model: null };
  if (ui.regime === "curved") return { map: curvedMap(ui.curvedStart, ui.curvedEnd, ui.curvedLength, ui.curvedK), model: null };
  const model = ui.piecewiseModel ?? initialPiecewiseModel(ui.piecewiseBpms);
  return { map: piecewiseConstantMap(model), model };
}

function sampleSecPerBeat(map, n = 200) {
  const xs = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const b = (i / n) * BETA_MAX;
    xs[i] = { x: b, y: 60 / map.bpmAt(b) };
  }
  return xs;
}
function sampleWarp(map, n = 200) {
  const xs = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const b = (i / n) * BETA_MAX;
    xs[i] = { x: b, y: map.beatsToSeconds(b) };
  }
  return xs;
}

const cursorLine = {
  id: "cursorLine",
  afterDatasetsDraw(chart) {
    const beta = chart.$cursor;
    if (beta == null) return;
    const x = chart.scales.x.getPixelForValue(beta);
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = chartColors().accent;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

let tempoChart = null;
let warpChart = null;
let cleanupTheme = null;

function render() {
  if (!tempoChart || !warpChart) return;
  const snap = snapshot();
  const tempoSamples = sampleSecPerBeat(snap.map);
  const warpSamples = sampleWarp(snap.map);
  tempoChart.data.datasets[0].data = tempoSamples.filter((p) => p.x <= ui.cursor);
  tempoChart.data.datasets[1].data = tempoSamples;
  tempoChart.$cursor = ui.cursor;
  tempoChart.update("none");
  warpChart.data.datasets[0].data = warpSamples;
  warpChart.data.datasets[1].data = snap.model ? snap.model.map((m) => ({ x: m.beat, y: m.second })) : [];
  warpChart.$cursor = ui.cursor;
  warpChart.update("none");
}

// Drag-to-pin in piecewise mode: pick the closest interior marker by canvas
// distance, then on each pointermove call pin() with the new (beat, second)
// and re-feed the result into the piecewiseConstantMap on the next render.
let dragIndex = null;
let originalModel = null;

function pickMarker(chart, evt, model) {
  const rect = chart.canvas.getBoundingClientRect();
  const mx = evt.clientX - rect.left;
  const my = evt.clientY - rect.top;
  let best = null;
  let bestDist = 14;
  // No {0,0} anchor to skip anymore; all markers except the last (timeline
  // right edge) are draggable. The last-marker exclusion is handled below.
  for (let i = 0; i < model.length - 1; i++) {
    const px = chart.scales.x.getPixelForValue(model[i].beat);
    const py = chart.scales.y.getPixelForValue(model[i].second);
    const d = Math.hypot(mx - px, my - py);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}
function pointerToSeconds(chart, evt) {
  const rect = chart.canvas.getBoundingClientRect();
  return chart.scales.y.getValueForPixel(evt.clientY - rect.top);
}

function onPointerDown(evt) {
  if (ui.regime !== "piecewise") return;
  const snap = snapshot();
  const idx = pickMarker(warpChart, evt, snap.model);
  if (idx == null) return;
  dragIndex = idx;
  originalModel = snap.model;
  warpCanvas.value?.setPointerCapture?.(evt.pointerId);
}
function onPointerMove(evt) {
  if (dragIndex == null) return;
  const newSec = pointerToSeconds(warpChart, evt);
  try {
    ui.piecewiseModel = pin(originalModel, originalModel[dragIndex].beat, newSec);
    render();
  } catch {
    // out-of-range drag: keep showing the original until release
  }
}
function onPointerUp(evt) {
  if (dragIndex == null) return;
  dragIndex = null;
  originalModel = null;
  if (warpCanvas.value?.hasPointerCapture?.(evt.pointerId)) {
    warpCanvas.value.releasePointerCapture(evt.pointerId);
  }
}

watch(
  () => [
    ui.regime, ui.constantBpm, ui.rampStart, ui.rampEnd, ui.rampLength,
    ui.curvedStart, ui.curvedEnd, ui.curvedLength, ui.curvedK,
    ui.cursor, ui.piecewiseBpms.join(","),
  ],
  () => {
    if (ui.regime === "piecewise") {
      ui.piecewiseModel = initialPiecewiseModel(ui.piecewiseBpms);
    } else {
      ui.piecewiseModel = null;
    }
    render();
  }
);

function buildCharts() {
  tempoChart?.destroy();
  warpChart?.destroy();
  applyChartDefaults(Chart);
  const C = chartColors();
  const baseOpts = (xMax, yLabel) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    scales: {
      x: { type: "linear", min: 0, max: xMax, title: { display: true, text: "beat β" }, grid: { color: C.grid } },
      y: { beginAtZero: true, title: { display: true, text: yLabel }, grid: { color: C.grid } },
    },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
  });
  tempoChart = new Chart(tempoCanvas.value, {
    type: "line",
    data: {
      datasets: [
        { label: "area", data: [], borderWidth: 0, backgroundColor: C.accentSoft, fill: "origin", pointRadius: 0 },
        { label: "60/BPM", data: [], borderColor: C.line, borderWidth: 1.5, fill: false, pointRadius: 0 },
      ],
    },
    options: baseOpts(BETA_MAX, "60 / BPM(b)  (s per beat)"),
    plugins: [cursorLine],
  });
  warpChart = new Chart(warpCanvas.value, {
    type: "line",
    data: {
      datasets: [
        { label: "t(β)", data: [], borderColor: C.line, borderWidth: 1.5, fill: false, pointRadius: 0 },
        { label: "markers", data: [], borderColor: C.accent, backgroundColor: C.accent, showLine: false, pointRadius: 7, pointBorderColor: C.markerOutline, pointBorderWidth: 2 },
      ],
    },
    options: baseOpts(BETA_MAX, "t  (seconds)"),
    plugins: [cursorLine],
  });
  render();
}

onMounted(async () => {
  // ClientOnly's slot mounts one tick later than the component itself, so
  // tempoCanvas / warpCanvas refs are null at the first onMounted. Wait one
  // tick for the slot to flush before constructing Chart.js.
  await nextTick();
  if (!tempoCanvas.value || !warpCanvas.value) return;
  buildCharts();
  warpCanvas.value.addEventListener("pointerdown", onPointerDown);
  warpCanvas.value.addEventListener("pointermove", onPointerMove);
  warpCanvas.value.addEventListener("pointerup", onPointerUp);
  cleanupTheme = onThemeChange(buildCharts);
});

onBeforeUnmount(() => {
  tempoChart?.destroy();
  warpChart?.destroy();
  cleanupTheme?.();
});
</script>

<template>
  <ClientOnly>
    <div class="wm-demo">
      <h4>02 · tempo curve + warp map</h4>
      <div class="controls">
        <label><input type="radio" v-model="ui.regime" value="constant" /> constant</label>
        <label><input type="radio" v-model="ui.regime" value="piecewise" /> piecewise</label>
        <label><input type="radio" v-model="ui.regime" value="ramp" /> linear ramp</label>
        <label><input type="radio" v-model="ui.regime" value="curved" /> curved</label>
      </div>

      <div class="controls" v-if="ui.regime === 'constant'">
        <label>BPM <input type="range" min="40" max="240" step="1" v-model.number="ui.constantBpm" />
          <span class="readout">{{ ui.constantBpm }}</span></label>
      </div>
      <div class="controls" v-if="ui.regime === 'piecewise'">
        <label v-for="(_, i) in ui.piecewiseBpms" :key="i">seg{{ i + 1 }}
          <input type="range" min="40" max="240" step="1" v-model.number="ui.piecewiseBpms[i]" />
          <span class="readout">{{ ui.piecewiseBpms[i] }}</span></label>
      </div>
      <div class="controls" v-if="ui.regime === 'ramp'">
        <label>start <input type="range" min="40" max="240" v-model.number="ui.rampStart" /><span class="readout">{{ ui.rampStart }}</span></label>
        <label>end <input type="range" min="40" max="240" v-model.number="ui.rampEnd" /><span class="readout">{{ ui.rampEnd }}</span></label>
        <label>L <input type="range" min="4" max="32" v-model.number="ui.rampLength" /><span class="readout">{{ ui.rampLength }}</span></label>
      </div>
      <div class="controls" v-if="ui.regime === 'curved'">
        <label>start <input type="range" min="40" max="240" v-model.number="ui.curvedStart" /><span class="readout">{{ ui.curvedStart }}</span></label>
        <label>end <input type="range" min="40" max="240" v-model.number="ui.curvedEnd" /><span class="readout">{{ ui.curvedEnd }}</span></label>
        <label>L <input type="range" min="4" max="32" v-model.number="ui.curvedLength" /><span class="readout">{{ ui.curvedLength }}</span></label>
        <label>k <input type="range" min="0.25" max="4" step="0.05" v-model.number="ui.curvedK" /><span class="readout">{{ ui.curvedK.toFixed(2) }}</span></label>
      </div>

      <div class="controls">
        <label>β <input type="range" min="0" max="12" step="0.05" v-model.number="ui.cursor" />
          <span class="readout">{{ ui.cursor.toFixed(2) }}</span></label>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="chart-wrap"><canvas ref="tempoCanvas"></canvas></div>
        <div class="chart-wrap"><canvas ref="warpCanvas"></canvas></div>
      </div>
      <p class="hint">
        Left: 60/BPM(b). Shaded area to the cursor IS beatsToSeconds(β) on
        the right. In piecewise mode, drag the orange dots to pin a beat to
        a different second; downstream beats shift, pinned beats stay.
      </p>
    </div>
  </ClientOnly>
</template>
