// ===========================================================================
// timeline.js
//
// Canvas drawing for the playback timeline. Three layers, all in AUDIO-clock
// seconds (which is what the user's ear hears) but with beat/bar tick marks
// derived from the warp-map math.
//
//   Layer 1: beat tick marks (thin) and bar lines (thick at every downbeat).
//   Layer 2: a small dot for every BEAT recomputed via beatsToSeconds(beat).
//            In real-audio mode this should sit exactly on top of the .beats
//            file's reported time -- it's the visible proof that the math
//            agrees with the data we started from.
//   Layer 3: the playhead -- a vertical line at the current audio second.
// ===========================================================================
import { beatToAudioSec } from "./grid.js";

const COLOR = {
  rule: "#cdc9c1",
  beat: "#9b948a",
  downbeat: "#2a2a30",
  recomputed: "#b8470b",
  playhead: "#b8470b",
  axisText: "#6b6b75",
};

export function drawTimeline(canvas, { grid, durationSec, currentAudioSec }) {
  const ctx = canvas.getContext("2d");

  // Match backing-store size to CSS size so 1px lines stay crisp on hi-DPI.
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // Empty state: a baseline, an instruction, and nothing else.
  if (!grid) {
    ctx.fillStyle = COLOR.axisText;
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      "load a .beats file (and optionally an audio file) to draw the grid",
      12,
      cssH / 2
    );
    return;
  }

  const xFor = (sec) => (sec / durationSec) * cssW;

  // Beat ticks.
  for (let i = 0; i < grid.model.length; i++) {
    const beat = grid.model[i].beat;
    const audioSec = grid.model[i].second + grid.audioOffsetSec;
    const x = xFor(audioSec);
    const isDownbeat =
      grid.barBoundaries.length > 0 &&
      grid.barBoundaries.includes(beat);

    ctx.beginPath();
    ctx.strokeStyle = isDownbeat ? COLOR.downbeat : COLOR.beat;
    ctx.lineWidth = isDownbeat ? 2 : 1;
    const top = isDownbeat ? cssH * 0.15 : cssH * 0.35;
    ctx.moveTo(x, top);
    ctx.lineTo(x, cssH * 0.75);
    ctx.stroke();

    if (isDownbeat) {
      ctx.fillStyle = COLOR.axisText;
      ctx.font = "11px ui-monospace, monospace";
      const barNumber = (beat - grid.pickupBeats) / 4 + 1;
      // Just the number (no "bar " prefix) -- when beats are close together
      // the longer label overlaps the next downbeat's tick.
      ctx.fillText(String(barNumber), x + 3, cssH * 0.13);
    }
  }

  // Recomputed beat dots. We ask the map for beatsToSeconds(i) and put a
  // small dot there. In a no-warp scenario these sit ON the tick marks.
  // The point of drawing them separately is that if we ever start warping
  // (pinning beats to new seconds in this layer too), the two will visibly
  // diverge -- showing the map's effect on top of the original data.
  ctx.fillStyle = COLOR.recomputed;
  for (let i = 0; i < grid.model.length; i++) {
    const audioSec = beatToAudioSec(i, grid);
    const x = xFor(audioSec);
    ctx.beginPath();
    ctx.arc(x, cssH * 0.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pickup label, drawn once at the start of the timeline.
  if (grid.pickupBeats > 0) {
    ctx.fillStyle = COLOR.axisText;
    ctx.font = "italic 11px ui-serif, serif";
    const firstDownbeatAudioSec =
      beatToAudioSec(grid.pickupBeats, grid);
    ctx.fillText(
      `pickup: ${grid.pickupBeats} beats →`,
      4,
      cssH * 0.88
    );
    ctx.fillText(
      `↑ first downbeat`,
      xFor(firstDownbeatAudioSec) + 3,
      cssH * 0.88
    );
  }

  // Playhead.
  if (currentAudioSec != null) {
    const x = xFor(currentAudioSec);
    ctx.beginPath();
    ctx.strokeStyle = COLOR.playhead;
    ctx.lineWidth = 1.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();
  }
}
