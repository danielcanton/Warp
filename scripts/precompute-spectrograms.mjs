#!/usr/bin/env node
/**
 * Pre-compute spectrograms from strain .bin files.
 *
 * Reads public/strain/manifest.json, computes Q-transform for each
 * event/detector, and writes binary spectrogram files to public/spectrogram/.
 *
 * Output format per detector:
 *   - {event}/{detector}.bin  — Float32Array [amplitudes | freqs | times]
 *   - manifest.json           — metadata (freqBins, timeBins, maxAmplitude, etc.)
 *
 * Usage:
 *   node scripts/precompute-spectrograms.mjs              # all events
 *   node scripts/precompute-spectrograms.mjs GW150914      # single event
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const STRAIN_DIR = resolve(ROOT, "public/strain");
const OUTPUT_DIR = resolve(ROOT, "public/spectrogram");

// ─── Q-transform parameters (must match spectrogram-worker.ts) ────────
const FREQ_MIN = 20;
const FREQ_MAX = 1024;
const Q_MIN = 4;
const Q_MAX = 64;
const TIME_BINS = 512;
const FREQ_BINS = 64;

// ─── FFT (minimal radix-2 implementation for Node.js) ─────────────────

function nextPow2(n) {
  return 1 << Math.ceil(Math.log2(n));
}

function hannWindow(N) {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  return w;
}

/**
 * Simple radix-2 FFT (in-place, complex input/output).
 * Input: interleaved [re0, im0, re1, im1, ...] of length 2*N.
 */
function fft(re, im, N) {
  // Bit-reverse permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Cooley-Tukey
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + half] * curRe - im[i + j + half] * curIm;
        const vIm = re[i + j + half] * curIm + im[i + j + half] * curRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const tmpRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = tmpRe;
      }
    }
  }
}

// ─── Q-transform (matches spectrogram-worker.ts) ──────────────────────

function computeQTransform(data, sampleRate) {
  const duration = data.length / sampleRate;

  // Log-spaced frequency bins
  const freqs = new Float32Array(FREQ_BINS);
  const logMin = Math.log2(FREQ_MIN);
  const logMax = Math.log2(FREQ_MAX);
  for (let i = 0; i < FREQ_BINS; i++) {
    freqs[i] = Math.pow(2, logMin + (i / (FREQ_BINS - 1)) * (logMax - logMin));
  }

  // Time axis
  const times = new Float32Array(TIME_BINS);
  for (let j = 0; j < TIME_BINS; j++) {
    times[j] = (j / (TIME_BINS - 1)) * duration;
  }

  const amplitudes = new Float32Array(FREQ_BINS * TIME_BINS);
  let maxAmplitude = 0;

  for (let fi = 0; fi < FREQ_BINS; fi++) {
    const freq = freqs[fi];
    const qFrac = fi / (FREQ_BINS - 1);
    const Q = Q_MIN + qFrac * (Q_MAX - Q_MIN);
    const windowSamples = Math.round((Q / freq) * sampleRate);
    const fftSize = nextPow2(Math.max(windowSamples, 4));

    const window = hannWindow(windowSamples);
    const binIndex = Math.round((freq * fftSize) / sampleRate);

    // Reusable arrays
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);

    for (let tj = 0; tj < TIME_BINS; tj++) {
      const centerSample = Math.round(times[tj] * sampleRate);
      const start = centerSample - Math.floor(windowSamples / 2);

      re.fill(0);
      im.fill(0);

      for (let k = 0; k < windowSamples; k++) {
        const idx = start + k;
        if (idx >= 0 && idx < data.length) {
          re[k] = data[idx] * window[k];
        }
      }

      fft(re, im, fftSize);

      if (binIndex >= 0 && binIndex < fftSize / 2) {
        const mag = Math.sqrt(re[binIndex] ** 2 + im[binIndex] ** 2) / fftSize;
        amplitudes[fi * TIME_BINS + tj] = mag;
        if (mag > maxAmplitude) maxAmplitude = mag;
      }
    }

    // Progress
    process.stdout.write(`\r  freq bin ${fi + 1}/${FREQ_BINS} (${freq.toFixed(0)} Hz)`);
  }
  process.stdout.write("\n");

  return { amplitudes, freqs, times, freqBins: FREQ_BINS, timeBins: TIME_BINS, maxAmplitude };
}

// ─── Main ─────────────────────────────────────────────────────────────

const manifestPath = resolve(STRAIN_DIR, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("No strain manifest found. Run download-strain.py first.");
  process.exit(1);
}

const strainManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const targetEvent = process.argv[2];
const events = targetEvent ? [targetEvent] : Object.keys(strainManifest);

mkdirSync(OUTPUT_DIR, { recursive: true });

const spectrogramManifest = {};

for (const eventName of events) {
  const entry = strainManifest[eventName];
  if (!entry) {
    console.warn(`Event ${eventName} not in strain manifest, skipping.`);
    continue;
  }

  for (const detector of entry.detectors) {
    const binPath = resolve(STRAIN_DIR, eventName, `${detector}.bin`);
    if (!existsSync(binPath)) {
      console.warn(`  ${eventName}/${detector}.bin not found, skipping.`);
      continue;
    }

    console.log(`Processing ${eventName}/${detector}...`);

    // Read strain data
    const buf = readFileSync(binPath);
    const data = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

    // Compute Q-transform
    const result = computeQTransform(data, entry.sampleRate);

    // Write binary: [amplitudes | freqs | times]
    const outDir = resolve(OUTPUT_DIR, eventName);
    mkdirSync(outDir, { recursive: true });

    const totalFloats = result.amplitudes.length + result.freqs.length + result.times.length;
    const outBuf = new Float32Array(totalFloats);
    let offset = 0;
    outBuf.set(result.amplitudes, offset); offset += result.amplitudes.length;
    outBuf.set(result.freqs, offset); offset += result.freqs.length;
    outBuf.set(result.times, offset);

    const outPath = resolve(outDir, `${detector}.bin`);
    writeFileSync(outPath, Buffer.from(outBuf.buffer));

    const sizeKB = (outBuf.byteLength / 1024).toFixed(0);
    console.log(`  → ${outPath} (${sizeKB} KB)`);

    spectrogramManifest[`${eventName}/${detector}`] = {
      freqBins: result.freqBins,
      timeBins: result.timeBins,
      freqMin: FREQ_MIN,
      freqMax: FREQ_MAX,
      qMin: Q_MIN,
      qMax: Q_MAX,
      maxAmplitude: result.maxAmplitude,
    };
  }
}

// Write spectrogram manifest
const manifestOut = resolve(OUTPUT_DIR, "manifest.json");
writeFileSync(manifestOut, JSON.stringify(spectrogramManifest, null, 2));
console.log(`\nManifest written to ${manifestOut}`);
console.log(`Done! ${Object.keys(spectrogramManifest).length} spectrograms pre-computed.`);
