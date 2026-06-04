<!--
  TrapezoidSlices.vue

  Static visual for the curved regime's numerical method. A smooth 60/BPM
  curve is sliced into N trapezoids; each trapezoid's parallel sides are
  the curve's values at the slice boundaries, its width is h = beta/N.
  Summing the trapezoid areas approximates the integral; making N larger
  shrinks the error.
-->
<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { curvedMap } from "@warp-math/the-math/tempo-map.js";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

const canvas = ref(null);
let chart = null;

const N_SLICES = 8;        // few enough to see the approximation gap
const BETA_MAX = 10;
const map = curvedMap(80, 200, BETA_MAX, 2);

function smoothCurve() {
  const pts = [];
  for (let i = 0; i <= 200; i++) {
    const b = (i / 200) * BETA_MAX;
    pts.push({ x: b, y: 60 / map.bpmAt(b) });
  }
  return pts;
}

function trapezoidPolygons() {
  const out = [];
  const h = BETA_MAX / N_SLICES;
  for (let i = 0; i < N_SLICES; i++) {
    const xL = i * h;
    const xR = (i + 1) * h;
    out.push({
      label: `slice ${i}`,
      // Polygon path: (xL,0) (xL, f(xL)) (xR, f(xR)) (xR, 0)
      data: [
        { x: xL, y: 0 },
        { x: xL, y: 60 / map.bpmAt(xL) },
        { x: xR, y: 60 / map.bpmAt(xR) },
        { x: xR, y: 0 },
      ],
      borderColor: "rgba(184,71,11,0.55)",
      borderWidth: 1,
      backgroundColor: i % 2 ? "rgba(184,71,11,0.16)" : "rgba(184,71,11,0.28)",
      fill: true,
      pointRadius: 0,
      showLine: true,
      tension: 0,
    });
  }
  return out;
}

onMounted(async () => {
  await nextTick();
  if (!canvas.value) return;
  chart = new Chart(canvas.value, {
    type: "line",
    data: {
      datasets: [
        ...trapezoidPolygons(),
        {
          label: "60/BPM(b)",
          data: smoothCurve(),
          borderColor: "#2a2a30",
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          showLine: true,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      scales: {
        x: {
          type: "linear", min: 0, max: BETA_MAX, title: { display: true, text: "beat β" },
        },
        y: {
          beginAtZero: true, title: { display: true, text: "60 / BPM(b)" },
        },
      },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  });
});

onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <ClientOnly>
    <figure class="wm-figure">
      <div class="chart-wrap" style="height:260px"><canvas ref="canvas"></canvas></div>
      <figcaption>
        The curve has no closed-form integral, so we tile its area with
        thin trapezoids and sum them. Notice the tops of the trapezoids
        DO NOT quite match the curve — that gap is the approximation
        error, shrinking like <code>O(h²)</code> as the slices get
        thinner. With <code>n = 512</code> slices the gap is far below
        anything an ear could hear.
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
.chart-wrap { position: relative; width: 100%; }
.chart-wrap canvas { display: block; }
</style>
