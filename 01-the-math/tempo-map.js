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


// ===========================================================================
// REGIME 4: CURVED TEMPO  (ease in / ease out -- the one without a formula)
//
// Now let tempo follow a POWER curve between start and end over L beats, with
// an "easing exponent" k that bends the shape:
//
//   BPM(b) = b0 + (b1 - b0) * (b / L)^k         ,   k > 0
//
// k = 1 is the linear ramp from REGIME 3 -- a straight line in tempo.
// k > 1 eases IN: tempo changes slowly at first, then rushes (concave-up
//   when accelerating, concave-down when decelerating).
// 0 < k < 1 eases OUT: tempo changes quickly at first, then settles.
// This is the shape DAW tempo-automation lanes actually use.
//
// Why we change tactics here
// --------------------------
// The integral we want is still the same one:
//
//   t(beta) = integral 0..beta of  60 / BPM(b)  db
//           = integral 0..beta of  60 / ( b0 + Delta * (b/L)^k )  db
//
// For k = 1 we just solved this with the "integral of 1/(linear)" rule. For
// k = 2 the integrand is 60 / (b0 + Delta * b^2 / L^2) -- a constant over a
// quadratic. Its antiderivative is an arctangent (or a log, depending on the
// sign of Delta), but the formulas get hairier and stop generalising. For
// general non-integer k -- which is exactly what you want from a smooth
// easing slider -- the antiderivative has NO ELEMENTARY CLOSED FORM. There
// is simply no combination of polynomials, exponentials, logarithms, and
// trig that evaluates this integral for arbitrary k.
//
// So we stop trying to solve the integral symbolically and EVALUATE it
// numerically. The method:
//
//   TRAPEZOIDAL RULE.  Slice the interval 0..beta into n equal pieces of
//     width h = beta/n. On each slice, approximate the area under 60/BPM
//     by a trapezoid with parallel sides 60/BPM(x_i) and 60/BPM(x_{i+1}).
//     Summing across slices,
//
//         integral approx (h/2) * ( f(x_0) + 2 f(x_1) + ... + 2 f(x_{n-1}) + f(x_n) )
//
//     The error shrinks like O(h^2). With n = 512 over a few seconds of
//     audio, the residual is far below anything an ear can hear.
//
// And the inverse:
//
//   BISECTION.  We need secondsToBeats(t). beatsToSeconds is STRICTLY
//     INCREASING (because BPM(b) > 0 means 60/BPM is positive, so the
//     integral is monotone), so for any target t there is exactly one beta
//     with beatsToSeconds(beta) = t. Binary-search for it: keep an interval
//     [lo, hi] known to bracket the answer, and halve it until the width is
//     under tolerance. Monotonicity is what makes this safe -- without it,
//     bisection could converge to the wrong root.
// ===========================================================================
export function curvedMap(startBpm, endBpm, lengthBeats, k = 2) {
  if (k <= 0) throw new Error("curvedMap requires k > 0");
  if (lengthBeats <= 0) throw new Error("curvedMap requires lengthBeats > 0");

  const delta = endBpm - startBpm;

  function bpmAt(beta) {
    // (beta / L)^k. For beta < 0 the curve is undefined; clamp to 0 so the
    // start tempo holds for anything before the ramp begins.
    const x = Math.max(0, beta) / lengthBeats;
    return startBpm + delta * Math.pow(x, k);
  }

  // ---- trapezoidal integration of 60 / BPM(b) from 0 to beta ----
  // n = 512 keeps the error well below audio-perceivable for a few tens of
  // seconds; bumping n trades CPU for accuracy if you ever need it.
  const TRAP_N = 512;
  function beatsToSeconds(beta) {
    if (beta <= 0) return 0;
    if (Math.abs(delta) < 1e-9) {
      // start == end: BPM is constant, the integral collapses to division.
      // We could let the trapezoid handle this -- it would be exact for a
      // constant integrand -- but writing it explicitly is faster and makes
      // the "constant case is one division" rule visible.
      return (60 / startBpm) * beta;
    }
    const h = beta / TRAP_N;
    // Endpoints contribute with weight 0.5, interior points with weight 1.
    let acc = 0.5 * (60 / bpmAt(0) + 60 / bpmAt(beta));
    for (let i = 1; i < TRAP_N; i++) {
      acc += 60 / bpmAt(i * h);
    }
    return acc * h;
  }

  // ---- bisection inverse of beatsToSeconds ----
  function secondsToBeats(t) {
    if (t <= 0) return 0;
    if (Math.abs(delta) < 1e-9) return t / (60 / startBpm);

    // We need an upper bracket: some beta whose beatsToSeconds(beta) >= t.
    // Start with the ramp length and double until we cover t. This handles
    // the case where the user asks for a second past the end of the ramp --
    // the curve keeps extrapolating (BPM(b) = b0 + Delta*(b/L)^k is defined
    // for b > L too), so we just walk forward until we've gone far enough.
    let lo = 0;
    let hi = lengthBeats;
    let hiSec = beatsToSeconds(hi);
    let guard = 0;
    while (hiSec < t && guard++ < 64) {
      lo = hi;
      hi *= 2;
      hiSec = beatsToSeconds(hi);
    }

    // 50 halvings = 2^-50 ≈ 1e-15 -- well past sensible audio precision.
    // We exit early once the interval is narrower than the tolerance.
    const TOL = 1e-9;
    for (let i = 0; i < 50; i++) {
      const mid = 0.5 * (lo + hi);
      if (hi - lo < TOL) return mid;
      const midSec = beatsToSeconds(mid);
      if (midSec < t) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  return { beatsToSeconds, secondsToBeats, bpmAt };
}
