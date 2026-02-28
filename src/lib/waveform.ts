import * as THREE from "three";

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
  // Derived: 3D position for the universe map (computed from distance + seeded random angle)
  mapPosition?: THREE.Vector3;
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

const GWOSC_API = "https://gwosc.org/eventapi/json/allevents/";

/**
 * Simple seeded PRNG so event positions are stable across sessions.
 * Uses the GPS timestamp as seed.
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * Fetch the full GWTC event catalog from GWOSC.
 * The API returns a flat structure (parameters directly on each event object).
 */
export async function fetchEventCatalog(): Promise<GWEvent[]> {
  const res = await fetch(GWOSC_API);
  if (!res.ok) throw new Error(`GWOSC API returned ${res.status}`);
  const data = await res.json();

  const events: GWEvent[] = [];

  for (const [, entry] of Object.entries(data.events)) {
    const e = entry as Record<string, unknown>;

    // Skip events without mass data
    if (!e.mass_1_source || !e.mass_2_source) continue;

    const gps = (e.GPS as number) ?? 0;
    const distance = (e.luminosity_distance as number) ?? 0;
    const redshift = (e.redshift as number) ?? 0;

    // Generate a deterministic sky position from the GPS timestamp
    const rng = seededRandom(Math.floor(gps));
    const ra = rng() * 2 * Math.PI; // right ascension [0, 2π]
    const dec = Math.asin(2 * rng() - 1); // declination [-π/2, π/2]

    // Convert (distance, ra, dec) to cartesian (Mpc)
    const r = distance;
    const x = r * Math.cos(dec) * Math.cos(ra);
    const y = r * Math.cos(dec) * Math.sin(ra);
    const z = r * Math.sin(dec);

    const event: GWEvent = {
      commonName: (e.commonName as string) ?? "",
      GPS: gps,
      mass_1_source: e.mass_1_source as number,
      mass_1_source_lower: (e.mass_1_source_lower as number) ?? 0,
      mass_1_source_upper: (e.mass_1_source_upper as number) ?? 0,
      mass_2_source: e.mass_2_source as number,
      mass_2_source_lower: (e.mass_2_source_lower as number) ?? 0,
      mass_2_source_upper: (e.mass_2_source_upper as number) ?? 0,
      luminosity_distance: distance,
      luminosity_distance_lower: (e.luminosity_distance_lower as number) ?? 0,
      luminosity_distance_upper: (e.luminosity_distance_upper as number) ?? 0,
      redshift: redshift,
      chi_eff: (e.chi_eff as number) ?? 0,
      network_matched_filter_snr:
        (e.network_matched_filter_snr as number) ?? 0,
      far: (e.far as number) ?? 0,
      catalog_shortName: (e["catalog.shortName"] as string) ?? "",
      total_mass_source: (e.total_mass_source as number) ?? 0,
      chirp_mass_source: (e.chirp_mass_source as number) ?? 0,
      chirp_mass_source_lower: (e.chirp_mass_source_lower as number) ?? 0,
      chirp_mass_source_upper: (e.chirp_mass_source_upper as number) ?? 0,
      final_mass_source: (e.final_mass_source as number) ?? 0,
      final_mass_source_lower: (e.final_mass_source_lower as number) ?? 0,
      final_mass_source_upper: (e.final_mass_source_upper as number) ?? 0,
      p_astro: (e.p_astro as number) ?? 0,
      mapPosition: new THREE.Vector3(x, y, z),
    };

    events.push(event);
  }

  // Sort by SNR descending
  events.sort(
    (a, b) => b.network_matched_filter_snr - a.network_matched_filter_snr
  );

  return events;
}

/**
 * Classify an event by its component masses.
 */
export function classifyEvent(event: GWEvent): string {
  const total = event.mass_1_source + event.mass_2_source;
  if (total < 5) return "BNS"; // Binary Neutron Star
  if (event.mass_2_source < 3) return "NSBH"; // Neutron Star – Black Hole
  return "BBH"; // Binary Black Hole
}

/**
 * Generate a synthetic IMRPhenom-like waveform for an event.
 *
 * Simplified analytical approximation of inspiral-merger-ringdown.
 * The key physics:
 * - Inspiral: frequency chirps as f(t) ~ (t_merger - t)^(-3/8)
 * - Merger: peak amplitude
 * - Ringdown: damped sinusoid at the remnant QNM frequency
 */
export function generateWaveform(event: GWEvent): WaveformData {
  const m1 = event.mass_1_source;
  const m2 = event.mass_2_source;
  const totalMass = m1 + m2;
  const chirpMass = Math.pow(m1 * m2, 3 / 5) / Math.pow(totalMass, 1 / 5);

  const sampleRate = 512;
  const duration = Math.min(4.0, Math.max(1.5, 120 / chirpMass));
  const numSamples = Math.floor(duration * sampleRate);
  const mergerIndex = Math.floor(numSamples * 0.75);

  const hPlus: number[] = new Array(numSamples);
  const hCross: number[] = new Array(numSamples);

  const fRingdown = 32000 / totalMass;
  const tauRingdown = totalMass / 5000;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const tMerger = mergerIndex / sampleRate;

    let amplitude: number;
    let phase: number;

    if (i < mergerIndex) {
      const tau = Math.max(tMerger - t, 0.001);
      const freqFactor = chirpMass / 30;
      amplitude = 0.3 * Math.pow(0.5 / tau, 1 / 4);
      phase =
        -2 * Math.PI * 20 * Math.pow(0.5, 3 / 8) * (8 / 5) *
        Math.pow(tau, 5 / 8) * freqFactor;
      amplitude = Math.min(amplitude, 1.0);
    } else {
      const tPost = t - tMerger;
      amplitude = Math.exp(-tPost / tauRingdown);
      phase = 2 * Math.PI * fRingdown * tPost;
    }

    hPlus[i] = amplitude * Math.cos(phase);
    hCross[i] = amplitude * Math.sin(phase);
  }

  // Normalize
  let maxAmp = 0;
  for (let i = 0; i < numSamples; i++) {
    const a = Math.sqrt(hPlus[i] ** 2 + hCross[i] ** 2);
    if (a > maxAmp) maxAmp = a;
  }
  if (maxAmp > 0) {
    for (let i = 0; i < numSamples; i++) {
      hPlus[i] /= maxAmp;
      hCross[i] /= maxAmp;
    }
  }

  return {
    eventName: event.commonName,
    sampleRate,
    hPlus,
    hCross,
    duration,
    peakIndex: mergerIndex,
  };
}

/**
 * Create a DataTexture from waveform data for the GPU.
 */
export function waveformToTexture(waveform: WaveformData): THREE.DataTexture {
  const width = waveform.hPlus.length;
  const data = new Float32Array(width * 4);

  for (let i = 0; i < width; i++) {
    data[i * 4 + 0] = waveform.hPlus[i] * 0.5 + 0.5;
    data[i * 4 + 1] = waveform.hCross[i] * 0.5 + 0.5;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 1;
  }

  const texture = new THREE.DataTexture(
    data,
    width,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;

  return texture;
}
