// Re-export from core — browser consumers import from here
export type { QNMMode } from "../core/types";
export { computeQNMModes, estimateFinalSpin, estimateFinalMass } from "../core/qnm";

// Re-export geodesic helpers that were previously in this file
export { timelikeVeff, iscoRadius, circularOrbitEnergy } from "../core/geodesic";
