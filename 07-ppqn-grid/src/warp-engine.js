// ===========================================================================
// warp-engine.js
//
// Web Audio playback for the warp demo, adapted from chapter 03's engine.
// Plain Web Audio only (repo rule) -- and the warp itself needs nothing
// exotic: ONE BufferSourceNode whose playbackRate gets one
// setValueAtTime() per program point. The browser's audio thread then
// holds each segment's rate exactly, so file beats land on grid beats to
// sample accuracy.
//
// Three sound layers, individually toggleable by the caller:
//
//   metronome -- high click at every PROJECT beat (the rigid grid)
//   file      -- the uploaded audio, played warped (program) or raw
//   synth     -- if no audio is loaded, a lower click at every FILE beat
//                stands in for it (warped or raw the same way)
//
// The clock is project time: getCurrentProjectSec() derives from
// AudioContext.currentTime exactly as chapter 03 does with audio time.
// ===========================================================================
import { rateAt } from "./warp-program.js";

const CLICK = { metronome: 1500, file: 700 }; // Hz -- far apart on purpose

function makeClickBuffer(ctx, freq) {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * 0.04));
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const env = Math.exp(-i / (sr * 0.01));
    data[i] = 0.35 * env * Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return buf;
}

export function createWarpEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  let audioBuffer = null; // decoded upload, or null for synth mode
  let clickBufs = null; // { metronome, file }, lazily rendered
  let source = null; // the warped/raw BufferSourceNode
  let scheduledClicks = [];
  let startedAtCtxTime = 0;
  let startedFromProjectSec = 0;
  let pausedAtProjectSec = 0;
  let playing = false;

  async function loadAudioFromArrayBuffer(arrayBuffer) {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    pausedAtProjectSec = 0;
  }

  function clearAudio() {
    audioBuffer = null;
    pausedAtProjectSec = 0;
  }

  function hasAudio() {
    return audioBuffer !== null;
  }

  function getCurrentProjectSec() {
    if (!playing) return pausedAtProjectSec;
    return startedFromProjectSec + (ctx.currentTime - startedAtCtxTime);
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

  function scheduleClick(kind, when) {
    if (!clickBufs) {
      clickBufs = {
        metronome: makeClickBuffer(ctx, CLICK.metronome),
        file: makeClickBuffer(ctx, CLICK.file),
      };
    }
    const s = ctx.createBufferSource();
    s.buffer = clickBufs[kind];
    s.connect(masterGain);
    s.start(when);
    scheduledClicks.push(s);
  }

  // -------------------------------------------------------------------------
  // play(fromProjectSec, opts)
  //   opts.program      -- buildWarpProgram() result (required)
  //   opts.fileMarkers  -- the file's markers (for raw/synth click times)
  //   opts.warpOn       -- true: file follows the program; false: plays raw
  //   opts.metronomeOn  -- true: click the project grid
  //   opts.durationSec  -- project-time end (for click scheduling bounds)
  // -------------------------------------------------------------------------
  async function play(fromProjectSec, opts) {
    if (ctx.state === "suspended") await ctx.resume();
    stopAll();

    const { program, fileMarkers, warpOn, metronomeOn, durationSec } = opts;
    startedFromProjectSec = Math.max(0, fromProjectSec);
    startedAtCtxTime = ctx.currentTime + 0.03; // small scheduling headroom
    const t0 = startedAtCtxTime;
    const p0 = startedFromProjectSec;

    // --- metronome: the rigid grid. One click per project beat. ---
    if (metronomeOn) {
      for (let n = 1; n * program.spb <= durationSec + 1e-9; n++) {
        const p = n * program.spb;
        if (p < p0) continue;
        scheduleClick("metronome", t0 + (p - p0));
      }
    }

    // --- the file: real audio if loaded, otherwise stand-in clicks. ---
    if (audioBuffer) {
      source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(masterGain);
      if (warpOn) {
        // Start the source wherever the composed maps say project time p0
        // lives in the file, at the rate in force there; then one
        // setValueAtTime per future program point.
        const fileOffset = program.fileSecForProjectSec(p0);
        source.playbackRate.setValueAtTime(rateAt(program, p0), t0);
        for (const pt of program.points) {
          if (pt.projectSec <= p0) continue;
          source.playbackRate.setValueAtTime(
            pt.rate,
            t0 + (pt.projectSec - p0)
          );
        }
        source.start(t0, Math.min(fileOffset, audioBuffer.duration));
      } else {
        // Raw: project time IS file time, rate 1. The drift against the
        // metronome is the point of the A/B.
        source.start(t0, Math.min(p0, audioBuffer.duration));
      }
    } else if (fileMarkers) {
      // Synth stand-in: a lower click at every FILE beat -- at its warped
      // (grid) position when warping, at its original second when raw.
      for (let i = 0; i < fileMarkers.length; i++) {
        const p = warpOn
          ? program.aligned[i].projectSecond
          : fileMarkers[i].second;
        if (p < p0) continue;
        scheduleClick("file", t0 + (p - p0));
      }
    }

    playing = true;
  }

  function pause() {
    if (!playing) return;
    pausedAtProjectSec = getCurrentProjectSec();
    playing = false;
    stopAll();
  }

  function seek(projectSec) {
    pausedAtProjectSec = Math.max(0, projectSec);
    if (playing) {
      playing = false;
      stopAll();
    }
  }

  function isPlaying() {
    return playing;
  }

  function getAudioDurationSec() {
    return audioBuffer ? audioBuffer.duration : null;
  }

  return {
    loadAudioFromArrayBuffer,
    clearAudio,
    hasAudio,
    play,
    pause,
    seek,
    isPlaying,
    getCurrentProjectSec,
    getAudioDurationSec,
  };
}
