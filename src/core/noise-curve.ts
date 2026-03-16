// ─── FFT, Characteristic Strain & SNR Computation ───────────────────────
// Radix-2 Cooley-Tukey FFT, characteristic strain computation, and
// aLIGO design sensitivity. Pure computation — no Canvas/DOM.

import type { WaveformData, CharacteristicStrain } from "./types";

// ─── FFT ──────────────────────────────────────────────────────────────

/** In-place radix-2 Cooley-Tukey FFT. Arrays must have length = power of 2. */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len *= 2) {
    const halfLen = len / 2;
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const a = i + j;
        const b = a + halfLen;
        const tRe = curRe * re[b] - curIm * im[b];
        const tIm = curRe * im[b] + curIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Next power of 2 >= n */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ─── Characteristic strain from waveform ──────────────────────────────

/**
 * Compute characteristic strain h_c(f) from a time-domain waveform.
 * Zero-pads to at least 2048 samples (next power of 2).
 */
export function computeCharacteristicStrain(waveform: WaveformData): CharacteristicStrain {
  const minN = 2048;
  const N = nextPow2(Math.max(waveform.hPlus.length, minN));
  const dt = 1 / waveform.sampleRate;

  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < waveform.hPlus.length; i++) {
    re[i] = waveform.hPlus[i];
  }

  fftInPlace(re, im);

  const halfN = N / 2;
  const df = 1 / (N * dt);
  const frequencies = new Float64Array(halfN);
  const hc = new Float64Array(halfN);

  for (let k = 0; k < halfN; k++) {
    const f = k * df;
    frequencies[k] = f;
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * dt;
    hc[k] = 2 * f * mag;
  }

  return { frequencies, hc };
}

// ─── aLIGO design sensitivity ─────────────────────────────────────────

const ALIGO_DATA: [number, number][] = [
  [10, 1e-20], [11, 6.5e-21], [12, 4.2e-21], [13, 2.9e-21],
  [14, 2.1e-21], [15, 1.6e-21], [16, 1.3e-21], [17, 1.1e-21],
  [18, 9.0e-22], [19, 7.8e-22], [20, 6.8e-22], [22, 5.3e-22],
  [24, 4.3e-22], [26, 3.6e-22], [28, 3.1e-22], [30, 2.7e-22],
  [33, 2.3e-22], [36, 2.0e-22], [40, 1.7e-22], [45, 1.4e-22],
  [50, 1.2e-22], [55, 1.05e-22], [60, 9.5e-23], [65, 8.7e-23],
  [70, 8.0e-23], [75, 7.5e-23], [80, 7.0e-23], [85, 6.6e-23],
  [90, 6.3e-23], [95, 6.0e-23], [100, 5.7e-23], [110, 5.2e-23],
  [120, 4.8e-23], [130, 4.5e-23], [140, 4.2e-23], [150, 4.0e-23],
  [160, 3.9e-23], [170, 3.8e-23], [180, 3.7e-23], [190, 3.6e-23],
  [200, 3.6e-23], [220, 3.6e-23], [240, 3.7e-23], [260, 3.8e-23],
  [280, 4.0e-23], [300, 4.2e-23], [320, 4.5e-23], [340, 4.8e-23],
  [360, 5.2e-23], [380, 5.6e-23], [400, 6.0e-23], [430, 6.8e-23],
  [460, 7.7e-23], [500, 9.0e-23], [550, 1.1e-22], [600, 1.3e-22],
  [650, 1.5e-22], [700, 1.8e-22], [750, 2.1e-22], [800, 2.5e-22],
  [850, 2.9e-22], [900, 3.4e-22], [950, 4.0e-22], [1000, 4.6e-22],
  [1100, 6.2e-22], [1200, 8.2e-22], [1300, 1.1e-21], [1400, 1.4e-21],
  [1500, 1.8e-21], [1600, 2.3e-21], [1700, 3.0e-21], [1800, 3.8e-21],
  [1900, 4.8e-21], [2000, 6.0e-21], [2200, 9.5e-21], [2400, 1.5e-20],
  [2600, 2.3e-20], [2800, 3.5e-20], [3000, 5.5e-20], [3500, 1.5e-19],
  [4000, 4.5e-19], [4500, 1.3e-18], [5000, 4.0e-18],
];

/**
 * Get the aLIGO design sensitivity as characteristic strain h_c = √(f · S_n(f)).
 */
export function getALIGOCharacteristicStrain(): { frequencies: number[]; hc: number[] } {
  const frequencies: number[] = [];
  const hc: number[] = [];
  for (const [f, asd] of ALIGO_DATA) {
    frequencies.push(f);
    hc.push(Math.sqrt(f) * asd);
  }
  return { frequencies, hc };
}

/** Log-log interpolate aLIGO ASD at an arbitrary frequency. */
export function interpolateALIGO_ASD(f: number): number {
  if (f <= ALIGO_DATA[0][0]) return ALIGO_DATA[0][1];
  if (f >= ALIGO_DATA[ALIGO_DATA.length - 1][0]) return ALIGO_DATA[ALIGO_DATA.length - 1][1];
  for (let i = 0; i < ALIGO_DATA.length - 1; i++) {
    const [f0, a0] = ALIGO_DATA[i];
    const [f1, a1] = ALIGO_DATA[i + 1];
    if (f >= f0 && f <= f1) {
      const t = Math.log(f / f0) / Math.log(f1 / f0);
      return Math.exp(Math.log(a0) + t * Math.log(a1 / a0));
    }
  }
  return ALIGO_DATA[ALIGO_DATA.length - 1][1];
}

/**
 * Compute optimal matched-filter SNR.
 * rho^2 = integral( (h_c(f))^2 / (h_n(f))^2 ) d(ln f)
 */
export function computeOptimalSNR(strain: CharacteristicStrain): number {
  const fMin = 10;
  const fMax = 5000;
  let rhoSq = 0;
  for (let k = 1; k < strain.frequencies.length - 1; k++) {
    const f = strain.frequencies[k];
    if (f < fMin || f > fMax || strain.hc[k] <= 0) continue;
    const asd = interpolateALIGO_ASD(f);
    const hn = Math.sqrt(f) * asd;
    const ratio = strain.hc[k] / hn;
    const df = strain.frequencies[k + 1] - strain.frequencies[k];
    rhoSq += ratio * ratio * (df / f);
  }
  return Math.sqrt(rhoSq);
}
