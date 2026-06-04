// ===========================================================================
// main.js -- the messy-data inspector page.
//
// The textarea is the source of truth: parse it on every input, build a
// marker list, run the detectors, and re-render the chart and table.
// Everything else (samples, thresholds) just changes one of those inputs.
// ===========================================================================
import { Chart, registerables } from "chart.js";
import {
  instantaneousBpms,
  flagAnomalies,
  monotonicityHoles,
} from "../robust.js";
import {
  jitteryWithAnomalies,
  cleanSteady,
  nonMonotonic,
} from "./samples.js";

Chart.register(...registerables);

const COLOR = {
  ok: "#4a7c4a",
  flag: "#c83737",
  line: "#2a2a30",
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Parse one timestamp per line, ignore blanks and comment lines starting
// with '#'. Lines that don't look numeric are reported in the summary so
// the user can find typos quickly.
// ---------------------------------------------------------------------------
function parseInput(text) {
  const seconds = [];
  const skipped = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const n = Number(line);
    if (!Number.isFinite(n)) {
      skipped.push({ line: i + 1, text: line });
      return;
    }
    seconds.push(n);
  });
  // markers: one per timestamp, beat = its index. This is the simplest
  // mapping from "list of times" to the chapter-01 marker shape; downstream
  // analysis cares about the gaps, not the absolute beat numbering.
  const markers = seconds.map((s, i) => ({ beat: i, second: s }));
  return { markers, skipped };
}

// ---------------------------------------------------------------------------
// Chart setup. A single line dataset of per-segment BPM, with point colours
// per-point so flagged segments stand out without an extra dataset.
// ---------------------------------------------------------------------------
const chart = new Chart($("bpm-chart"), {
  type: "line",
  data: {
    datasets: [
      {
        label: "segment BPM",
        data: [],
        borderColor: COLOR.line,
        borderWidth: 1.5,
        fill: false,
        pointRadius: 5,
        pointBackgroundColor: [],
        pointBorderColor: "#fff",
        pointBorderWidth: 1,
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
        type: "linear",
        title: { display: true, text: "segment index" },
        grid: { color: "#e9e4d9" },
      },
      y: {
        title: { display: true, text: "BPM" },
        grid: { color: "#e9e4d9" },
      },
    },
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
  },
});

// ---------------------------------------------------------------------------
// Render: parse → detect → push to chart and table.
// ---------------------------------------------------------------------------
function render() {
  const text = $("input").value;
  const { markers, skipped } = parseInput(text);
  const opts = {
    lowBpm: +$("th-low").value,
    highBpm: +$("th-high").value,
    jumpRatio: +$("th-jump").value,
  };

  // Summary line above the chart.
  let summary = `${markers.length} timestamps · ${Math.max(0, markers.length - 1)} segments`;
  if (skipped.length > 0) {
    summary += ` · skipped ${skipped.length} non-numeric line${skipped.length === 1 ? "" : "s"}`;
  }
  $("summary").textContent = summary;

  // monotonicity holes are the fatal kind -- surface them above the table
  // (and disable the table rendering if every segment is poisoned).
  const holes = monotonicityHoles(markers);
  const monoEl = $("monotonicity");
  if (holes.length > 0) {
    monoEl.hidden = false;
    monoEl.textContent =
      `non-monotonic marker(s) at index ${holes.join(", ")}: ` +
      "the warp map is not invertible at these points. " +
      "secondsToBeats has no single answer here -- chapter 01's pin() guards against this " +
      "before it ever reaches the math, but unedited data can land in this state from a tracker bug.";
  } else {
    monoEl.hidden = true;
    monoEl.textContent = "";
  }

  // BPM series + per-point colour.
  const bpms = instantaneousBpms(markers);
  const flags = flagAnomalies(markers, opts);
  const flaggedIndices = new Set(flags.map((f) => f.index));
  const data = [];
  const colors = [];
  for (let i = 0; i < bpms.length; i++) {
    if (!Number.isFinite(bpms[i])) {
      // Skip NaN points so the line doesn't jump to "0". The chart's x-axis
      // is segment index; visually missing points correspond exactly to
      // monotonicity holes the banner already calls out.
      continue;
    }
    data.push({ x: i, y: bpms[i] });
    colors.push(flaggedIndices.has(i) ? COLOR.flag : COLOR.ok);
  }
  chart.data.datasets[0].data = data;
  chart.data.datasets[0].pointBackgroundColor = colors;
  chart.update("none");

  // Anomaly table.
  const tbody = $("flag-table").querySelector("tbody");
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  if (flags.length === 0) {
    const tr = document.createElement("tr");
    tr.classList.add("empty");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = "(no anomalies under current thresholds)";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    for (const f of flags) {
      const tr = document.createElement("tr");
      const addCell = (text, cls) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (cls) td.className = cls;
        tr.appendChild(td);
      };
      addCell(String(f.index));
      addCell(f.kind, `kind-${f.kind}`);
      addCell(f.detail);
      tbody.appendChild(tr);
    }
  }
}

// ---------------------------------------------------------------------------
// Wire up controls.
// ---------------------------------------------------------------------------
$("input").addEventListener("input", render);
for (const id of ["th-low", "th-high", "th-jump"]) {
  $(id).addEventListener("input", render);
}
$("load-jittery").addEventListener("click", () => {
  $("input").value = jitteryWithAnomalies();
  render();
});
$("load-clean").addEventListener("click", () => {
  $("input").value = cleanSteady();
  render();
});
$("load-broken").addEventListener("click", () => {
  $("input").value = nonMonotonic();
  render();
});

// First load: jittery sample so the inspector has something to do on arrival.
$("input").value = jitteryWithAnomalies();
render();
