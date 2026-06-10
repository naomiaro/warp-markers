// ===========================================================================
// main.js
//
// Entry point for the chapter-08 demo: the grid follows the file.
//
// The UI is the production stack end to end: <daw-editor> from
// @dawcore/components draws the bar ruler, grid, waveform, and playhead;
// @dawcore/transport schedules clips and the metronome. This chapter's
// library supplies exactly ONE thing -- gridPlanFromBeats(), the bridge
// from a beat_this .beats file to the transport's tempo map -- and the
// proof table shows the production TempoMap reproducing every beat
// timestamp to numerical noise.
//
// The audio (the waveform you see) is scheduled once and never touched:
// the "conform" toggle only swaps the transport's tempo map between
//
//   rigid    one setTempo(projectBpm) at tick 0 -- the bar lines march
//            evenly, the waveform's beats drift across them
//   conform  gridPlanFromBeats() events -- the bar lines bend to meet
//            the waveform; every beat sits on a grid line
//
// The sound of the FILE is bit-identical in both modes. That is the
// chapter's point, and with the editor you can also SEE it: toggling
// conform redraws the grid, never the waveform.
// ===========================================================================
import "@dawcore/components";
import { NativePlayoutAdapter } from "@dawcore/transport";
import { parseBeats } from "@warp-math/beats-io";
import { gridPlanFromBeats, gridSecondForBeat } from "../conform.js";

const $ = (id) => document.getElementById(id);
const PPQN = 960;

const editor = $("editor");
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const adapter = new NativePlayoutAdapter(audioCtx);
editor.adapter = adapter;

// Bootstrap the engine before any track exists so adapter.transport is
// available for tempo/metronome work (the production example's pattern).
//
// IMPORTANT: this must NOT be a top-level await. ready() dynamically
// imports @waveform-playlist/engine; under Vite's production chunking the
// engine chunk statically imports shared helpers back from THIS entry
// chunk, and ESM evaluation deadlocks if this module is still suspended
// at a top-level await -- silently: no error, pending promise, dead UI.
// (Dev mode has no such chunk cycle, which is why it only broke in
// builds.) Bootstrapping inside an async function lets the entry module
// finish evaluating first, dissolving the cycle.
let transport = null;

async function init() {
  await editor.ready();
  transport = adapter.transport;
  transport.setMetronomeEnabled(true);
}

const initPromise = init();
initPromise.catch((err) => {
  $("beats-status").textContent = `engine failed to start: ${err.message}`;
});

const state = {
  plan: null, // gridPlanFromBeats() result
  audioLoaded: false,
  conformOn: true,
  projectBpm: 120,
};

// ---------------------------------------------------------------------------
// Tempo map application. Conform ON feeds the plan's events; OFF is one
// rigid tempo. Either way the EDITOR's ruler is driven by the transport's
// own TempoMap via the secondsToTicks/ticksToSeconds bridge -- the bars
// you see are the production map's opinion, not a re-derivation.
// ---------------------------------------------------------------------------
function applyTempoMap() {
  if (!transport) return; // engine still bootstrapping
  transport.stop();
  // Set the display BPM BEFORE installing the tempo events. The editor.bpm
  // setter forwards to engine.setTempo, which writes the adapter's tempo
  // map at tick 0 -- assigning it AFTER the events would overwrite the
  // tick-0 entry with the median and shift every beat off the grid by a
  // constant offset (upstream measured 97 ms on a real file).
  if (state.conformOn && state.plan) {
    const bpms = state.plan.events.map((e) => e.bpm).sort((a, b) => a - b);
    editor.bpm = Math.round(bpms[Math.floor(bpms.length / 2)]);
  } else {
    editor.bpm = state.projectBpm;
  }
  transport.clearTempos();
  transport.clearMeters();
  if (state.conformOn && state.plan) {
    for (const e of state.plan.events) transport.setTempo(e.bpm, e.tick);
    // Meter from the FILE's declared downbeats -- including irregular
    // bars (a lone 5/4 in a 4/4 song), so every downbeat stays on a bar
    // line. Index-based 4/4 would drift at the first irregularity.
    for (const m of state.plan.meterEntries) {
      transport.setMeter(m.numerator, m.denominator, m.tick);
    }
    editor.meterEntries = state.plan.meterEntries;
  } else {
    transport.setMeter(4, 4);
    transport.setTempo(state.projectBpm, 0);
    editor.meterEntries = [];
  }
  editor.secondsToTicks = (s) => transport.timeToTick(s);
  editor.ticksToSeconds = (t) => transport.tickToTime(t);
  repositionClip();
  renderEventsTable();
}

