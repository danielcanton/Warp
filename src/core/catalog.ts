// ─── GWOSC Event Catalog ────────────────────────────────────────────────
// Fetch and process the gravitational wave event catalog from GWOSC.
// Pure computation — no browser dependencies.

import type { GWEvent } from "./types";

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

  // Catalog priority: later catalogs have better parameter estimates
  const catalogPriority: Record<string, number> = {
    "O1_O2-Preliminary": 1,
    "Initial_LIGO_Virgo": 1,
    "GWTC-1-marginal": 2,
    "GWTC-1-confident": 3,
    "GWTC-2": 4,
    "GWTC-2.1-marginal": 5,
    "GWTC-2.1-auxiliary": 5,
    "GWTC-2.1-confident": 6,
    "GWTC-3-marginal": 7,
    "GWTC-3-confident": 8,
    "O3_Discovery_Papers": 8,
    "O3_IMBH_marginal": 7,
    "IAS-O3a": 5,
    "GWTC-4.0": 9,
    "O4_Discovery_Papers": 9,
  };

  const deduped = new Map<string, Record<string, unknown>>();

  for (const [, entry] of Object.entries(data.events)) {
    const e = entry as Record<string, unknown>;
    const name = (e.commonName as string) ?? "";
    if (!name) continue;

    const existing = deduped.get(name);
    if (existing) {
      const existingPri = catalogPriority[(existing["catalog.shortName"] as string) ?? ""] ?? 0;
      const newPri = catalogPriority[(e["catalog.shortName"] as string) ?? ""] ?? 0;
      if (newPri > existingPri || (newPri === existingPri && !existing.mass_1_source && e.mass_1_source)) {
        deduped.set(name, e);
      }
    } else {
      deduped.set(name, e);
    }
  }

  const events: GWEvent[] = [];

  for (const [, e] of deduped) {
    if (!e.mass_1_source || !e.mass_2_source) continue;

    const gps = (e.GPS as number) ?? 0;
    const distance = (e.luminosity_distance as number) ?? 0;

    // Generate a deterministic sky position from the GPS timestamp
    const rng = seededRandom(Math.floor(gps));
    const ra = rng() * 2 * Math.PI;
    const dec = Math.asin(2 * rng() - 1);

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
      redshift: (e.redshift as number) ?? 0,
      chi_eff: (e.chi_eff as number) ?? 0,
      network_matched_filter_snr: (e.network_matched_filter_snr as number) ?? 0,
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
      mapPosition: { x, y, z },
    };

    events.push(event);
  }

  // Sort by SNR descending
  events.sort(
    (a, b) => b.network_matched_filter_snr - a.network_matched_filter_snr,
  );

  return events;
}

/**
 * Classify an event by its component masses.
 */
export function classifyEvent(event: GWEvent): string {
  const total = event.mass_1_source + event.mass_2_source;
  if (total < 5) return "BNS";
  if (event.mass_2_source < 3) return "NSBH";
  return "BBH";
}
