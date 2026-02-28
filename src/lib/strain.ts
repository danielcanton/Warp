/** Real LIGO/Virgo detector strain data loader (lazy, on-demand) */

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
