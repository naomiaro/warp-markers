// ===========================================================================
// state.js
//
// Glue between the UI controls and the pure math layer (01-the-math). This
// file decides what `model` and `map` to hand the charts, given the current
// regime + slider values. It never re-implements any map math -- every call
// goes through the imported functions so the picture cannot drift from them.
// ===========================================================================
import {
  constantMap,
  piecewiseConstantMap,
  linearRampMap,
  curvedMap,
} from "@warp-math/the-math/tempo-map.js";

// Total beat-axis extent for the charts. Long enough that the curves have room
// to bend visibly under a ramp; short enough to keep the math readable.
export const BETA_MAX = 12;

// Builds the initial 3-segment marker model from three segment-BPM values.
// Each segment is 4 beats long, so we just integrate (60/bpm) * 4 per segment
// to get the seconds at each marker. The first marker is always {0, 0}
// because piecewiseConstantMap requires it.
function piecewiseModelFromBpms(bpms) {
  const markers = [{ beat: 0, second: 0 }];
  let t = 0;
  for (let i = 0; i < bpms.length; i++) {
    t += (60 / bpms[i]) * 4;
    markers.push({ beat: (i + 1) * 4, second: t });
  }
  return markers;
}

// Single source of truth: given UI state, produce the {map, model} pair the
// charts will read. `model` is non-null only in the piecewise regime, because
// that is the only regime with draggable markers.
export function snapshot(ui) {
  if (ui.regime === "constant") {
    return { map: constantMap(ui.constantBpm), model: null };
  }
  if (ui.regime === "ramp") {
    return {
      map: linearRampMap(ui.rampStart, ui.rampEnd, ui.rampLength),
      model: null,
    };
  }
  if (ui.regime === "curved") {
    // We deliberately do NOT expose draggable warp markers on the curved
    // map. Pinning is a piecewise-constant concern (a {beat, second} pair
    // forces a *kink* in the map, which makes no sense on a smooth power
    // curve). The slider for k is the only handle here; that's the decision.
    return {
      map: curvedMap(
        ui.curvedStart,
        ui.curvedEnd,
        ui.curvedLength,
        ui.curvedK
      ),
      model: null,
    };
  }
  // piecewise: ui carries either a model (if the user has dragged) or just
  // the three slider BPMs (if they haven't yet). The model takes precedence.
  const model = ui.piecewiseModel ?? piecewiseModelFromBpms(ui.piecewiseBpms);
  return { map: piecewiseConstantMap(model), model };
}

// Initial model the first time the user enters piecewise mode. Exposed so the
// UI can fall back to it after a user resets / switches regimes.
export function initialPiecewiseModel(bpms) {
  return piecewiseModelFromBpms(bpms);
}

// ---------------------------------------------------------------------------
// Sampling helpers. The charts draw line segments through these samples.
// ---------------------------------------------------------------------------

// Seconds-per-beat curve (= 60 / BPM(b)). The CHART of this function is what
// the integral runs under -- the SHADED AREA from 0 to beta IS beatsToSeconds.
export function sampleSecPerBeat(map, betaMax, n = 200) {
  const xs = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const b = (i / n) * betaMax;
    xs[i] = { x: b, y: 60 / map.bpmAt(b) };
  }
  return xs;
}

// Warp-map curve t(beta). Sample by stepping beta and asking beatsToSeconds.
export function sampleWarpMap(map, betaMax, n = 200) {
  const xs = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const b = (i / n) * betaMax;
    xs[i] = { x: b, y: map.beatsToSeconds(b) };
  }
  return xs;
}

// Trapezoidal area under 60/BPM from 0 to beta. Used purely as a teaching
// check: this number should track beatsToSeconds(beta) closely, demonstrating
// that the shaded area on the left chart literally IS the y-value on the right.
// The residual exists for the linear ramp because the analytic answer is a
// logarithm and our trapezoid is an approximation; for constant and piecewise
// the residual is numerical zero.
export function trapezoidArea(map, beta, n = 512) {
  if (beta <= 0) return 0;
  const h = beta / n;
  let acc = 0;
  let prev = 60 / map.bpmAt(0);
  for (let i = 1; i <= n; i++) {
    const cur = 60 / map.bpmAt(i * h);
    acc += (prev + cur) * 0.5 * h;
    prev = cur;
  }
  return acc;
}
