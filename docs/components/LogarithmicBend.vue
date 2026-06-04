<!--
  LogarithmicBend.vue

  The punchline of the linear-ramp regime, side by side: BPM(b) is a
  straight line, but t(β) bends into a logarithm. Same data on both axes,
  different visual relationship.
-->
<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { linearRampMap } from "@warp-math/the-math/tempo-map.js";
import { Chart, registerables } from "chart.js";
import { chartColors, applyChartDefaults, onThemeChange } from "./chart-theme.mjs";

Chart.register(...registerables);

const left = ref(null);
const right = ref(null);
let leftChart = null;
let rightChart = null;
let cleanupTheme = null;

const LENGTH = 16;
const map = linearRampMap(80, 200, LENGTH);

function sampleBpm() {
  const out = [];
  for (let i = 0; i <= 200; i++) {
    const b = (i / 200) * LENGTH;
    out.push({ x: b, y: map.bpmAt(b) });
  }
  return out;
}
function sampleWarp() {
  const out = [];
  for (let i = 0; i <= 200; i++) {
    const b = (i / 200) * LENGTH;
    out.push({ x: b, y: map.beatsToSeconds(b) });
  }
  return out;
}

const baseOpts = (xMax, yLabel, C) => ({
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

function build() {
  leftChart?.destroy();
  rightChart?.destroy();
  applyChartDefaults(Chart);
  const C = chartColors();
  leftChart = new Chart(left.value, {
    type: "line",
    data: {
      datasets: [{
        label: "BPM(β)", data: sampleBpm(),
        borderColor: C.line, borderWidth: 2, fill: false,
        pointRadius: 0, tension: 0,
      }],
    },
    options: baseOpts(LENGTH, "BPM", C),
  });
  rightChart = new Chart(right.value, {
    type: "line",
    data: {
      datasets: [{
        label: "t(β)", data: sampleWarp(),
        borderColor: C.accent, borderWidth: 2, fill: false,
        pointRadius: 0, tension: 0,
      }],
    },
    options: baseOpts(LENGTH, "t (seconds)", C),
  });
}

onMounted(async () => {
  await nextTick();
  if (!left.value || !right.value) return;
  build();
  cleanupTheme = onThemeChange(build);
});

onBeforeUnmount(() => {
  leftChart?.destroy();
  rightChart?.destroy();
  cleanupTheme?.();
});
</script>

<template>
  <ClientOnly>
    <figure class="wm-figure">
      <div class="grid">
        <div class="chart-wrap" style="height:240px"><canvas ref="left"></canvas></div>
        <div class="chart-wrap" style="height:240px"><canvas ref="right"></canvas></div>
      </div>
      <figcaption>
        Left: tempo rises in a perfectly straight line.
        Right: the time map bends — that bend IS the logarithm.
        Early beats (slow tempo) take more seconds per beat, so they
        contribute more area; later beats contribute less; integrating
        the descending <code>60/BPM</code> curve produces the curve on
        the right. Straight in, curved out.
      </figcaption>
    </figure>
  </ClientOnly>
</template>

<style scoped>
.wm-figure { margin: 1rem 0; }
.wm-figure figcaption {
  margin-top: 0.5rem; font-size: 0.85rem; color: var(--vp-c-text-2);
  font-style: italic;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.chart-wrap { position: relative; width: 100%; }
.chart-wrap canvas { display: block; }
@media (max-width: 600px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
