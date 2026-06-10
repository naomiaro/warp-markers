// ===========================================================================
// warp-program.js
//
// Turn (file markers, project BPM) into everything playback needs. All the
// actual math lives in the chapter library (../ppqn.js) and in 01-the-math;
// this file only composes it.
//
// The central object is the PROGRAM: a list of automation points
//
//     { fileSec, projectSec, rate }
//
// meaning "at project time `projectSec`, the source must be at `fileSec`
// and play at `rate` until the next point". It is segmentRates() reshaped
// for an AudioParam: one setValueAtTime() per point reproduces the whole
// warp, because over each segment
//
//     (project duration) * rate = (60/projectBpm) * (projectBpm/segmentBpm)
//                               = 60/segmentBpm = (file duration per beat)
//
// -- the source lands EXACTLY on the next marker as the next point fires.
//
// One extra point covers the LEAD-IN: the audio before file beat 1 (the
// map's implicit (0,0) -> first-marker segment) is stretched across the
// project's own lead-in, beta in [0, 1), i.e. one project beat.
// ===========================================================================
import {
  piecewiseConstantMap,
  constantMap,
} from "@warp-math/the-math/tempo-map.js";
import { alignBeats, segmentRates } from "../ppqn.js";

export function buildWarpProgram(fileMarkers, projectBpm) {
  const fileMap = piecewiseConstantMap(fileMarkers);
  const projectMap = constantMap(projectBpm);
  const spb = 60 / projectBpm;

  const aligned = alignBeats(fileMarkers, projectBpm);
  const rates = segmentRates(fileMarkers, projectBpm);

  // Lead-in: file supplies m[0].second source-seconds for the one project
  // beat before beat 1. (If the file's first beat is at 0 s this rate is 0
  // -- the source legitimately holds still through the project lead-in.)
  const points = [
    { fileSec: 0, projectSec: 0, rate: fileMarkers[0].second / spb },
  ];
  for (let i = 0; i < aligned.length; i++) {
    points.push({
      fileSec: aligned[i].fileSecond,
      projectSec: aligned[i].projectSecond,
      // Past the last marker there is no segment; extrapolate the last
      // segment's rate, matching piecewiseConstantMap's own extrapolation.
      rate: rates[Math.min(i, rates.length - 1)].rate,
    });
  }

  return {
    points,
    spb,
    rates,
    aligned,
    // The seek math is the chapter's two maps composed: a project second
    // names a beta (rigid grid), and that beta names a file second.
    fileSecForProjectSec: (p) =>
      fileMap.beatsToSeconds(projectMap.secondsToBeats(p)),
    projectSecForFileSec: (f) =>
      projectMap.beatsToSeconds(fileMap.secondsToBeats(f)),
  };
}

// The rate in force at project time p: the last point at or before p.
// Linear scan -- programs are one point per beat, tiny.
export function rateAt(program, p) {
  let rate = program.points[0].rate;
  for (const pt of program.points) {
    if (pt.projectSec <= p) rate = pt.rate;
    else break;
  }
  return rate;
}
