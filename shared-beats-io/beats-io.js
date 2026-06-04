// ===========================================================================
// beats-io.js  -- shared .beats TSV parser + writer
//
// beat_this emits a .beats file with one line per detected beat:
//
//     <time-in-seconds><whitespace><beat-in-bar>
//
// where beat-in-bar is an integer counted from 1, and 1 specifically marks
// a DOWNBEAT (the first beat of a musical bar). Time is a floating-point
// number of seconds from the start of the audio. Example (4/4):
//
//     0.32  3
//     0.84  4
//     1.36  1     <- first downbeat
//     1.88  2
//     2.40  3
//     ...
//
// Chapter 03 reads this format to drive Web Audio playback; chapter 06
// reads it AND writes it back out after hand-repair. Both import the
// same parser/writer from this one workspace so the format definition
// can't drift between them.
// ===========================================================================


// ---------------------------------------------------------------------------
// parseBeats(text) -> Array<{ second, beatInBar }>
//
// Tolerates blank lines, comment lines starting with '#', and multiple
// whitespace separators. Throws if it cannot find at least one valid row
// or if the resulting timestamps aren't strictly increasing (which means
// the file is corrupt -- the warp map can't be defined on it).
// ---------------------------------------------------------------------------
export function parseBeats(text) {
  const lines = text.split(/\r?\n/);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === "" || raw.startsWith("#")) continue;

    const parts = raw.split(/\s+/);
    if (parts.length < 2) {
      throw new Error(
        `beats parse error on line ${i + 1}: expected "<time> <beat>", got "${raw}"`
      );
    }
    const second = Number(parts[0]);
    const beatInBar = Number(parts[1]);
    if (!Number.isFinite(second) || !Number.isFinite(beatInBar)) {
      throw new Error(
        `beats parse error on line ${i + 1}: not numeric: "${raw}"`
      );
    }
    if (!Number.isInteger(beatInBar) || beatInBar < 1) {
      throw new Error(
        `beats parse error on line ${i + 1}: beat-in-bar must be a positive integer, got ${beatInBar}`
      );
    }
    out.push({ second, beatInBar });
  }

  if (out.length === 0) throw new Error("no beats found in file");

  for (let i = 1; i < out.length; i++) {
    if (out[i].second <= out[i - 1].second) {
      throw new Error(
        `beats not strictly increasing in time at line containing t=${out[i].second}`
      );
    }
  }
  return out;
}


// ---------------------------------------------------------------------------
// exportBeatsTsv(markers, downbeatIndices) -> string
//
// Reverse of parseBeats: emit the .beats TSV that beat_this would emit for
// the same musical content. `markers` is an array of { second } (or { time }
// or { beat, second } -- only `second` is required). `downbeatIndices` is
// an array of integer indices into `markers` listing which beats are
// downbeats.
//
// Convention for beat-in-bar numbering (matching beat_this): each downbeat
// is row "1". The rows between downbeat k and downbeat k+1 are numbered
// 2, 3, ..., up to (gap-in-beats). Beats BEFORE the first downbeat (the
// pickup) are numbered from (downbeatGap - pickupCount + 1) up to the bar
// length -- i.e. the bar position they would have had if the recording
// had started at the previous downbeat. We use the gap to the first
// downbeat to infer the pickup numbering; if there is no downbeat in the
// data (degenerate), every row gets beatInBar=1.
//
// Round-trip: parseBeats(exportBeatsTsv(parseBeats(s)...)) === parseBeats(s).
// ---------------------------------------------------------------------------
export function exportBeatsTsv(markers, downbeatIndices) {
  if (!Array.isArray(markers) || markers.length === 0) {
    throw new Error("exportBeatsTsv requires a non-empty markers array");
  }
  const downSet = new Set(downbeatIndices || []);
  // Sorted downbeats by index (asc) for the numbering walk.
  const downs = [...(downbeatIndices || [])].sort((a, b) => a - b);

  // We need to know the bar length (beats per bar in the FIRST measured
  // bar) to label the pickup. If there are two or more downbeats, use the
  // gap between the first two. If only one (or zero), assume 4 -- enough
  // information isn't in the data, and 4/4 is the most common default.
  const firstBarLen = downs.length >= 2 ? downs[1] - downs[0] : 4;

  const lines = [];
  for (let i = 0; i < markers.length; i++) {
    let beatInBar;
    if (downSet.has(i)) {
      beatInBar = 1;
    } else if (downs.length === 0 || i < downs[0]) {
      // Pickup: number from (firstBarLen - pickupCount + 1) up to firstBarLen.
      // If pickupCount > firstBarLen we're past sensible numbering -- clamp.
      const firstDown = downs.length > 0 ? downs[0] : 0;
      const pickupCount = firstDown;
      const positionInBar = firstBarLen - pickupCount + i; // 0-based, then +1 below
      beatInBar = ((positionInBar % firstBarLen) + firstBarLen) % firstBarLen + 1;
    } else {
      // Find the most recent downbeat at or before i.
      let prev = downs[0];
      for (const d of downs) {
        if (d <= i) prev = d;
        else break;
      }
      beatInBar = i - prev + 1;
    }
    const second = markers[i].second;
    if (!Number.isFinite(second)) {
      throw new Error(`exportBeatsTsv: markers[${i}].second is not a number`);
    }
    lines.push(`${second.toFixed(6)}\t${beatInBar}`);
  }
  return lines.join("\n") + "\n";
}
