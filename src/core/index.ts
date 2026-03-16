// ─── WarpLab Core ───────────────────────────────────────────────────────
// Pure computation library for gravitational wave physics.
// No browser dependencies — works in Node.js, Deno, and browser.

export type {
  GWEvent,
  WaveformData,
  QNMMode,
  CharacteristicStrain,
  BinaryParams,
  GeodesicOutcome,
  ParticleType,
  GeodesicResult,
} from "./types";

export { Vec3 } from "./vec3";

export { fetchEventCatalog, classifyEvent } from "./catalog";

export { generateWaveform, generateCustomWaveform } from "./waveform";

export {
  computeQNMModes,
  estimateFinalSpin,
  estimateFinalMass,
} from "./qnm";

export {
  computeCharacteristicStrain,
  computeOptimalSNR,
  getALIGOCharacteristicStrain,
  interpolateALIGO_ASD,
} from "./noise-curve";

export {
  integrateGeodesic,
  integrateTimelikeGeodesic,
  timelikeVeff,
  iscoRadius,
  circularOrbitEnergy,
} from "./geodesic";

export type { EMCounterpart, MultiMessengerData } from "./multi-messenger";
export { getMultiMessengerData } from "./multi-messenger";

export {
  generateParametersJSON,
  generateParametersCSV,
  generateWaveformCSV,
  generateBibTeX,
  generateNotebook,
  generateREADME,
} from "./export";
