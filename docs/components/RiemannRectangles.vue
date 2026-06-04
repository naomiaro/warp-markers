<!--
  RiemannRectangles.vue

  A small static visual for the piecewise-constant regime's geometric idea:
  the integral of a step function is just a running SUM of rectangle areas.

  We draw the 60/BPM step function with the rectangles that make up the
  integral shaded in. Each rectangle's width is a beat length; its height is
  the seconds-per-beat on that step; its area is the seconds the beat lasts.
  Summing the rectangles is exactly beatsToSeconds().
-->
<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

const canvas = ref(null);
let chart = null;

// Three segments of different BPMs over six beats. Picked for visual
// distinctness, not realism: 120 / 90 / 150 BPM. The seconds-per-beat
// values become the heights of the three rectangles.
const SEGMENTS = [
  { beats: 2, bpm: 120 },
  { beats: 2, bpm: 90 },
  { beats: 2, bpm: 150 },
];

// Build a piecewise-constant series of (x, y) points where y is 60/bpm at
// each beat. Each segment is sampled twice at the same height to draw a
// flat top, then a vertical drop to the next segment.
function buildStepData() {
  const out = [];
  let b = 0;
  for (const seg of SEGMENTS) {
    const y = 60 / seg.bpm;
    out.push({ x: b, y });
    out.push({ x: b + seg.beats, y });
    b += seg.beats;
  }
  return out;
}

onMounted(async () => {
  await nextTick();
  if (!canvas.value) return;

  // A separate dataset per rectangle so each can be filled with a slightly
  // different shade -- making it visually obvious that the area is a SUM
  // of distinct rectangle areas.
  const SHADES = ["rgba(184,71,11,0.18)", "rgba(184,71,11,0.32)", "rgba(184,71,11,0.18)"];
  const rectDatasets = SEGMENTS.map((seg, i) => {
    let b = 0;
    for (let k = 0; k < i; k++) b += SEGMENTS[k].beats;
    const y = 60 / seg.bpm;
    return {
      label: `bar ${i + 1}`,
      data: [
        { x: b, y: 0 },
        { x: b, y },
        { x: b + seg.beats, y },
        { x: b + seg.beats, y: 0 },
      ],
      borderColor: "rgba(184,71,11,0.6)",
      borderWidth: 1,
      backgroundColor: SHADES[i],
      fill: true,
      pointRadius: 0,
      showLine: true,
      tension: 0,
    };
  });

  chart = new Chart(canvas.value, {
    type: "line",
    data: {
      datasets: [
        ...rectDatasets,
        {
          label: "60/BPM(b)",
          data: buildStepData(),
          borderColor: "#2a2a30",
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          showLine: true,
          tension: 0,
          stepped: "after",
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
          type: "linear", min: 0, max: 6, title: { display: true, text: "beat β" },
          ticks: { stepSize: 1 },
        },
        y: {
          beginAtZero: true, title: { display: true, text: "60 / BPM(b)  (s per beat)" },
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
        The shaded rectangles ARE the integral. Each one's width is a beat
        length and its height is the seconds-per-beat on that step, so its
        area equals "how many seconds those beats took." Summing the
        rectangles is <code>beatsToSeconds()</code> in three additions.
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
