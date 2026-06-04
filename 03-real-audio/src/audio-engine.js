// ===========================================================================
// audio-engine.js
//
// A tiny Web Audio wrapper that supports two playback sources:
//
//   1. A real decoded audio buffer (the user dropped in an audio file).
//   2. A synthetic click track played at the beats from the .beats file.
//      Useful when the user wants to verify the grid logic without having
//      to find an audio file with the right tempo.
//
// In both cases the engine exposes a single source of truth -- the audio
// clock derived from AudioContext.currentTime -- so the playhead UI doesn't
// need to know which mode it's in.
//
// We deliberately do NOT compute tempo or beats here; that is the job of
// 01-the-math via grid.js. This file only knows about samples and time.
// ===========================================================================

const SHORT_CLICK_SECONDS = 0.04;

// Render a quick percussive click into an AudioBuffer. Used by the synthetic
// mode to make beats audible without any user-provided audio.
function makeClickBuffer(ctx, durationSec) {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * durationSec));
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // Short decaying sine pulse around 1.2 kHz. Loud enough to hear,
    // quiet enough not to alarm anyone.
    const env = Math.exp(-i / (sr * 0.01));
    data[i] = 0.35 * env * Math.sin((2 * Math.PI * 1200 * i) / sr);
  }
  return buf;
}

export function createEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(ctx.destination);

  // Decoded audio buffer for "real audio" mode. Null until the user loads a file.
  let audioBuffer = null;
  // Cached click buffer reused at every beat in synth mode.
  let clickBuffer = null;
  // The currently-playing BufferSourceNode (only in real-audio mode).
  let source = null;
  // Scheduled synth click sources -- so we can stop them on pause.
  let scheduledClicks = [];
  // When playback started, in audio-clock seconds.
  let startedAtCtxTime = 0;
  // The offset within the audio buffer we started from (so pause/resume work).
  let startedFromAudioSec = 0;
  // Whether we're playing right now.
  let playing = false;
  // Last-known offset when paused.
  let pausedAtAudioSec = 0;
  // Which mode we are in: "real" | "synth"
  let mode = "synth";

  async function loadAudioFromArrayBuffer(arrayBuffer) {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    mode = "real";
    pausedAtAudioSec = 0;
  }

  function useSynthMode() {
    mode = "synth";
  }

  function getDurationSec(grid) {
    if (mode === "real" && audioBuffer) return audioBuffer.duration;
    // Synth mode: the timeline runs until the last beat plus a small tail.
    if (!grid) return 0;
    const lastModelSec = grid.model[grid.model.length - 1].second;
    return lastModelSec + grid.audioOffsetSec + 1;
  }

  function getCurrentAudioSec() {
    if (!playing) return pausedAtAudioSec;
    return startedFromAudioSec + (ctx.currentTime - startedAtCtxTime);
  }

  function stopAll() {
    if (source) {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
      source = null;
    }
    for (const s of scheduledClicks) {
      try { s.stop(); } catch { /* already stopped */ }
      s.disconnect();
    }
    scheduledClicks = [];
  }

  async function play(fromAudioSec, grid) {
    if (ctx.state === "suspended") await ctx.resume();
    stopAll();

    startedFromAudioSec = Math.max(0, fromAudioSec);
    startedAtCtxTime = ctx.currentTime;

    if (mode === "real" && audioBuffer) {
      source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(masterGain);
      source.start(startedAtCtxTime, startedFromAudioSec);
    } else if (grid) {
      // Synth mode: schedule a click at every beat at or after the start.
      if (!clickBuffer) clickBuffer = makeClickBuffer(ctx, SHORT_CLICK_SECONDS);
      for (const m of grid.model) {
        const audioSec = m.second + grid.audioOffsetSec;
        if (audioSec < startedFromAudioSec) continue;
        const when =
          startedAtCtxTime + (audioSec - startedFromAudioSec);
        const s = ctx.createBufferSource();
        s.buffer = clickBuffer;
        s.connect(masterGain);
        s.start(when);
        scheduledClicks.push(s);
      }
    }
    playing = true;
  }

  function pause() {
    if (!playing) return;
    pausedAtAudioSec = getCurrentAudioSec();
    playing = false;
    stopAll();
  }

  function seek(audioSec) {
    pausedAtAudioSec = Math.max(0, audioSec);
    if (playing) {
      // Re-start from the new position with whatever grid was last in use.
      // Caller is expected to re-supply the grid via play() if needed.
      playing = false;
      stopAll();
    }
  }

  function isPlaying() { return playing; }
  function getMode() { return mode; }

  return {
    loadAudioFromArrayBuffer,
    useSynthMode,
    play,
    pause,
    seek,
    getCurrentAudioSec,
    getDurationSec,
    isPlaying,
    getMode,
  };
}
