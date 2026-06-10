// ===========================================================================
// main.js
//
// Entry point for the chapter-09 demo: the triptych, audible.
//
//   raw        the wobbly source, untouched -- drifts off the metronome
//   varispeed  chapter 07's engine -- beats lock, key changes
//   granular   THIS chapter -- beats lock, key does not
//
// The default source is a synthetic arpeggio (C4 E4 G4 C5, one tone per
// file beat) precisely so the pitch difference between the two warped
// modes is unmissable without uploading anything. Drop in real audio +
// its .beats map for the full effect.
// ===========================================================================
import { parseBeats } from "@warp-math/beats-io";
import { buildWarpProgram } from "@warp-math/ppqn-grid/src/warp-program.js";
import { stretchPlan, grainSchedule, sourcePositionAt } from "../granular.js";
import { createStretchEngine } from "./stretch-engine.js";
import { renderToneSource } from "./tone-source.js";
import { drawTimeline } from "./timeline.js";

const $ = (id) => document.getElementById(id);
const PROJECT_BPM = 120;

const engine = createStretchEngine();

const state = {
  fileMarkers: null,
  plan: null, // stretchPlan()
  program: null, // buildWarpProgram() -- the varispeed twin
  buffer: null, // source audio (synth tone or upload)
  bufferLabel: "synthetic arpeggio",
  mode: "granular",
  grainSec: 0.08,
  overlap: 0.5,
  metronomeOn: true,
};

function rebuild() {
  if (!state.fileMarkers) return;
  state.plan = stretchPlan(state.fileMarkers, PROJECT_BPM);
  state.program = buildWarpProgram(state.fileMarkers, PROJECT_BPM);
  if (!state.uploadedBuffer) {
    state.buffer = renderToneSource(engine.ctx, state.fileMarkers);
    state.bufferLabel = "synthetic arpeggio";
  }
  engine.pause();
  engine.seek(0);
  $("play-pause").textContent = "play";
  renderGrainTable();
}

function durationSec() {
  if (!state.plan) return 1;
  const lastAnchor = state.plan.anchors[state.plan.anchors.length - 1];
  if (state.mode === "raw") {
    return (state.buffer?.duration ?? lastAnchor.fileSecond) + 0.5;
  }
  return lastAnchor.projectSecond + 1;
}

// ---------------------------------------------------------------------------
// Loading.
// ---------------------------------------------------------------------------
async function loadBeatsFromText(text, sourceLabel) {
  try {
    const parsed = parseBeats(text);
    state.fileMarkers = parsed.map((b, i) => ({ beat: i + 1, second: b.second }));
    rebuild();
    $("beats-status").textContent =
      `${sourceLabel}: ${state.fileMarkers.length} beats · ` +
      `${state.plan.rates.length} segments · source: ${state.bufferLabel}`;
  } catch (err) {
    state.fileMarkers = null;
    state.plan = null;
    $("beats-status").textContent = `error: ${err.message}`;
  }
}

$("beats-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await loadBeatsFromText(await file.text(), file.name);
});

$("use-sample-beats").addEventListener("click", async () => {
  const res = await fetch(`${import.meta.env.BASE_URL}samples/wobbly.beats`);
  await loadBeatsFromText(await res.text(), "wobbly.beats");
});

$("audio-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  $("audio-status").textContent = `decoding ${file.name}…`;
  try {
    state.uploadedBuffer = await engine.ctx.decodeAudioData(await file.arrayBuffer());
    state.buffer = state.uploadedBuffer;
    state.bufferLabel = file.name;
    $("audio-status").textContent = `${file.name} loaded`;
    engine.pause();
    engine.seek(0);
    $("play-pause").textContent = "play";
  } catch (err) {
    $("audio-status").textContent = `decode failed: ${err.message}`;
  }
});

// ---------------------------------------------------------------------------
// Controls. Changing anything restarts from the same output second so the
// A/B/C comparison is seamless.
// ---------------------------------------------------------------------------
async function restartIfPlaying() {
  if (!engine.isPlaying()) return;
  const p = engine.getCurrentSec();
  engine.pause();
  await playFrom(p);
}

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", async (e) => {
    state.mode = e.target.value;
    renderGrainTable();
    await restartIfPlaying();
  });
}

$("grain-sec").addEventListener("input", async (e) => {
  state.grainSec = +e.target.value / 1000;
  $("ro-grain").textContent = `${e.target.value} ms`;
  renderGrainTable();
  await restartIfPlaying();
});

