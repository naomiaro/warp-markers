// ===========================================================================
// tempo-map.js
//
// The one idea in this file: a "warp map" is a function that converts
// MUSICAL time (beats) into AUDIO time (seconds), and back. Everything a
// beat grid does -- snapping, playback, stretching -- is built on this map.
//
// Why calculus shows up at all
// ----------------------------
// Tempo is a RATE. "120 BPM" means beats are arriving at 120 per minute,
// i.e. 2 per second. If we call musical position beta (in beats) and audio
// position t (in seconds), tempo is literally the derivative of beta with
// respect to t:
//
//       d(beta)/dt = BPM / 60          (beats per second)
//
// We almost always want the other direction: "given a beat, what second is
// it?" So we flip the fraction (this is just 1 / rate) and integrate. The
// Fundamental Theorem of Calculus says integrating a rate recovers the total:
//
//       t(beta) = integral from 0 to beta of  60 / BPM(b)  db
//
// In words: "seconds per beat, added up across all the beats so far."
// That integral is the whole game. The three functions below are just that
// same integral evaluated for three different shapes of BPM(b).
//
// All functions take a `model`, an array of warp markers sorted by beat:
//   [{ beat: 0, second: 0 }, { beat: 4, second: 2 }, ...]
// A marker PINS a musical beat to an audio second. Tempo is never stored;
// it is DERIVED from the gap between two markers (see segmentBpm below).
// ===========================================================================


// ---------------------------------------------------------------------------
// Helper: the tempo implied by the segment between two adjacent markers.
//
// Between marker A and marker B, (B.beat - A.beat) beats are spread across
// (B.second - A.second) seconds. Beats-per-second is the ratio; multiply by
// 60 for BPM. No calculus yet -- this is just rise-over-run on the warp map,
// which is exactly the SLOPE of the t(beta) line on that segment.
// ---------------------------------------------------------------------------
export function segmentBpm(a, b) {
  const dBeat = b.beat - a.beat;
  const dSec = b.second - a.second;
  if (dSec <= 0 || dBeat <= 0) throw new Error("markers must increase in both beat and second");
  return 60 * (dBeat / dSec); // beats/sec * 60 = BPM
}


// ===========================================================================
// REGIME 1: CONSTANT TEMPO
//
// BPM(b) = K, a constant. The integral of a constant is the easy one every
// calculus course starts with:
//
//   RULE (constant rule):  integral of c db  =  c * b
//
// So:
//   t(beta) = integral 0..beta of (60/K) db  =  (60/K) * beta
//
// The warp map is a straight line through the origin with slope 60/K seconds
// per beat. Nothing curves. We expose it as a model with a single tempo.
// ===========================================================================
export function constantMap(bpm) {
  const secPerBeat = 60 / bpm;
  return {
    beatsToSeconds: (beta) => secPerBeat * beta,
    // Inverting a line is just dividing by the slope:
    secondsToBeats: (t) => t / secPerBeat,
    bpmAt: () => bpm,
  };
}


