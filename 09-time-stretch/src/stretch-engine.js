// ===========================================================================
// stretch-engine.js
//
// Plain Web Audio playback in THREE modes over the same source buffer,
// so the triptych is audible side by side:
//
//   raw        one source, rate 1.0 -- the wobble, untouched
//   varispeed  chapter 07's engine: one source, one playbackRate
//              automation point per beat (imported from chapter 07's
//              app code -- zero drift, per repo rule)
//   granular   THIS chapter: the grain schedule from ../granular.js,
//              one tiny BufferSource per grain at rate 1.0, Hann
//              envelope per grain via setValueCurveAtTime
//
// A metronome clicks the rigid project grid in all modes. In raw mode
// the beats drift off it; in both warped modes they lock -- but only
// varispeed changes the key.
// ===========================================================================
import { rateAt } from "@warp-math/ppqn-grid/src/warp-program.js";
import { grainSchedule, grainGainAt } from "../granular.js";

function makeClickBuffer(ctx, freq) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.04);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const env = Math.exp(-i / (sr * 0.01));
    data[i] = 0.3 * env * Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return buf;
}

// Hann curve sampled once; setValueCurveAtTime interpolates linearly
// between points, which at 64 points is inaudibly close to the true
// raised cosine.
const HANN_POINTS = 64;
function hannCurve(scale) {
  const curve = new Float32Array(HANN_POINTS);
  for (let i = 0; i < HANN_POINTS; i++) {
    curve[i] = scale * grainGainAt(i / (HANN_POINTS - 1));
  }
  return curve;
}

export function createStretchEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.connect(ctx.destination);

  let clickBuffer = null;
  let sources = []; // every scheduled node, for stopAll
  let startedAtCtxTime = 0;
  let startedFromSec = 0;
  let pausedAtSec = 0;
  let playing = false;

  function stopAll() {
    for (const s of sources) {
      try { s.stop(); } catch { /* already stopped */ }
      s.disconnect();
    }
    sources = [];
  }

  function scheduleClick(when) {
    if (!clickBuffer) clickBuffer = makeClickBuffer(ctx, 1500);
    const s = ctx.createBufferSource();
    s.buffer = clickBuffer;
    s.connect(master);
    s.start(when);
    sources.push(s);
  }

  function getCurrentSec() {
    if (!playing) return pausedAtSec;
    return startedFromSec + (ctx.currentTime - startedAtCtxTime);
  }

  // -------------------------------------------------------------------------
  // play(fromSec, opts)
  //   opts.buffer       the source AudioBuffer
  //   opts.mode         "raw" | "varispeed" | "granular"
  //   opts.plan         stretchPlan() result (warped modes + metronome)
  //   opts.program      buildWarpProgram() result (varispeed mode)
  //   opts.grainSec, opts.overlap   granular knobs
  //   opts.metronomeOn  click the rigid grid
  //   opts.durationSec  output end (project time; raw mode: file time)
  // -------------------------------------------------------------------------
  async function play(fromSec, opts) {
    if (ctx.state === "suspended") await ctx.resume();
    stopAll();
    startedFromSec = Math.max(0, fromSec);
    startedAtCtxTime = ctx.currentTime + 0.05;
    const t0 = startedAtCtxTime;
    const p0 = startedFromSec;
    const { buffer, mode, plan, program, grainSec, overlap, metronomeOn, durationSec } = opts;

    if (metronomeOn && plan) {
      const spb = 60 / plan.projectBpm;
      for (let n = 1; n * spb <= durationSec + 1e-9; n++) {
        const p = n * spb;
        if (p < p0) continue;
        scheduleClick(t0 + (p - p0));
      }
    }

    if (mode === "raw") {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.connect(master);
      s.start(t0, Math.min(p0, buffer.duration));
      sources.push(s);
    } else if (mode === "varispeed") {
      // Chapter 07 verbatim: one source, stepwise playbackRate automation.
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.connect(master);
      const fileOffset = program.fileSecForProjectSec(p0);
      s.playbackRate.setValueAtTime(rateAt(program, p0), t0);
      for (const pt of program.points) {
        if (pt.projectSec <= p0) continue;
        s.playbackRate.setValueAtTime(pt.rate, t0 + (pt.projectSec - p0));
      }
      s.start(t0, Math.min(fileOffset, buffer.duration));
      sources.push(s);
    } else {
      // Granular: one tiny source per grain, each at rate 1.0, Hann
      // envelope. COLA holds only at 50% overlap; at other overlaps the
      // window sum averages grainSec * 0.5 / hop, so each grain is scaled
      // by 2 * (1 - overlap) to keep unity level (= 1 at 50%).
      const grains = grainSchedule(plan, {
        grainSec,
        overlap,
        fromSec: p0,
        toSec: durationSec,
      });
      const curve = hannCurve(2 * (1 - overlap));
      for (const g of grains) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t0);
        const when = t0 + (g.outputSec - p0);
        gain.gain.setValueCurveAtTime(curve, when, g.durationSec);
        src.connect(gain);
        gain.connect(master);
        const offset = Math.max(0, Math.min(g.sourceSec, buffer.duration - 0.001));
        src.start(when, offset, g.durationSec);
        sources.push(src);
      }
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

  return {
    ctx,
    play,
    pause,
    seek,
    getCurrentSec,
    isPlaying: () => playing,
  };
}
