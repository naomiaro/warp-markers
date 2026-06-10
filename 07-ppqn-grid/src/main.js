// ===========================================================================
// main.js
//
// Entry point. Wires the file inputs to the parser, the project-BPM control
// and warp/metronome toggles to the engine, and a requestAnimationFrame loop
// to the two-lane timeline. All math flows through ../ppqn.js and 01-the-math
// via warp-program.js.
// ===========================================================================
import { parseBeats } from "@warp-math/beats-io";
import { buildWarpProgram, rateAt } from "./warp-program.js";
import { createWarpEngine } from "./warp-engine.js";
import { drawTimeline } from "./timeline.js";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// App state. fileMarkers and program are replaced wholesale (immutably) when
// inputs change; the engine holds the only audio resources.
// ---------------------------------------------------------------------------
const state = {
  fileMarkers: null, // [{ beat (1-indexed), second }, ...]
  program: null, // buildWarpProgram(fileMarkers, projectBpm)
  projectBpm: 120,
  warpOn: true,
  metronomeOn: true,
  engine: createWarpEngine(),
};

function rebuildProgram() {
  if (!state.fileMarkers) return;
  state.program = buildWarpProgram(state.fileMarkers, state.projectBpm);
  renderSegmentsTable();
}

// Project-time end of the demo: the warped (or raw) end of whichever is
// longer, the beat grid or the loaded audio, plus a one-second tail.
function durationSec() {
  if (!state.program) return 1;
  const lastBeatEnd =
    state.program.aligned[state.program.aligned.length - 1].projectSecond;
  const audioDur = state.engine.getAudioDurationSec();
  let end = lastBeatEnd;
  if (audioDur != null) {
    const audioEnd = state.warpOn
      ? state.program.projectSecForFileSec(audioDur)
      : audioDur;
    end = Math.max(end, audioEnd);
  }
  return end + 1;
}

// ---------------------------------------------------------------------------
// Beats loading. Beat numbers are 1-indexed (array index + 1) -- the repo's
// number-system convention.
// ---------------------------------------------------------------------------
async function loadBeatsFromText(text, sourceLabel) {
  try {
    const parsed = parseBeats(text);
    state.fileMarkers = parsed.map((b, i) => ({ beat: i + 1, second: b.second }));
    rebuildProgram();
    $("beats-status").textContent =
      `${sourceLabel}: ${parsed.length} beats · ` +
      `first at ${state.fileMarkers[0].second.toFixed(3)} s`;
  } catch (err) {
    state.fileMarkers = null;
    state.program = null;
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

// ---------------------------------------------------------------------------
// Audio loading.
// ---------------------------------------------------------------------------
$("audio-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  $("audio-status").textContent = `decoding ${file.name}…`;
  try {
    await state.engine.loadAudioFromArrayBuffer(await file.arrayBuffer());
    $("audio-status").textContent = `${file.name} loaded`;
  } catch (err) {
    $("audio-status").textContent = `decode failed: ${err.message}`;
  }
});

// ---------------------------------------------------------------------------
// Controls. Changing anything mid-flight restarts playback from the same
// project second so the A/B comparison is seamless.
// ---------------------------------------------------------------------------
async function restartIfPlaying() {
  if (!state.engine.isPlaying()) return;
  const p = state.engine.getCurrentProjectSec();
  state.engine.pause();
  await playFrom(p);
}

$("project-bpm").addEventListener("input", async (e) => {
  state.projectBpm = +e.target.value;
  $("ro-project-bpm").textContent = String(state.projectBpm);
  rebuildProgram();
  await restartIfPlaying();
});

$("warp-toggle").addEventListener("change", async (e) => {
  state.warpOn = e.target.checked;
  await restartIfPlaying();
});

$("metronome-toggle").addEventListener("change", async (e) => {
  state.metronomeOn = e.target.checked;
  await restartIfPlaying();
});

// ---------------------------------------------------------------------------
// Transport.
// ---------------------------------------------------------------------------
async function playFrom(projectSec) {
  await state.engine.play(projectSec, {
    program: state.program,
    fileMarkers: state.fileMarkers,
    warpOn: state.warpOn,
    metronomeOn: state.metronomeOn,
    durationSec: durationSec(),
  });
  $("play-pause").textContent = "pause";
}

$("play-pause").addEventListener("click", async () => {
  if (!state.program) {
    $("beats-status").textContent = "load a .beats file first";
    return;
  }
  if (state.engine.isPlaying()) {
    state.engine.pause();
    $("play-pause").textContent = "play";
  } else {
    await playFrom(state.engine.getCurrentProjectSec());
  }
});

$("rewind").addEventListener("click", () => {
  state.engine.pause();
  state.engine.seek(0);
  $("play-pause").textContent = "play";
});

// Click the timeline to seek (in project time -- the bottom lane's scale).
$("timeline").addEventListener("click", async (e) => {
  if (!state.program) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const frac = (e.clientX - rect.left) / rect.width;
  const dur = durationSec();
  const target = Math.max(0, Math.min(dur, frac * dur));
  const wasPlaying = state.engine.isPlaying();
  state.engine.pause();
  state.engine.seek(target);
  if (wasPlaying) await playFrom(target);
});

// ---------------------------------------------------------------------------
// Render loop.
// ---------------------------------------------------------------------------
function tick() {
  const p = state.engine.getCurrentProjectSec();
  const dur = durationSec();

  drawTimeline($("timeline"), state.program && {
    fileMarkers: state.fileMarkers,
    fileDurationSec:
      Math.max(
        state.fileMarkers[state.fileMarkers.length - 1].second,
        state.engine.getAudioDurationSec() ?? 0
      ) + 1,
    projectDurationSec: dur,
    program: state.program,
    warpOn: state.warpOn,
    currentProjectSec: p,
  });

  if (state.engine.isPlaying() && p >= dur) {
    state.engine.pause();
    $("play-pause").textContent = "play";
  }

  $("ro-projectsec").textContent = p.toFixed(3);
  if (state.program) {
    const fileSec = state.warpOn ? state.program.fileSecForProjectSec(p) : p;
    $("ro-filesec").textContent = fileSec.toFixed(3);
    $("ro-rate").textContent = state.warpOn
      ? rateAt(state.program, p).toFixed(3)
      : "1.000 (raw)";
  } else {
    $("ro-filesec").textContent = "—";
    $("ro-rate").textContent = "—";
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------------------
// Segments table: segmentRates() verbatim, one row per warp segment.
// ---------------------------------------------------------------------------
function renderSegmentsTable() {
  const tbody = $("segments-table").querySelector("tbody");
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  if (!state.program) return;
  const addCell = (tr, text) => {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
  };
  const N = Math.min(state.program.rates.length, 60);
  for (let i = 0; i < N; i++) {
    const r = state.program.rates[i];
    const a = state.fileMarkers[i];
    const b = state.fileMarkers[i + 1];
    const fileGap = b.second - a.second;
    const tr = document.createElement("tr");
    addCell(tr, `${r.fromBeat} → ${r.toBeat}`);
    addCell(tr, `${fileGap.toFixed(3)} s`);
    addCell(tr, (60 / fileGap * (b.beat - a.beat)).toFixed(1));
    addCell(tr, `${state.program.spb.toFixed(3)} s`);
    addCell(tr, r.rate.toFixed(3));
    tbody.appendChild(tr);
  }
  if (state.program.rates.length > N) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = `… (${state.program.rates.length - N} more rows hidden)`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

// Expose for ad-hoc inspection.
if (typeof window !== "undefined") {
  window.__warpGrid = { state };
}