$("overlap").addEventListener("input", async (e) => {
  state.overlap = +e.target.value / 100;
  $("ro-overlap").textContent = `${e.target.value}%`;
  renderGrainTable();
  await restartIfPlaying();
});

$("metronome-toggle").addEventListener("change", async (e) => {
  state.metronomeOn = e.target.checked;
  await restartIfPlaying();
});

// ---------------------------------------------------------------------------
// Transport.
// ---------------------------------------------------------------------------
async function playFrom(sec) {
  await engine.play(sec, {
    buffer: state.buffer,
    mode: state.mode,
    plan: state.plan,
    program: state.program,
    grainSec: state.grainSec,
    overlap: state.overlap,
    metronomeOn: state.metronomeOn,
    durationSec: durationSec(),
  });
  $("play-pause").textContent = "pause";
}

$("play-pause").addEventListener("click", async () => {
  if (!state.plan) {
    $("beats-status").textContent = "load a .beats file first";
    return;
  }
  if (engine.isPlaying()) {
    engine.pause();
    $("play-pause").textContent = "play";
  } else {
    await playFrom(engine.getCurrentSec());
  }
});

$("rewind").addEventListener("click", () => {
  engine.pause();
  engine.seek(0);
  $("play-pause").textContent = "play";
});

// ---------------------------------------------------------------------------
// Render loop.
// ---------------------------------------------------------------------------
function grainsForView() {
  if (!state.plan || state.mode !== "granular") return null;
  const grains = grainSchedule(state.plan, {
    grainSec: state.grainSec,
    overlap: state.overlap,
    toSec: durationSec(),
  });
  // annotate each grain with the local rate for the tint
  return grains.map((g) => {
    const eps = 1e-6;
    const slope =
      (sourcePositionAt(state.plan, g.outputSec + eps) -
        sourcePositionAt(state.plan, g.outputSec)) / eps;
    return { ...g, rate: slope };
  });
}

let cachedGrains = null;
let cacheKey = "";
function tick() {
  const p = engine.isPlaying() ? engine.getCurrentSec() : null;
  if (state.plan) {
    const key = `${state.mode}|${state.grainSec}|${state.overlap}|${state.fileMarkers.length}`;
    if (key !== cacheKey) {
      cacheKey = key;
      cachedGrains = grainsForView();
    }
    drawTimeline($("timeline"), {
      plan: state.plan,
      grains: cachedGrains,
      durationSec: durationSec(),
      fileDurationSec:
        state.plan.anchors[state.plan.anchors.length - 1].fileSecond + 1,
      currentSec: p,
      mode: state.mode,
    });
    if (p != null) {
      $("ro-outsec").textContent = p.toFixed(3);
      $("ro-srcsec").textContent =
        state.mode === "raw"
          ? p.toFixed(3)
          : sourcePositionAt(state.plan, p).toFixed(3);
    }
  } else {
    drawTimeline($("timeline"), null);
  }
  if (engine.isPlaying() && p >= durationSec()) {
    engine.pause();
    engine.seek(0);
    $("play-pause").textContent = "play";
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------------------
// Grain table: the first rows of the schedule, the grain-advance rule
// visible as the source-delta column.
// ---------------------------------------------------------------------------
function renderGrainTable() {
  const tbody = $("grain-table").querySelector("tbody");
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  if (!state.plan || state.mode !== "granular") return;
  const grains = grainSchedule(state.plan, {
    grainSec: state.grainSec,
    overlap: state.overlap,
    fromSec: 0.5,
    toSec: durationSec(),
  }).slice(0, 14);
  const addCell = (tr, text) => {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
  };
  const hop = state.grainSec * (1 - state.overlap);
  for (let i = 0; i < grains.length; i++) {
    const g = grains[i];
    const tr = document.createElement("tr");
    addCell(tr, g.outputSec.toFixed(3));
    addCell(tr, g.sourceSec.toFixed(4));
    addCell(tr, i === 0 ? "—" : (g.sourceSec - grains[i - 1].sourceSec).toFixed(4));
    addCell(tr, i === 0 ? "—" : ((g.sourceSec - grains[i - 1].sourceSec) / hop).toFixed(3));
    tbody.appendChild(tr);
  }
}

// Expose for ad-hoc inspection.
if (typeof window !== "undefined") {
  window.__stretch = { state, engine };
}
