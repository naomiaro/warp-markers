// ===========================================================================
// timeline.js
//
// Canvas drawing for the demo. Each beat is rendered as a vertical tick at
// its TEMPO-mapped second, and given its METER classification:
//
//   - downbeats (meter says isDownbeat) get a taller, bolder tick + bar label
//   - interior beats get a shorter, lighter tick
//
// The tick's *height* is meter (what is this beat?), the tick's *x-position*
// is tempo (when is it?). Two layers, drawn from two functions, on one canvas.
// ===========================================================================
import { barPositionOf } from "../meter.js";

const COLOR = {
  beat: "#9b948a",
  downbeat: "#2a2a30",
  marker: "#b8470b",
  markerOutline: "#faf7f2",
  playhead: "#b8470b",
  axisText: "#6b6b75",
};

// Map a second to an x-pixel. We pad the canvas left/right so the first/last
// beat tick has room for its label.
function scale(durationSec, cssW, pad) {
  return (sec) => pad + (sec / durationSec) * (cssW - 2 * pad);
}

export function drawTimeline(canvas, { snap, currentSec, durationSec, draggedBeat }) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = 24;
  const xFor = scale(durationSec, cssW, pad);

  // Baseline.
  ctx.strokeStyle = "#cdc9c1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, cssH * 0.7);
  ctx.lineTo(cssW - pad, cssH * 0.7);
  ctx.stroke();

  // Beat ticks. We ask the tempo layer for the second, and the meter layer
  // for the classification. Two independent calls per beat.
  for (let i = 0; i < snap.model[snap.model.length - 1].beat + 1; i++) {
    const sec = snap.tempo.beatsToSeconds(i);
    const { bar, positionInBar, isDownbeat } = barPositionOf(snap.meterMap, i);
    const x = xFor(sec);
    const topY = isDownbeat ? cssH * 0.15 : cssH * 0.42;

    ctx.strokeStyle = isDownbeat ? COLOR.downbeat : COLOR.beat;
    ctx.lineWidth = isDownbeat ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x, cssH * 0.7);
    ctx.stroke();

    if (isDownbeat) {
      ctx.fillStyle = COLOR.axisText;
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(`bar ${bar}`, x + 3, cssH * 0.12);
    }

    // Below the baseline, write the beat index every 4 beats so the user can
    // count beats against bars in 3/4 mode.
    if (i % 4 === 0) {
      ctx.fillStyle = COLOR.axisText;
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`i=${i}`, x + 3, cssH * 0.82);
    }
  }

  // Warp markers. Draw the model's pinned points as orange dots. The
  // middle marker is the draggable one (index 1 of a 3-marker model).
  ctx.fillStyle = COLOR.marker;
  for (let k = 0; k < snap.model.length; k++) {
    const m = snap.model[k];
    const x = xFor(m.second);
    const r = k === draggedBeat ? 9 : 7;
    ctx.beginPath();
    ctx.arc(x, cssH * 0.7, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLOR.markerOutline;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Playhead.
  if (currentSec != null) {
    const x = xFor(currentSec);
    ctx.strokeStyle = COLOR.playhead;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();
  }

  // Below-the-axis legend.
  ctx.fillStyle = COLOR.axisText;
  ctx.font = "italic 11px ui-serif, serif";
  ctx.fillText(
    "tall tick = downbeat (meter)   ·   dot = warp marker (tempo, draggable)",
    pad,
    cssH * 0.97
  );
}

// Convert a pointer x within the canvas back to a second value, using the
// same padding the renderer uses. Caller is responsible for picking the
// right marker -- this function just does the coordinate math.
export function secondFromPointerX(canvas, clientX, durationSec) {
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width;
  const pad = 24;
  const x = clientX - rect.left;
  const sec = ((x - pad) / (cssW - 2 * pad)) * durationSec;
  return sec;
}

// Find the closest marker (index in model) to a pointer event, within the
// pixel-hit radius. Returns null if nothing is close enough. The first and
// last markers (anchors) are excluded -- only the middle is draggable.
export function pickMarkerIndex(canvas, clientX, clientY, model, durationSec) {
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width;
  const cssH = rect.height;
  const pad = 24;
  const xFor = scale(durationSec, cssW, pad);
  const HIT_RADIUS = 16;

  let best = null;
  let bestD = HIT_RADIUS;
  // Skip the LAST marker (right-edge anchor). All other markers are
  // draggable -- no special "beat 0" anchor anymore.
  for (let k = 0; k < model.length - 1; k++) {
    const x = xFor(model[k].second);
    const y = cssH * 0.7;
    const dx = clientX - rect.left - x;
    const dy = clientY - rect.top - y;
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      best = k;
      bestD = d;
    }
  }
  return best;
}
