<!--
  MessyDataDemo.vue

  In-docs version of chapter 05's anomaly inspector. Math is imported from
  @warp-math/messy-data (no copy). Chart.js renders the per-segment BPM
  line; flagged segments turn red. The textarea is the source of truth.
-->
<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed, nextTick } from "vue";
import {
  instantaneousBpms,
  flagAnomalies,
  monotonicityHoles,
} from "@warp-math/messy-data/robust.js";
import { Chart, registerables } from "chart.js";
import { chartColors, applyChartDefaults, onThemeChange } from "./chart-theme.mjs";

Chart.register(...registerables);

// Inline samples here -- the standalone chapter exposes them at /samples but
// docs would have to fetch them across origins on Pages; bundling them keeps
// the docs build self-contained.
function steady(bpm, n, jitter) {
  const out = [];
  const sec = 60 / bpm;
  for (let i = 0; i < n; i++) {
    out.push((i * sec + (Math.random() * 2 - 1) * jitter).toFixed(4));
  }
  return out.join("\n");
}
function jitteryWithAnomalies() {
  const sec = 0.5;
  const out = [];
  let t = 0;
  for (let i = 0; i < 24; i++) {
    if (i === 8) { t += sec; continue; }
    out.push((t + (Math.random() * 2 - 1) * 0.01).toFixed(4));
    t += sec;
    if (i === 14) out.push((t - sec / 2 + (Math.random() * 2 - 1) * 0.01).toFixed(4));
  }
  return out.join("\n");
}
function nonMonotonic() {
  const sec = 0.5;
  const out = [];
  for (let i = 0; i < 16; i++) {
    out.push(i === 6 ? "2.2000" : (i * sec).toFixed(4));
  }
  return out.join("\n");
}

const canvas = ref(null);
const ui = reactive({
  input: jitteryWithAnomalies(),
  lowBpm: 30,
  highBpm: 300,
  jumpRatio: 1.5,
});

function parse(text) {
  const markers = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const n = Number(line);
    if (Number.isFinite(n)) markers.push({ beat: markers.length + 1, second: n });
  }
  return markers;
}

const result = computed(() => {
  const markers = parse(ui.input);
  return {
    markers,
    bpms: instantaneousBpms(markers),
    flags: flagAnomalies(markers, { lowBpm: ui.lowBpm, highBpm: ui.highBpm, jumpRatio: ui.jumpRatio }),
    holes: monotonicityHoles(markers),
  };
});

let chart = null;
let cleanupTheme = null;

function update() {
  if (!chart) return;
  const { bpms, flags } = result.value;
  const C = chartColors();
  const flagged = new Set(flags.map((f) => f.index));
  const data = [];
  const colors = [];
  for (let i = 0; i < bpms.length; i++) {
    if (!Number.isFinite(bpms[i])) continue;
    data.push({ x: i, y: bpms[i] });
    colors.push(flagged.has(i) ? C.flag : C.ok);
  }
  chart.data.datasets[0].data = data;
  chart.data.datasets[0].pointBackgroundColor = colors;
  chart.update("none");
}
watch(result, update);

function buildChart() {
  chart?.destroy();
  applyChartDefaults(Chart);
  const C = chartColors();
  chart = new Chart(canvas.value, {
    type: "line",
    data: {
      datasets: [{
        label: "segment BPM",
        data: [],
        borderColor: C.line,
        borderWidth: 1.5,
        fill: false,
        pointRadius: 5,
        pointBackgroundColor: [],
        pointBorderColor: C.markerOutline,
        pointBorderWidth: 1,
        tension: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      scales: {
        x: { type: "linear", title: { display: true, text: "segment index" }, grid: { color: C.grid } },
        y: { title: { display: true, text: "BPM" }, grid: { color: C.grid } },
      },
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
    },
  });
  update();
}

onMounted(async () => {
  await nextTick();
  if (!canvas.value) return;
  buildChart();
  cleanupTheme = onThemeChange(buildChart);
});

onBeforeUnmount(() => {
  chart?.destroy();
  cleanupTheme?.();
});
</script>

<template>
  <ClientOnly>
    <div class="wm-demo">
      <h4>05 · BPM anomaly inspector</h4>
      <div class="controls">
        <button type="button" @click="ui.input = jitteryWithAnomalies()">jittery + dropped + doubled</button>
        <button type="button" @click="ui.input = steady(120, 24, 0.002)">clean steady</button>
        <button type="button" @click="ui.input = nonMonotonic()">non-monotonic (fatal)</button>
      </div>
      <div class="controls">
        <label>low BPM <input type="number" min="1" max="500" v-model.number="ui.lowBpm" style="width:5em" /></label>
        <label>high BPM <input type="number" min="1" max="500" v-model.number="ui.highBpm" style="width:5em" /></label>
        <label>jump <input type="number" min="1.01" max="10" step="0.05" v-model.number="ui.jumpRatio" style="width:5em" /></label>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 0.75rem; align-items: start;">
        <textarea v-model="ui.input" rows="10" style="width:100%;font-family:monospace;font-size:0.85rem"></textarea>
        <div class="chart-wrap"><canvas ref="canvas"></canvas></div>
      </div>
      <p v-if="result.holes.length > 0" class="hint" style="color:#c83737;font-style:normal;">
        non-monotonic marker(s) at index {{ result.holes.join(", ") }}: the warp map is not invertible at these points.
      </p>
      <table v-if="result.flags.length > 0">
        <thead><tr><th>segment</th><th>kind</th><th>detail</th></tr></thead>
        <tbody>
          <tr v-for="(f, i) in result.flags" :key="i" :class="{ flag: f.kind !== 'jump' }">
            <td>{{ f.index }}</td>
            <td>{{ f.kind }}</td>
            <td style="text-align:left">{{ f.detail }}</td>
          </tr>
        </tbody>
      </table>
      <p class="hint" v-else>(no anomalies under current thresholds — the detector is allowed to go quiet.)</p>
    </div>
  </ClientOnly>
</template>
