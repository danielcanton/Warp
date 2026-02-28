/** Real LIGO/Virgo detector strain data loader (lazy, on-demand) */

import FFT from "fft.js";

export interface StrainData {
  sampleRate: number;
  gpsStart: number;
  detector: string;
  data: Float32Array;
  duration: number;
}

interface ManifestEntry {
  detectors: string[];
  sampleRate: number;
  gpsStart: number;
  duration: number;
}

type StrainManifest = Record<string, ManifestEntry>;

const STRAIN_BASE = "/strain";

let manifestPromise: Promise<StrainManifest> | null = null;
const strainCache = new Map<string, StrainData>();

async function getManifest(): Promise<StrainManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${STRAIN_BASE}/manifest.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Strain manifest not found (${res.status})`);
        return res.json() as Promise<StrainManifest>;
      })
      .catch((err) => {
        manifestPromise = null;
        throw err;
      });
  }
  return manifestPromise;
}

/**
 * Load strain data for a specific event and detector.
 * Data is fetched lazily on first request, then cached in memory.
 *
 * @param eventName - GWOSC event name (e.g. "GW150914")
 * @param detector - Detector ID: "H1", "L1", or "V1". Defaults to first available.
 */
export async function loadStrain(
  eventName: string,
  detector?: string
): Promise<StrainData> {
  const manifest = await getManifest();
  const entry = manifest[eventName];
  if (!entry) {
    throw new Error(`No strain data available for ${eventName}`);
  }

  const det = detector ?? entry.detectors[0];
  if (!entry.detectors.includes(det)) {
    throw new Error(
      `Detector ${det} not available for ${eventName}. Available: ${entry.detectors.join(", ")}`
    );
  }

  const cacheKey = `${eventName}/${det}`;
  const cached = strainCache.get(cacheKey);
  if (cached) return cached;

  const url = `${STRAIN_BASE}/${eventName}/${det}.bin`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load strain data: ${url} (${res.status})`);
  }

  const buffer = await res.arrayBuffer();
  const data = new Float32Array(buffer);

  const strain: StrainData = {
    sampleRate: entry.sampleRate,
    gpsStart: entry.gpsStart,
    detector: det,
    data,
    duration: entry.duration,
  };

  strainCache.set(cacheKey, strain);
  return strain;
}

/**
 * Get available detectors for an event without loading strain data.
 */
export async function getAvailableDetectors(
  eventName: string
): Promise<string[]> {
  const manifest = await getManifest();
  const entry = manifest[eventName];
  return entry?.detectors ?? [];
}

/**
 * Check if strain data is available for an event.
 */
export async function hasStrainData(eventName: string): Promise<boolean> {
  const manifest = await getManifest();
  return eventName in manifest;
}

/**
 * Get all events that have strain data available.
 */
export async function getStrainEvents(): Promise<string[]> {
  const manifest = await getManifest();
  return Object.keys(manifest);
}

// ─── Spectral whitening ───────────────────────────────────────────────

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Apply spectral whitening: flatten the PSD by dividing each frequency
 * bin by √PSD, then inverse-FFT back to the time domain.
 *
 * This equalizes frequency content so the chirp signal stands out
 * above detector noise coloring.
 *
 * @param strain - Raw strain samples
 * @param sampleRate - Sample rate in Hz
 * @returns Whitened strain (same length as input)
 */
export function whiten(strain: Float32Array, sampleRate: number): Float32Array {
  const N = strain.length;
  const fftSize = nextPow2(N);
  const fft = new FFT(fftSize);

  // Zero-pad input
  const padded = new Float32Array(fftSize);
  padded.set(strain);

  // Forward FFT → complex spectrum [re0, im0, re1, im1, ...]
  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);
  // fft.js only fills bins 0..N/2; complete the conjugate-symmetric part
  fft.completeSpectrum(spectrum);

  // Estimate PSD magnitude per bin and divide
  // Use a small smoothing window on the magnitude to avoid divide-by-zero
  const halfBins = fftSize / 2 + 1;
  const mag = new Float32Array(halfBins);
  for (let i = 0; i < halfBins; i++) {
    const re = spectrum[2 * i];
    const im = spectrum[2 * i + 1];
    mag[i] = Math.sqrt(re * re + im * im);
  }

  // Smooth the magnitude estimate (running average, window ~1% of bins, min 4)
  const smoothW = Math.max(4, Math.round(halfBins * 0.01));
  const smoothMag = new Float32Array(halfBins);
  let runSum = 0;
  for (let i = 0; i < halfBins; i++) {
    runSum += mag[i];
    if (i >= smoothW) runSum -= mag[i - smoothW];
    const count = Math.min(i + 1, smoothW);
    smoothMag[i] = runSum / count;
  }

  // Apply whitening: divide spectrum by smoothed magnitude
  const floor = 1e-30; // avoid division by zero
  // Frequencies below ~15 Hz and above Nyquist/2: taper to avoid edge artifacts
  const fMin = 15;
  const fMax = sampleRate * 0.45;
  const df = sampleRate / fftSize;

  for (let i = 0; i < halfBins; i++) {
    const freq = i * df;
    let gain = 1.0;
    if (freq < fMin) {
      gain = freq / fMin; // ramp up from 0 Hz
    } else if (freq > fMax) {
      gain = Math.max(0, 1 - (freq - fMax) / (sampleRate / 2 - fMax));
    }

    const s = Math.max(smoothMag[i], floor);
    const scale = gain / s;
    spectrum[2 * i] *= scale;
    spectrum[2 * i + 1] *= scale;

    // Mirror to conjugate bin
    if (i > 0 && i < fftSize / 2) {
      const j = fftSize - i;
      spectrum[2 * j] = spectrum[2 * i];
      spectrum[2 * j + 1] = -spectrum[2 * i + 1];
    }
  }

  // Inverse FFT
  const out = fft.createComplexArray();
  fft.inverseTransform(out, spectrum);

  // Extract real part, truncate to original length
  const result = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    result[i] = out[2 * i];
  }

  return result;
}
