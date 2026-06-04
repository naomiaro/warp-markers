// ===========================================================================
// metronome.js
//
// Web Audio click track with the two-tone accent / normal scheme. The whole
// meter layer reaches the speakers through ONE call per beat:
//
//     clickForBeat(meterMap, i) === "accent" ? accentBuf : normalBuf
//
// That one classification is the meter layer at work. Everything else here
// is just Web Audio scheduling.
// ===========================================================================
import { clickForBeat } from "../meter.js";

// Two-tone scheme. Accent: brighter and louder (1200 Hz, 0.05 s, 0.8 vol).
// Normal: duller and quieter (800 Hz, 0.04 s, 0.5 vol). Picked to match
// the reference grid in the brief.
function makeClickBuffer(ctx, freq, durationSec, amplitude) {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * durationSec));
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const env = Math.exp(-i / (sr * 0.01));
    data[i] = amplitude * env * Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return buf;
}

export function createMetronome() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(ctx.destination);

  const accent = makeClickBuffer(ctx, 1200, 0.05, 0.8);
  const normal = makeClickBuffer(ctx, 800, 0.04, 0.5);

  let scheduled = [];
  let startedAtCtxTime = 0;
  let startedFromSec = 0;
  let playing = false;
  let pausedAtSec = 0;

  function stopAll() {
    for (const s of scheduled) {
      try { s.stop(); } catch { /* already stopped */ }
      s.disconnect();
    }
    scheduled = [];
  }

  function getCurrentSec() {
    if (!playing) return pausedAtSec;
    return startedFromSec + (ctx.currentTime - startedAtCtxTime);
  }

  // The actual scheduling. For every beat in the sequence we ask the meter
  // layer which click to play and queue it at the beat's audio time.
  async function play({ meterMap, beatSeconds, fromSec }) {
    if (ctx.state === "suspended") await ctx.resume();
    stopAll();
    startedFromSec = Math.max(0, fromSec);
    startedAtCtxTime = ctx.currentTime;
    for (let i = 0; i < beatSeconds.length; i++) {
      const sec = beatSeconds[i];
      if (sec < startedFromSec) continue;
      const which = clickForBeat(meterMap, i);
      const buf = which === "accent" ? accent : normal;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(out);
      s.start(startedAtCtxTime + (sec - startedFromSec));
      scheduled.push(s);
    }
    playing = true;
  }

  function pause() {
    if (!playing) return;
    pausedAtSec = getCurrentSec();
    playing = false;
    stopAll();
  }

  function seek(sec) {
    pausedAtSec = Math.max(0, sec);
    if (playing) {
      playing = false;
      stopAll();
    }
  }

  function isPlaying() { return playing; }

  return { play, pause, seek, getCurrentSec, isPlaying };
}
