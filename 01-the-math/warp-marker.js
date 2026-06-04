// ===========================================================================
// warp-marker.js
//
// "What does it mean to pin a sample to a beat?"
//
// A warp marker is a single fact: "the audio at THIS second is musically THAT
// beat." Written as { beat, second }. Pinning = asserting one such fact and
// letting the segments on either side rescale to keep the assertion true.
//
// Crucially, pinning a marker does NOT set a tempo. It sets a (beat, second)
// point on the warp map. Tempo is whatever slope the neighbouring markers now
// imply -- so moving ONE marker changes the derived tempo of the TWO segments
// touching it, and (because the map is cumulative) shifts every beat after it
// in absolute seconds. Pinning is local; drift is global.
// ===========================================================================

import { segmentBpm } from "./tempo-map.js";


// ---------------------------------------------------------------------------
// pin(model, beat, second)
//
// Insert or move a marker that fixes `beat` to `second`. Returns a new model
// (does not mutate the input). The map stays valid only if markers strictly
// increase in both beat and second -- you cannot pin beat 3 earlier in the
// audio than beat 2 sits, because that would mean time running backwards.
// ---------------------------------------------------------------------------
export function pin(model, beat, second) {
  const next = model
    .filter((mk) => mk.beat !== beat) // replace any existing marker at this beat
    .concat({ beat, second })
    .sort((a, b) => a.beat - b.beat);

  // Validity check: seconds must be strictly increasing along beats.
  for (let i = 1; i < next.length; i++) {
    if (next[i].second <= next[i - 1].second) {
      throw new Error(
        `pinning beat ${beat} to ${second}s would make time non-monotonic`
      );
    }
  }
  return next;
}


// ---------------------------------------------------------------------------
// describePin(model, beat) -- a teaching helper.
//
// Reports the two derived tempos that meet AT a marker: the segment coming in
// and the segment going out. This is what visibly changes when you drag a
// marker, and what a DAW shows as the tempo "kink" at a warp point.
// ---------------------------------------------------------------------------
export function describePin(model, beat) {
  const i = model.findIndex((mk) => mk.beat === beat);
  if (i < 0) throw new Error(`no marker at beat ${beat}`);
  const incoming = i > 0 ? segmentBpm(model[i - 1], model[i]) : null;
  const outgoing = i < model.length - 1 ? segmentBpm(model[i], model[i + 1]) : null;
  return { incomingBpm: incoming, outgoingBpm: outgoing };
}
