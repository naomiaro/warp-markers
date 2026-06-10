// ===========================================================================
// timeline.js
//
// Two lanes, one warp:
//
//   TOP lane    -- the FILE's own clock. A tick at every file beat, at its
//                  original (wobbly) second. Its own x-scale.
//   BOTTOM lane -- the PROJECT grid. A tick at every project beat, rigidly
//                  spaced. Its own x-scale.
//   CONNECTORS  -- beat n on top joined to beat n on the bottom. Where the
//                  fan pinches or spreads is where segmentRates() is doing
//                  work: pinching = rate > 1 (source hurries), spreading =
//                  rate < 1 (source relaxes).
//
// Two playheads, one clock: the transport runs in project time p (bottom),
// and the top playhead sits at fileSecForProjectSec(p) -- the same map
// composition the engine uses to start the source. When warp is OFF the
// file plays raw, so the top playhead just sits at p.
// ===========================================================================

const COLOR = {
  rule: "#cdc9c1",
  fileBeat: "#9b948a",
  gridBeat: "#2a2a30",
  connector: "#b8470b55",
  playhead: "#b8470b",
  axisText: "#6b6b75",
};

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
    ctx.fillText("load a .beats file to draw the warp", 12, cssH / 2);
    return;
  }

  const {
    fileMarkers, fileDurationSec, projectDurationSec,
    program, warpOn, currentProjectSec,
  } = view;

  const pad = 16;
  const yFile = cssH * 0.22;
  const yGrid = cssH * 0.78;
  const xFile = (sec) => pad + (sec / fileDurationSec) * (cssW - 2 * pad);
  const xGrid = (sec) => pad + (sec / projectDurationSec) * (cssW - 2 * pad);

  // Lane baselines + labels.
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
  ctx.fillText("file (its own wobbly seconds)", pad, yFile - 22);
  ctx.fillText("project grid (rigid seconds)", pad, yGrid + 30);

  // Connectors first so ticks draw on top of them.
  ctx.strokeStyle = COLOR.connector;
  ctx.lineWidth = 1;
  for (let i = 0; i < fileMarkers.length; i++) {
    ctx.beginPath();
    ctx.moveTo(xFile(fileMarkers[i].second), yFile);
    ctx.lineTo(xGrid(program.aligned[i].projectSecond), yGrid);
    ctx.stroke();
  }

  // File beats (top).
  ctx.strokeStyle = COLOR.fileBeat;
  ctx.lineWidth = 1.5;
  for (const m of fileMarkers) {
    const x = xFile(m.second);
    ctx.beginPath();
    ctx.moveTo(x, yFile - 14);
    ctx.lineTo(x, yFile);
    ctx.stroke();
  }

  // Project beats (bottom) -- as far as the grid extends.
  ctx.strokeStyle = COLOR.gridBeat;
  for (let n = 1; n * program.spb <= projectDurationSec + 1e-9; n++) {
    const x = xGrid(n * program.spb);
    ctx.beginPath();
    ctx.moveTo(x, yGrid);
    ctx.lineTo(x, yGrid + 14);
    ctx.stroke();
  }

  // Playheads. One clock (project time), two positions via the map.
  if (currentProjectSec != null) {
    const p = currentProjectSec;
    const fileSec = warpOn ? program.fileSecForProjectSec(p) : p;
    ctx.strokeStyle = COLOR.playhead;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xGrid(p), yGrid - 18);
    ctx.lineTo(xGrid(p), yGrid + 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xFile(fileSec), yFile - 18);
    ctx.lineTo(xFile(fileSec), yFile + 18);
    ctx.stroke();
  }
}
