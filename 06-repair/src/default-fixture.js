// ===========================================================================
// default-fixture.js
//
// A mostly-correct 4/4 beat map with two deliberate errors so the default
// state of the editor lets the user exercise all three repair operations:
//
//   1. An EXTRA beat sneaks into bar 2 (the second beat is doubled),
//      making that bar 5 beats long. Repair: delete the spurious marker.
//   2. The third beat of bar 3 is MISSING (the tracker dropped it),
//      making that bar 3 beats long. Repair: click the gap to insert.
//   3. The last beat of bar 4 is slightly MISTIMED (jitter -- about
//      40 ms early). Repair: drag it back into place.
//
// Tempo is steady 120 BPM (0.5 s per beat) so the user can read errors
// off the spacing by eye. There is no pickup -- the file starts on
// downbeat 1 -- which keeps the indexing simple while still exercising
// the meter validator.
// ===========================================================================
const SEC_PER_BEAT = 0.5;

export function defaultFixture() {
  // 4 bars * 4 beats = 16 beats, indices 0..15. We'll then mutate.
  const markers = [];
  for (let i = 0; i < 16; i++) markers.push({ second: i * SEC_PER_BEAT });
  const downbeatIndices = [0, 4, 8, 12];

  // Error 1: extra beat near the second beat of bar 2.
  // Insert at t = 4.5 + 0.25 = 4.75. Bar 2 (indices 4..7) becomes
  // 4..8, five beats. Downstream downbeats shift.
  markers.splice(6, 0, { second: 2.75 });

  // After the splice, the absolute indices are:
  //   0:0  1:0.5  2:1  3:1.5  4:2 (downbeat bar 2)  5:2.5  6:2.75 (extra)
  //   7:3  8:3.5  9:4 (was downbeat) ...
  // We need to shift downbeats >= 6 up by 1.
  for (let i = 0; i < downbeatIndices.length; i++) {
    if (downbeatIndices[i] >= 6) downbeatIndices[i] += 1;
  }

  // Error 2: drop the third beat of bar 3. That used to be the absolute
  // index that's now (after the prior splice) at downbeat bar 3 + 2.
  const bar3Down = downbeatIndices[2];
  const dropIdx = bar3Down + 2;
  markers.splice(dropIdx, 1);
  for (let i = 0; i < downbeatIndices.length; i++) {
    if (downbeatIndices[i] > dropIdx) downbeatIndices[i] -= 1;
  }

  // Error 3: nudge the last beat of bar 4 earlier by 40 ms.
  const bar4Down = downbeatIndices[3];
  const lastBeatOfBar4 = bar4Down + 3;
  markers[lastBeatOfBar4] = {
    second: markers[lastBeatOfBar4].second - 0.04,
  };

  return { markers, downbeatIndices };
}