// ---------------------------------------------------------------------------
// Clip placement. The plan says where the clip's sample 0 belongs:
//   clipStartSec >= 0  schedule it there -- the file's own lead-in audio
//                      plays through the grid's lead-in bars (pickups)
//   clipStartSec < 0   trim that much off the clip so beat 1 plays at
//                      transport second 0 (no pickup)
// Positions are stored in samples (and ticks, authoritative when present)
// on the engine's clip model.
// ---------------------------------------------------------------------------
function repositionClip() {
  if (!state.audioLoaded || !state.plan || !editor.engine) return;
  const sr = editor.effectiveSampleRate ?? audioCtx.sampleRate;
  const { clipStartSec } = state.plan;
  const startSec = Math.max(0, clipStartSec);
  const trimSamples = Math.max(0, Math.round(-clipStartSec * sr));
  const startTick = Number(transport.timeToTick(startSec));
  const tracks = editor.engine.getState().tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c) => ({
      ...c,
      startTick,
      startSample: Math.round(startSec * sr),
      offsetSamples: trimSamples,
      durationSamples: c.sourceDurationSamples - trimSamples,
    })),
  }));
  editor.engine.setTracks(tracks);
}

// ---------------------------------------------------------------------------
// Beats loading.
// ---------------------------------------------------------------------------
async function loadBeatsFromText(text, sourceLabel) {
  try {
    await initPromise;
    // Drop near-duplicate detections before planning: a near-zero gap
    // means an absurd per-segment BPM, which the transport's TempoMap
    // (rightly) rejects since its input validation landed. 50 ms is a
    // 1200 BPM ceiling -- same policy as the upstream example. Chapter 05
    // is the principled treatment; this is the demo being forgiving.
    const MIN_BEAT_INTERVAL = 0.05;
    const parsed = parseBeats(text).filter(
      (b, i, arr) => i === 0 || b.second - arr[i - 1].second >= MIN_BEAT_INTERVAL
    );
    const plan = gridPlanFromBeats(parsed, PPQN);
    state.plan = plan;
    applyTempoMap();
    $("beats-status").textContent =
      `${sourceLabel}: ${plan.markers.length} beats · ` +
      `pickup ${plan.pickupBeats} · first downbeat at bar ` +
      `${plan.firstDownbeatTick / plan.ticksPerBar + 1} (tick ${plan.firstDownbeatTick}) · ` +
      `${plan.meterEntries.length} meter entr${plan.meterEntries.length === 1 ? "y" : "ies"} · ` +
      `clip at ${plan.clipStartSec.toFixed(3)} s`;
  } catch (err) {
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

$("use-pickup-beats").addEventListener("click", async () => {
  const res = await fetch(`${import.meta.env.BASE_URL}samples/pickup.beats`);
  await loadBeatsFromText(await res.text(), "pickup.beats");
});

$("use-otherside-beats").addEventListener("click", async () => {
  const res = await fetch(`${import.meta.env.BASE_URL}samples/otherside.beats`);
  await loadBeatsFromText(await res.text(), "otherside.beats");
});

$("use-repaired-beats").addEventListener("click", async () => {
  const res = await fetch(`${import.meta.env.BASE_URL}samples/otherside-repaired.beats`);
  await loadBeatsFromText(await res.text(), "otherside-repaired.beats");
});

$("use-scartissue-beats").addEventListener("click", async () => {
  const res = await fetch(`${import.meta.env.BASE_URL}samples/scar_tissue.beats`);
  await loadBeatsFromText(await res.text(), "scar_tissue.beats");
});

// ---------------------------------------------------------------------------
// Audio loading -- through the editor, so the waveform renders.
// ---------------------------------------------------------------------------
$("audio-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  $("audio-status").textContent = `decoding ${file.name}…`;
  try {
    await initPromise;
    const result = await editor.loadFiles([file]);
    if (!result.loaded.length) throw new Error(result.failed?.[0]?.error ?? "load failed");
    state.audioLoaded = true;
    $("audio-status").textContent = `${file.name} loaded`;
    repositionClip();
  } catch (err) {
    $("audio-status").textContent = `decode failed: ${err.message}`;
  }
});

// ---------------------------------------------------------------------------
// Controls.
// ---------------------------------------------------------------------------
$("conform-toggle").addEventListener("change", (e) => {
  state.conformOn = e.target.checked;
  applyTempoMap();
});

$("project-bpm").addEventListener("input", (e) => {
  state.projectBpm = +e.target.value;
  $("ro-project-bpm").textContent = String(state.projectBpm);
  if (!state.conformOn) applyTempoMap();
});

// NOTE: no custom playhead wiring. daw-editor already animates the
// playhead through the secondsToTicks bridge with latency compensation;
// re-driving it from raw transport time (the old upstream pattern) undid
// that compensation. Removed upstream in waveform-playlist#406.

// ---------------------------------------------------------------------------
// Readouts: bar.beat position and the tempo in force, from the transport.
// ---------------------------------------------------------------------------
function tick() {
  if (transport && transport.isPlaying()) {
    const time = transport.getCurrentTime();
    const tickNow = transport.timeToTick(time);
    const bar = transport.tickToBar(tickNow);
    const tickIntoBar = tickNow - transport.barToTick(bar);
    const beatInBar = Math.floor(tickIntoBar / PPQN) + 1;
    $("ro-position").textContent =
      `bar ${bar} · beat ${beatInBar} · ${time.toFixed(2)} s`;
    $("ro-bpm").textContent = transport.getTempo(tickNow).toFixed(1);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------------------
// Events table: the plan verbatim, with the residual proof columns --
// transport.tickToTime(tick) - (clipStartSec + beatTime) through the
// production TempoMap, and the same through this chapter's pure reference
// clock. RULE (grid conformity), checked live.
// ---------------------------------------------------------------------------
function renderEventsTable() {
  const tbody = $("events-table").querySelector("tbody");
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  if (!state.plan) return;
  const { markers, events, firstBeatTick, firstBeatSec, clipStartSec } = state.plan;
  const addCell = (tr, text) => {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
  };
  // One row per SEGMENT event (skip the synthetic lead-in event at tick 0
  // when present -- it has no beat-tracker timestamp to check against).
  const segmentEvents = events.filter((_, i) => !(firstBeatTick > 0 && i === 0));
  const N = Math.min(segmentEvents.length, 60);
  for (let i = 0; i < N; i++) {
    const e = segmentEvents[i];
    const marker = markers[i];
    const target = clipStartSec + marker.second;
    const viaTransport = state.conformOn ? transport.tickToTime(e.tick) : null;
    const viaReference =
      firstBeatSec + gridSecondForBeat(markers, marker.beat);
    const tr = document.createElement("tr");
    addCell(tr, String(e.tick));
    addCell(tr, String(marker.beat));
    addCell(tr, e.bpm.toFixed(2));
    addCell(tr, marker.second.toFixed(4));
    addCell(
      tr,
      viaTransport == null ? "—" : (viaTransport - target).toExponential(2)
    );
    addCell(tr, (viaReference - target).toExponential(2));
    tbody.appendChild(tr);
  }
  if (segmentEvents.length > N) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = `… (${segmentEvents.length - N} more rows hidden)`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

// Expose for ad-hoc inspection. transport is a getter because it is
// assigned asynchronously by init().
if (typeof window !== "undefined") {
  window.__gridFollows = {
    state,
    editor,
    get transport() {
      return transport;
    },
  };
}
