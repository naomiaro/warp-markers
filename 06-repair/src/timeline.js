// ===========================================================================
// timeline.js
//
// Canvas drawing for the repair editor. Layers, bottom up:
//
//   1. Bar background shading driven by validateAgainstMeter -- green for
//      bars whose beat count matches the target, red for bars that don't,
//      neutral grey for the pickup or trailing partial bar.
//   2. Bar boundary verticals + bar labels with the actual beat count
//      (e.g. "bar 2: 5 beats — expected 4").
//   3. Beat ticks. Downbeats are taller / heavier than interior beats.
//   4. Beat markers (orange dots) -- the draggable handles. The currently
//      selected beat is rendered larger with a different outline so the
//      user can see what delete / move will affect.
// ===========================================================================
const PAD = 28;

export function drawTimeline(canvas, state) {
  const c = canvas;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = c.clientWidth;
  const cssH = c.clientHeight;
  if (c.width !== cssW * dpr || c.height !== cssH * dpr) {
    c.width = cssW * dpr;
    c.height = cssH * dpr;
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const { markers, downbeatIndices, bars, selected, expectedBpb } = state;
  if (markers.length === 0) {
    ctx.fillStyle = "#6b6b75";
    ctx.font = "13px ui-serif, serif";
    ctx.fillText("(no beats loaded)", PAD, cssH / 2);
    return;
  }

  // Time range: pad slightly past the last beat so the rightmost dot has
  // room. Empty space to the right of the last beat is where the user
  // can click to insert a trailing beat.
  const dur = markers[markers.length - 1].second + 0.5;
  const xFor = (sec) => PAD + (sec / dur) * (cssW - 2 * PAD);

  // ---- layer 1: bar background shading ----
  for (const bar of bars) {
    const x0 = xFor(markers[bar.fromIndex].second);
    const x1 =
      bar.toIndex + 1 < markers.length
        ? xFor(markers[bar.toIndex + 1].second)
        : xFor(dur);
    let fill = "rgba(120, 120, 130, 0.18)"; // pickup / trailing
    if (!bar.isPickup && !bar.isTrailing) {
      fill = bar.ok ? "rgba(74, 124, 74, 0.18)" : "rgba(200, 55, 55, 0.18)";
    }
    ctx.fillStyle = fill;
    ctx.fillRect(x0, cssH * 0.08, x1 - x0, cssH * 0.6);
  }

  // ---- layer 2: bar boundaries + labels ----
  for (const bar of bars) {
    const xStart = xFor(markers[bar.fromIndex].second);
    if (!bar.isPickup && !bar.isTrailing) {
      // Bar label centered above the FROM tick.
      ctx.fillStyle = bar.ok ? "#4a7c4a" : "#c83737";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`bar ${bar.bar}`, xStart, cssH * 0.06);
      if (!bar.ok) {
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = "#c83737";
        ctx.fillText(
          `${bar.beatCount} beats — expected ${expectedBpb}`,
          xStart,
          cssH * 0.78
        );
      }
      ctx.textAlign = "left";
    } else if (bar.isPickup) {
      ctx.fillStyle = "#6b6b75";
      ctx.font = "italic 10px ui-serif, serif";
      ctx.fillText(`pickup (${bar.beatCount})`, PAD, cssH * 0.06);
    } else if (bar.isTrailing) {
      ctx.fillStyle = "#6b6b75";
      ctx.font = "italic 10px ui-serif, serif";
      ctx.textAlign = "center";
      ctx.fillText(`trailing (${bar.beatCount})`, xStart, cssH * 0.06);
      ctx.textAlign = "left";
    }
  }

  // ---- baseline + beat ticks ----
  ctx.strokeStyle = "#cdc9c1";
  ctx.beginPath();
  ctx.moveTo(PAD, cssH * 0.65);
  ctx.lineTo(cssW - PAD, cssH * 0.65);
  ctx.stroke();
  const downSet = new Set(downbeatIndices);
  for (let i = 0; i < markers.length; i++) {
    const x = xFor(markers[i].second);
    const isDown = downSet.has(i);
    ctx.strokeStyle = isDown ? "#2a2a30" : "#9b948a";
    ctx.lineWidth = isDown ? 2.2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, isDown ? cssH * 0.18 : cssH * 0.42);
    ctx.lineTo(x, cssH * 0.65);
    ctx.stroke();
  }

  // ---- layer 4: beat dots (draggable handles) ----
  for (let i = 0; i < markers.length; i++) {
    const x = xFor(markers[i].second);
    const y = cssH * 0.65;
    const isSelected = selected === i;
    const r = isSelected ? 9 : 6;
    ctx.fillStyle = isSelected ? "#b8470b" : "rgba(184, 71, 11, 0.75)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isSelected ? "#2a2a30" : "#faf7f2";
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.stroke();
  }

  // Click-to-insert hint along the baseline (light dashed line below).
  ctx.strokeStyle = "rgba(184, 71, 11, 0.25)";
  ctx.setLineDash([2, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, cssH * 0.9);
  ctx.lineTo(cssW - PAD, cssH * 0.9);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#6b6b75";
  ctx.font = "italic 10px ui-serif, serif";
  ctx.fillText(
    "click an empty area to insert a beat at that time",
    PAD,
    cssH * 0.99
  );
}

// ---------------------------------------------------------------------------
// Coordinate utilities used by the click/drag handlers.
// ---------------------------------------------------------------------------

// Time at a given pointer x within the canvas, using the same scale the
// renderer used. Returns null if the click is outside the padded area.
export function timeAtPointerX(canvas, clientX, markers) {
  if (markers.length === 0) return null;
  const rect = canvas.getBoundingClientRect();
  const dur = markers[markers.length - 1].second + 0.5;
  const x = clientX - rect.left;
  if (x < PAD || x > rect.width - PAD) return null;
  return ((x - PAD) / (rect.width - 2 * PAD)) * dur;
}

// Pick the beat marker closest to a pointer event, if any is within the
// hit radius. Returns the marker index or null.
const HIT_RADIUS = 14;
export function pickMarkerIndex(canvas, clientX, clientY, markers) {
  if (markers.length === 0) return null;
  const rect = canvas.getBoundingClientRect();
  const dur = markers[markers.length - 1].second + 0.5;
  const xFor = (sec) => PAD + (sec / dur) * (rect.width - 2 * PAD);
  const yBeats = rect.height * 0.65;
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  let best = null;
  let bestDist = HIT_RADIUS;
  for (let i = 0; i < markers.length; i++) {
    const d = Math.hypot(mx - xFor(markers[i].second), my - yBeats);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}
