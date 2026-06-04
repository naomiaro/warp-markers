// ===========================================================================
// charts.js
//
// Two Chart.js line charts plus two small inline plugins:
//   - `cursorLine`  : draws a vertical dashed line at the current beta value
//                     on both charts, so the eye can match a beat between them.
//   - `shadedArea`  : fills the area on the tempo chart between x=0 and x=beta
//                     under the 60/BPM curve. That area IS the warp-map y at
//                     the same beta on the right chart.
// ===========================================================================
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

const COLOR = {
  curve: "#2a2a30",
  area: "rgba(184, 71, 11, 0.18)",
  cursor: "#b8470b",
  marker: "#b8470b",
  markerOutline: "#faf7f2",
};

// ---------------------------------------------------------------------------
// shadedArea: paint under the tempo curve from 0 to cursorBeta.
// We rely on the dataset's `fill` configuration AT BUILD TIME, plus a separate
// hidden dataset that holds *only* the samples from 0 to cursorBeta, with
// fill: 'origin'. Updating the data is enough -- Chart.js handles the rest.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// cursorLine: a chart plugin that draws a vertical line at x = chart.$cursor
// on every paint. Cheap, and avoids pulling in chartjs-plugin-annotation.
// ---------------------------------------------------------------------------
const cursorLine = {
  id: "cursorLine",
  afterDatasetsDraw(chart) {
    const beta = chart.$cursor;
    if (beta == null) return;
    const x = chart.scales.x.getPixelForValue(beta);
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = COLOR.cursor;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

const baseScales = (xMax, yLabel) => ({
  x: {
    type: "linear",
    min: 0,
    max: xMax,
    title: { display: true, text: "beat β" },
    grid: { color: "#e9e4d9" },
  },
  y: {
    beginAtZero: true,
    title: { display: true, text: yLabel },
    grid: { color: "#e9e4d9" },
  },
});

const baseOptions = (xMax, yLabel) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  parsing: false, // we hand it {x,y} objects directly
  scales: baseScales(xMax, yLabel),
  plugins: {
    legend: { display: false },
    tooltip: { enabled: false },
  },
});

export function makeTempoChart(canvas, xMax) {
  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          // The shaded "area to the left of the cursor". Drawn first so it
          // sits under the curve outline. fill: 'origin' makes it a true area.
          label: "area",
          data: [],
          borderWidth: 0,
          backgroundColor: COLOR.area,
          fill: "origin",
          pointRadius: 0,
        },
        {
          // The full 60/BPM curve.
          label: "60/BPM",
          data: [],
          borderColor: COLOR.curve,
          borderWidth: 1.5,
          fill: false,
          pointRadius: 0,
        },
      ],
    },
    options: baseOptions(xMax, "60 / BPM(b)  (seconds per beat)"),
    plugins: [cursorLine],
  });
}

export function makeWarpChart(canvas, xMax) {
  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: "t(beta)",
          data: [],
          borderColor: COLOR.curve,
          borderWidth: 1.5,
          fill: false,
          pointRadius: 0,
        },
        {
          // Draggable markers, drawn only in the piecewise regime.
          label: "markers",
          data: [],
          borderColor: COLOR.marker,
          backgroundColor: COLOR.marker,
          showLine: false,
          pointRadius: 7,
          pointHoverRadius: 9,
          pointBorderColor: COLOR.markerOutline,
          pointBorderWidth: 2,
        },
      ],
    },
    options: baseOptions(xMax, "t  (seconds)"),
    plugins: [cursorLine],
  });
}

// ---------------------------------------------------------------------------
// updateCharts: push fresh data and the cursor position into both charts.
// Called whenever any UI control or drag changes the model.
// ---------------------------------------------------------------------------
export function updateCharts({
  tempoChart,
  warpChart,
  tempoSamples,
  warpSamples,
  cursorBeta,
  markers,
}) {
  // tempo chart: dataset 0 is the area to the left of the cursor, dataset 1
  // is the full 60/BPM curve.
  tempoChart.data.datasets[0].data = tempoSamples.filter(
    (p) => p.x <= cursorBeta
  );
  tempoChart.data.datasets[1].data = tempoSamples;
  tempoChart.$cursor = cursorBeta;
  tempoChart.update("none");

  // warp chart: dataset 0 is the curve, dataset 1 is the marker scatter.
  warpChart.data.datasets[0].data = warpSamples;
  warpChart.data.datasets[1].data = markers
    ? markers.map((m) => ({ x: m.beat, y: m.second }))
    : [];
  warpChart.$cursor = cursorBeta;
  warpChart.update("none");
}
