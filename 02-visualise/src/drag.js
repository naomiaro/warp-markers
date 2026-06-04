// ===========================================================================
// drag.js
//
// Click-and-drag a marker dot in the warp chart to call pin(model, beat, sec)
// and rebuild the map. The interaction works in DATA coordinates: the mouse's
// canvas y is converted back to seconds via the chart's y-scale.
//
// We do NOT mutate any model. Each drag end calls pin() and the resulting
// fresh model is handed back to the caller; if pin() throws (the drag would
// make time run backwards) we snap back by simply not committing.
// ===========================================================================
import { pin } from "@warp-math/the-math/warp-marker.js";

const HIT_RADIUS_PX = 14; // generous click target around the marker

// Distance from a pointer event to a marker, in pixels. Markers live at data
// coords (beat, second); the chart's scales convert those to canvas pixels.
function distancePx(chart, evt, marker) {
  const px = chart.scales.x.getPixelForValue(marker.beat);
  const py = chart.scales.y.getPixelForValue(marker.second);
  const rect = chart.canvas.getBoundingClientRect();
  const mx = evt.clientX - rect.left;
  const my = evt.clientY - rect.top;
  return Math.hypot(mx - px, my - py);
}

// Find the closest marker within the hit radius, or null. The LAST marker
// is the right-edge anchor (defines the end of the timeline); we exclude
// it from dragging so the chart's x-axis stays sane. Every other marker
// is draggable -- there's no special "beat 0" anchor anymore since beat
// maps don't have one.
function pickMarker(chart, evt, model) {
  let best = null;
  let bestDist = HIT_RADIUS_PX;
  for (let i = 0; i < model.length - 1; i++) {
    const d = distancePx(chart, evt, model[i]);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

// Translate the pointer's canvas y back into the seconds axis.
function pointerToSeconds(chart, evt) {
  const rect = chart.canvas.getBoundingClientRect();
  const my = evt.clientY - rect.top;
  return chart.scales.y.getValueForPixel(my);
}

// ---------------------------------------------------------------------------
// attachDragHandlers: wires up the warp canvas for drag-to-pin. The caller
// passes:
//   getModel() -> current markers array (or null if not in piecewise mode)
//   onCommit(newModel) -> called with the post-pin model after a successful drop
//   onPreview(previewModel) -> optional, called on every mousemove during a drag
//                              so the chart can re-render the in-flight state
// ---------------------------------------------------------------------------
export function attachDragHandlers(chart, { getModel, onCommit, onPreview }) {
  const canvas = chart.canvas;
  let dragIndex = null;
  let originalModel = null;

  function onPointerDown(evt) {
    const model = getModel();
    if (!model) return; // not in piecewise mode
    const i = pickMarker(chart, evt, model);
    if (i == null) return;
    dragIndex = i;
    originalModel = model;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(evt.pointerId);
  }

  function onPointerMove(evt) {
    if (dragIndex == null) return;
    const newSecond = pointerToSeconds(chart, evt);
    const beat = originalModel[dragIndex].beat;
    try {
      const next = pin(originalModel, beat, newSecond);
      onPreview?.(next);
    } catch {
      // Out-of-range drag in progress: render the original (i.e., refuse to
      // show an invalid state) instead of crashing.
      onPreview?.(originalModel);
    }
  }

  function onPointerUp(evt) {
    if (dragIndex == null) return;
    const newSecond = pointerToSeconds(chart, evt);
    const beat = originalModel[dragIndex].beat;
    let committed;
    try {
      committed = pin(originalModel, beat, newSecond);
    } catch {
      // Snap back: keep the original model as the committed state.
      committed = originalModel;
    }
    onCommit(committed);
    dragIndex = null;
    originalModel = null;
    canvas.classList.remove("dragging");
    if (canvas.hasPointerCapture(evt.pointerId)) {
      canvas.releasePointerCapture(evt.pointerId);
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
}
