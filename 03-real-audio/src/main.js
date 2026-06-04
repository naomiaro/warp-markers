// ===========================================================================
// main.js
//
// Entry point. Wires the file inputs to the parser/grid builder, the
// transport buttons to the audio engine, and a requestAnimationFrame loop to
// the timeline drawer. Everything that knows about tempo or warp markers
// flows through 01-the-math via grid.js.
// ===========================================================================
import { parseBeats } from "./beats-parser.js";
import { buildGrid, audioSecToBeat, beatToAudioSec } from "./grid.js";
import { createEngine } from "./audio-engine.js";
import { drawTimeline } from "./timeline.js";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// App state. Single source of truth, mutated only through setState().
// ---------------------------------------------------------------------------
const state = {
  grid: null, // result of buildGrid(parsedBeats)
  engine: createEngine(),
};

// ---------------------------------------------------------------------------
// Beats loading.
// ---------------------------------------------------------------------------
async function loadBeatsFromText(text, sourceLabel) {
  try {
    const parsed = parseBeats(text);
    state.grid = buildGrid(parsed);
    $("beats-status").textContent =
      `${sourceLabel}: ${parsed.length} beats · pickup ${state.grid.pickupBeats} · ` +
      `audio offset ${state.grid.audioOffsetSec.toFixed(3)} s · ` +
      `${state.grid.barBoundaries.length} bars`;
    renderDebugTable();
  } catch (err) {
    state.grid = null;
    $("beats-status").textContent = `error: ${err.message}`;
  }
}

$("beats-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  await loadBeatsFromText(text, file.name);
});

$("use-sample-beats").addEventListener("click", async () => {
  // The sample file is bundled at /samples/example.beats. Vite serves it
  // out of the project root via its public-folder-ish behaviour; here we
  // just fetch it.
  // `import.meta.env.BASE_URL` resolves to whatever `base` is configured in
  // vite.config.js -- `/` in dev, `./` after a relative-base production build.
  // This keeps the fetch path correct whether served at the dev-server root or
  // mounted at /warp-markers/03-real-audio/ inside the docs Pages artifact.
  const res = await fetch(`${import.meta.env.BASE_URL}samples/example.beats`);
  const text = await res.text();
  await loadBeatsFromText(text, "example.beats");
});

// ---------------------------------------------------------------------------
// Audio loading.
// ---------------------------------------------------------------------------
$("audio-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  $("audio-status").textContent = `decoding ${file.name}…`;
  try {
    const buf = await file.arrayBuffer();
    await state.engine.loadAudioFromArrayBuffer(buf);
    $("audio-status").textContent = `${file.name} loaded · real-audio mode`;
  } catch (err) {
    $("audio-status").textContent = `decode failed: ${err.message}`;
  }
});

// ---------------------------------------------------------------------------
// Transport.
// ---------------------------------------------------------------------------
$("play-pause").addEventListener("click", async () => {
  if (!state.grid) {
    $("beats-status").textContent = "load a .beats file first";
    return;
  }
  if (state.engine.isPlaying()) {
    state.engine.pause();
    $("play-pause").textContent = "play";
  } else {
    await state.engine.play(state.engine.getCurrentAudioSec(), state.grid);
    $("play-pause").textContent = "pause";
  }
});

$("rewind").addEventListener("click", () => {
  state.engine.pause();
  state.engine.seek(0);
  $("play-pause").textContent = "play";
});

// Click on the timeline canvas to seek.
$("timeline").addEventListener("click", (e) => {
  if (!state.grid) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const frac = (e.clientX - rect.left) / rect.width;
  const dur = state.engine.getDurationSec(state.grid);
  const target = Math.max(0, Math.min(dur, frac * dur));
  const wasPlaying = state.engine.isPlaying();
  state.engine.pause();
  state.engine.seek(target);
  if (wasPlaying) {
    state.engine.play(target, state.grid);
    $("play-pause").textContent = "pause";
  }
});

// ---------------------------------------------------------------------------
// Render loop.
// ---------------------------------------------------------------------------
function tick() {
  const canvas = $("timeline");
  const currentAudioSec = state.engine.getCurrentAudioSec();
  const dur = state.engine.getDurationSec(state.grid);

  drawTimeline(canvas, {
    grid: state.grid,
    durationSec: dur || 1,
    currentAudioSec,
  });

  // Auto-pause when we run off the end.
  if (state.engine.isPlaying() && currentAudioSec >= dur) {
    state.engine.pause();
    $("play-pause").textContent = "play";
  }

  // Readouts.
  $("ro-audiosec").textContent = currentAudioSec.toFixed(3);
  if (state.grid) {
    const beta = audioSecToBeat(currentAudioSec, state.grid);
    $("ro-beta").textContent = beta.toFixed(3);
    // bpmAt operates in MODEL beat coordinates which are the same as ours.
    const bpm = state.grid.map.bpmAt(Math.max(0, beta));
    $("ro-bpm").textContent = bpm.toFixed(1);
  } else {
    $("ro-beta").textContent = "—";
    $("ro-bpm").textContent = "—";
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

// ---------------------------------------------------------------------------
// Debug table: round-trip each parsed beat through the map. The whole point
// is that the residual column should be zero, demonstrating that the model
// reproduces the data it was built from.
// ---------------------------------------------------------------------------
function renderDebugTable() {
  const tbody = $("debug-table").querySelector("tbody");
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  if (!state.grid) return;
  // Limit to 60 rows so a 10-minute file doesn't render a 2000-row table.
  const N = Math.min(state.grid.model.length, 60);
  const addCell = (tr, text) => {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
  };
  for (let i = 0; i < N; i++) {
    const parsedT = state.grid.model[i].second + state.grid.audioOffsetSec;
    const beta = audioSecToBeat(parsedT, state.grid);
    const tPrime = beatToAudioSec(beta, state.grid);
    const tr = document.createElement("tr");
    addCell(tr, String(i));
    addCell(tr, parsedT.toFixed(4));
    addCell(tr, beta.toFixed(4));
    addCell(tr, tPrime.toFixed(4));
    addCell(tr, (tPrime - parsedT).toExponential(2));
    tbody.appendChild(tr);
  }
  if (state.grid.model.length > N) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = `… (${state.grid.model.length - N} more rows hidden)`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

// Expose for ad-hoc inspection.
if (typeof window !== "undefined") {
  window.__warpAudio = { state };
}