// ===========================================================================
// REGIME 2: PIECEWISE-CONSTANT TEMPO  (this is what beat_this gives you)
//
// beat_this hands you a timestamp for every beat. Treat each beat as a marker.
// Between consecutive markers the tempo is held constant, so BPM(b) is a STEP
// function -- flat on each beat, jumping at each marker.
//
// The integral of a step function is just the running SUM of rectangle areas.
// Each rectangle is (width in beats) * (height = seconds-per-beat on that
// step). This is a Riemann sum that happens to be exact, because the function
// really is constant on each piece:
//
//   t(beta) = sum over completed segments of  (segLenBeats * 60 / segBpm)
//             + leftover partial segment
//
// Geometrically the warp map is piecewise-LINEAR: straight inside each
// segment, with a kink at every marker where the slope (tempo) changes.
// ===========================================================================
export function piecewiseConstantMap(markers) {
  const m = [...markers].sort((p, q) => p.beat - q.beat);
  if (m[0].beat !== 0 || m[0].second !== 0) {
    // Anchor the map at the origin so beat 0 = second 0. Real beat_this output
    // rarely starts exactly at 0, which is why your example computes a pickup
    // offset; here we keep it simple and assume a leading {beat:0, second:0}.
    throw new Error("model must start at {beat:0, second:0}");
  }

  function beatsToSeconds(beta) {
    if (beta <= 0) return 0;
    let acc = 0;
    for (let i = 0; i < m.length - 1; i++) {
      const a = m[i], b = m[i + 1];
      if (beta >= b.beat) {
        // whole segment is behind us: add the full rectangle (= its width in
        // seconds, which the markers give us directly)
        acc += b.second - a.second;
      } else {
        // beta lands inside this segment: add the partial rectangle.
        // fraction of the segment covered, times the segment's duration.
        const frac = (beta - a.beat) / (b.beat - a.beat);
        return acc + frac * (b.second - a.second);
      }
    }
    // beta past the last marker: extrapolate using the final segment's tempo
    const a = m[m.length - 2], b = m[m.length - 1];
    const secPerBeat = (b.second - a.second) / (b.beat - a.beat);
    return acc + (beta - b.beat) * secPerBeat;
  }

  function secondsToBeats(t) {
    if (t <= 0) return 0;
    for (let i = 0; i < m.length - 1; i++) {
      const a = m[i], b = m[i + 1];
      if (t < b.second) {
        const frac = (t - a.second) / (b.second - a.second);
        return a.beat + frac * (b.beat - a.beat);
      }
    }
    const a = m[m.length - 2], b = m[m.length - 1];
    const beatPerSec = (b.beat - a.beat) / (b.second - a.second);
    return b.beat + (t - b.second) * beatPerSec;
  }

  function bpmAt(beta) {
    for (let i = 0; i < m.length - 1; i++) {
      if (beta < m[i + 1].beat) return segmentBpm(m[i], m[i + 1]);
    }
    return segmentBpm(m[m.length - 2], m[m.length - 1]);
  }

  return { beatsToSeconds, secondsToBeats, bpmAt, markers: m };
}


// ===========================================================================
// REGIME 3: LINEAR TEMPO RAMP  (an accelerando -- the surprising one)
//
// Now let BPM vary LINEARLY with beat position between a start and end tempo
// over a span of L beats:
//
//   BPM(b) = b0 + (b1 - b0) * (b / L)
//
// People expect that a straight-line tempo gives a straight-line time map.
// It does NOT, and the integral shows exactly why. We need:
//
//   t(beta) = integral 0..beta of  60 / BPM(b)  db
//           = integral 0..beta of  60 / (b0 + s*b)  db        where s = (b1-b0)/L
//
//   RULE (integral of 1/(linear)):  integral of 1/(p + q*x) dx = (1/q) * ln|p + q*x|
//
// (Quick reminder of why: d/dx [ln(p + q*x)] = q/(p + q*x) by the chain rule,
//  so dividing by q undoes the extra factor.) Applying it with p=b0, q=s:
//
//   t(beta) = (60/s) * [ ln(b0 + s*beta) - ln(b0) ]
//           = (60/s) * ln( BPM(beta) / b0 )
//
// That ln is the punchline: a LINEAR change in tempo produces a LOGARITHMIC
// time map. The map bends. If you only ever linearly interpolate beat
// positions you'll drift against the audio, and this is the formula that says
// by how much.
//
// Edge case: if b0 == b1 there's no ramp (s = 0), the 1/(p+qx) rule doesn't
// apply (you'd divide by zero), and you fall back to the constant rule.
// ===========================================================================
export function linearRampMap(startBpm, endBpm, lengthBeats) {
  const s = (endBpm - startBpm) / lengthBeats; // tempo slope, BPM per beat

  function bpmAt(beta) {
    return startBpm + s * beta;
  }

  function beatsToSeconds(beta) {
    if (Math.abs(s) < 1e-9) return (60 / startBpm) * beta; // constant fallback
    return (60 / s) * Math.log(bpmAt(beta) / startBpm);
  }

  function secondsToBeats(t) {
    if (Math.abs(s) < 1e-9) return t / (60 / startBpm);
    // Invert t = (60/s) ln(BPM/b0). Solve for beta:
    //   ln(BPM/b0) = s*t/60
    //   BPM = b0 * e^(s*t/60)
    //   b0 + s*beta = b0 * e^(s*t/60)
    //   beta = (b0/s) * (e^(s*t/60) - 1)
    return (startBpm / s) * (Math.exp((s * t) / 60) - 1);
  }

  return { beatsToSeconds, secondsToBeats, bpmAt };
}
