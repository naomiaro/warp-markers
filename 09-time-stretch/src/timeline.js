// ===========================================================================
// timeline.js
//
// The grain lattice, made visible. Two lanes like chapter 07's demo --
// file beats on top (the wobble), the rigid project grid below -- plus,
// in granular mode, the grains themselves: one translucent block per
// grain at its outputSec (width = grainSec), tinted by the segment rate
// it samples (warm = hurrying through the source, cool = lingering).
// Where blocks crowd darker, grains overlap -- that is the crossfade.
// ===========================================================================

const COLOR = {
  rule: "#cdc9c1",
  fileBeat: "#9b948a",
  gridBeat: "#2a2a30",
  playhead: "#b8470b",
  axisText: "#6b6b75",
};

function rateTint(rate) {
  // rate > 1 warm (orange), rate < 1 cool (blue), 1.0 neutral grey
  if (rate > 1.001) return `rgba(184, 71, 11, ${Math.min(0.35, 0.12 + (rate - 1))})`;
  if (rate < 0.999) return `rgba(38, 80, 145, ${Math.min(0.35, 0.12 + (1 - rate))})`;
  return "rgba(110, 110, 118, 0.16)";
}

export function drawTimeline(canvas, view) {
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

  if (!view) {
    ctx.fillStyle = COLOR.axisText;
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("load a .beats file to draw the grains", 12, cssH / 2);
    return;
  }

  const { plan, grains, durationSec, fileDurationSec, currentSec, mode } = view;
  const pad = 16;
  const yFile = cssH * 0.2;
  const yGrid = cssH * 0.82;
  const xOut = (sec) => pad + (sec / durationSec) * (cssW - 2 * pad);
  const xFile = (sec) => pad + (sec / fileDurationSec) * (cssW - 2 * pad);

  ctx.strokeStyle = COLOR.rule;
  ctx.lineWidth = 1;
  for (const y of [yFile, yGrid]) {
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(cssW - pad, y);
    ctx.stroke();
  }
  ctx.fillStyle = COLOR.axisText;
  ctx.font = "italic 11px ui-serif, serif";
  ctx.fillText("file beats (source clock)", pad, yFile - 20);
  ctx.fillText(
    mode === "granular"
      ? "project grid + grains (output clock) — width = grain, tint = rate"
      : "project grid (output clock)",
    pad,
    yGrid + 28
  );

  // Grain lattice (granular mode only): blocks between the lanes.
  if (mode === "granular" && grains) {
    const gTop = cssH * 0.34;
    const gBot = cssH * 0.7;
    for (const g of grains) {
      ctx.fillStyle = rateTint(g.rate);
      const x = xOut(g.outputSec);
      const w = Math.max(1.5, xOut(g.outputSec + g.durationSec) - x);
      ctx.fillRect(x, gTop, w, gBot - gTop);
    }
  }

  // File beats (top, source clock).
  ctx.strokeStyle = COLOR.fileBeat;
  ctx.lineWidth = 1.5;
  for (const a of plan.anchors) {
    const x = xFile(a.fileSecond);
    ctx.beginPath();
    ctx.moveTo(x, yFile - 12);
    ctx.lineTo(x, yFile + 12);
    ctx.stroke();
  }

  // Project grid beats (bottom, output clock).
  ctx.strokeStyle = COLOR.gridBeat;
  const spb = 60 / plan.projectBpm;
  for (let n = 1; n * spb <= durationSec + 1e-9; n++) {
    const x = xOut(n * spb);
    ctx.beginPath();
    ctx.moveTo(x, yGrid - 12);
    ctx.lineTo(x, yGrid + 12);
    ctx.stroke();
  }

  // Playhead on the output clock.
  if (currentSec != null) {
    ctx.strokeStyle = COLOR.playhead;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xOut(currentSec), yFile - 16);
    ctx.lineTo(xOut(currentSec), yGrid + 16);
    ctx.stroke();
  }
}
