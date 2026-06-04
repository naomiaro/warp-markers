// ===========================================================================
// beats-parser.js
//
// beat_this writes a .beats file with one line per detected beat. The line
// format is:
//
//     <time-in-seconds><whitespace><beat-in-bar>
//
// where beat-in-bar is an integer counted from 1, and 1 specifically marks a
// DOWNBEAT (the first beat of a musical bar). Time is a floating-point number
// of seconds from the start of the audio file. Example (4/4):
//
//     0.32  3
//     0.84  4
//     1.36  1     <- first downbeat
//     1.88  2
//     2.40  3
//     ...
//
// The first downbeat is rarely at second 0, and the file rarely starts on
// the downbeat -- in the example above the first two beats are PICKUPS, a
// remainder of bar that started before our recording window.
// ===========================================================================

// ---------------------------------------------------------------------------
// parseBeats(text) -> Array<{ second, beatInBar }>
//
// Tolerates blank lines, comment lines starting with '#', and multiple
// whitespace separators. Throws if it cannot find at least one valid row.
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

  // Sanity: times must be strictly increasing. Anything else is a corrupt file.
  for (let i = 1; i < out.length; i++) {
    if (out[i].second <= out[i - 1].second) {
      throw new Error(
        `beats not strictly increasing in time at line containing t=${out[i].second}`
      );
    }
  }
  return out;
}
