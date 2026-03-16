// ─── Waveform Synthesis ─────────────────────────────────────────────────
// Simplified analytical IMRPhenom-like waveform generation.
// Pure computation — no browser dependencies.

import type { GWEvent, WaveformData, BinaryParams } from "./types";

/**
 * Generate a synthetic IMRPhenom-like waveform for a catalog event.
 *
 * Simplified analytical approximation of inspiral-merger-ringdown.
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
 * Generate a synthetic IMRPhenom-like waveform from custom parameters.
 * Includes spin-dependent ringdown and inclination effects.
 */
export function generateCustomWaveform(params: BinaryParams): WaveformData {
  const { m1, m2, chi1, chi2, inclination } = params;
  const totalMass = m1 + m2;
  const chirpMass = Math.pow(m1 * m2, 3 / 5) / Math.pow(totalMass, 1 / 5);

  const chiEff = (m1 * chi1 + m2 * chi2) / totalMass;

  const sampleRate = 512;
  const duration = Math.min(4.0, Math.max(1.5, 120 / chirpMass));
  const numSamples = Math.floor(duration * sampleRate);
  const mergerIndex = Math.floor(numSamples * 0.75);

  const hPlus: number[] = new Array(numSamples);
  const hCross: number[] = new Array(numSamples);

  // Ringdown frequency — spin correction
  const fRingdown = (32000 / totalMass) * (1 + 0.15 * Math.abs(chiEff));
  const tauRingdown = totalMass / 5000;

  // Inclination affects relative amplitude of h+ vs h×
  const cosInc = Math.cos(inclination);
  const ampPlus = (1 + cosInc * cosInc) / 2;
  const ampCross = cosInc;

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

    hPlus[i] = amplitude * ampPlus * Math.cos(phase);
    hCross[i] = amplitude * ampCross * Math.sin(phase);
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

  const name = `Custom (${m1.toFixed(0)}+${m2.toFixed(0)} M\u2609)`;

  return {
    eventName: name,
    sampleRate,
    hPlus,
    hCross,
    duration,
    peakIndex: mergerIndex,
  };
}
