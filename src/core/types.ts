// ─── Shared types for WarpLab core computation ─────────────────────────
// These types are used by both browser and server (MCP/CLI) entry points.

/** GWOSC event catalog entry */
export interface GWEvent {
  commonName: string;
  GPS: number;
  mass_1_source: number;
  mass_1_source_lower: number;
  mass_1_source_upper: number;
  mass_2_source: number;
  mass_2_source_lower: number;
  mass_2_source_upper: number;
  luminosity_distance: number;
  luminosity_distance_lower: number;
  luminosity_distance_upper: number;
  redshift: number;
  chi_eff: number;
  network_matched_filter_snr: number;
  far: number;
  catalog_shortName: string;
  total_mass_source: number;
  chirp_mass_source: number;
  chirp_mass_source_lower: number;
  chirp_mass_source_upper: number;
  final_mass_source: number;
  final_mass_source_lower: number;
  final_mass_source_upper: number;
  p_astro: number;
  /** Derived 3D position for the universe map (ra, dec, distance → cartesian) */
  mapPosition?: { x: number; y: number; z: number };
}

/** Pre-processed waveform data for an event */
export interface WaveformData {
  eventName: string;
  sampleRate: number;
  hPlus: number[];
  hCross: number[];
  duration: number;
  peakIndex: number;
}

/** A single QNM mode result */
export interface QNMMode {
  /** Mode indices (l, m, n) */
  l: number;
  m: number;
  n: number;
  /** Oscillation frequency in Hz */
  frequency: number;
  /** Damping time in seconds */
  dampingTime: number;
  /** Quality factor Q = π f τ */
  qualityFactor: number;
  /** Label string e.g. "(2,2,0)" */
  label: string;
}

/** Characteristic strain data from FFT */
export interface CharacteristicStrain {
  /** Frequency bins in Hz */
  frequencies: Float64Array;
  /** h_c(f) = 2f |h̃(f)| */
  hc: Float64Array;
}

/** Parameters for a custom binary merger waveform */
export interface BinaryParams {
  m1: number;          // solar masses (1–150)
  m2: number;          // solar masses (1–150)
  chi1: number;        // spin (-1 to +1)
  chi2: number;        // spin (-1 to +1)
  distance: number;    // Mpc
  inclination: number; // radians
}

export type GeodesicOutcome = "captured" | "scattered" | "orbiting" | "bound";
export type ParticleType = "photon" | "particle";

export interface GeodesicResult {
  points: { x: number; y: number; z: number }[];
  outcome: GeodesicOutcome;
  L: number;
  particleType: ParticleType;
}
