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

Chart.register(...registerables);

const left = ref(null);
const right = ref(null);
let leftChart = null;
let rightChart = null;

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

const baseOpts = (xMax, yLabel) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  parsing: false,
  scales: {
    x: { type: "linear", min: 0, max: xMax, title: { display: true, text: "beat β" } },
    y: { beginAtZero: true, title: { display: true, text: yLabel } },
  },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
});

onMounted(async () => {
  await nextTick();
  if (!left.value || !right.value) return;
  leftChart = new Chart(left.value, {
    type: "line",
    data: {
      datasets: [{
        label: "BPM(β)", data: sampleBpm(),
        borderColor: "#2a2a30", borderWidth: 2, fill: false,
        pointRadius: 0, tension: 0,
      }],
    },
    options: baseOpts(LENGTH, "BPM"),
  });
  rightChart = new Chart(right.value, {
    type: "line",
    data: {
      datasets: [{
        label: "t(β)", data: sampleWarp(),
        borderColor: "#b8470b", borderWidth: 2, fill: false,
        pointRadius: 0, tension: 0,
      }],
    },
    options: baseOpts(LENGTH, "t (seconds)"),
  });
});

onBeforeUnmount(() => {
  leftChart?.destroy();
  rightChart?.destroy();
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
