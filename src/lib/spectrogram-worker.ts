/**
 * Web Worker: Q-transform spectrogram computation.
 *
 * Receives Float32Array strain data + params, returns a 2D amplitude grid
 * using constant-Q STFT (different window sizes per frequency bin).
 */

import FFT from "fft.js";

export interface SpectrogramRequest {
  data: Float32Array;
  sampleRate: number;
  freqMin: number;
  freqMax: number;
  qMin: number;
  qMax: number;
  timeBins: number;
}

export interface SpectrogramResult {
  amplitudes: Float32Array; // row-major [freqBins × timeBins]
  freqs: Float32Array;     // center frequencies (log-spaced)
  times: Float32Array;     // time axis values
  freqBins: number;
  timeBins: number;
  maxAmplitude: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function nextPow2(n: number): number {
  return 1 << Math.ceil(Math.log2(n));
}

function hannWindow(N: number): Float32Array {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  return w;
}

// ─── Q-transform ─────────────────────────────────────────────────────

function computeQTransform(req: SpectrogramRequest): SpectrogramResult {
  const { data, sampleRate, freqMin, freqMax, qMin, qMax, timeBins } = req;
  const duration = data.length / sampleRate;

  // Log-spaced frequency bins (20–1024 Hz)
  const freqBins = 64;
  const freqs = new Float32Array(freqBins);
  const logMin = Math.log2(freqMin);
  const logMax = Math.log2(freqMax);
  for (let i = 0; i < freqBins; i++) {
    freqs[i] = Math.pow(2, logMin + (i / (freqBins - 1)) * (logMax - logMin));
  }

  // Time axis
  const times = new Float32Array(timeBins);
  for (let j = 0; j < timeBins; j++) {
    times[j] = (j / (timeBins - 1)) * duration;
  }

  const amplitudes = new Float32Array(freqBins * timeBins);
  let maxAmplitude = 0;

  // Cache FFT instances by size
  const fftCache = new Map<number, InstanceType<typeof FFT>>();

  for (let fi = 0; fi < freqBins; fi++) {
    const freq = freqs[fi];

    // Q increases with frequency (higher Q at higher freqs for better frequency resolution)
    const qFrac = (fi / (freqBins - 1));
    const Q = qMin + qFrac * (qMax - qMin);

    // Window length = Q cycles at this frequency
    const windowSamples = Math.round((Q / freq) * sampleRate);
    const fftSize = nextPow2(Math.max(windowSamples, 4));

    // Get or create FFT instance
    let fft = fftCache.get(fftSize);
    if (!fft) {
      fft = new FFT(fftSize);
      fftCache.set(fftSize, fft);
    }

    const window = hannWindow(windowSamples);
    const paddedInput = new Float32Array(fftSize);
    const spectrum = fft.createComplexArray();

    // Frequency bin index in FFT output
    const binIndex = Math.round((freq * fftSize) / sampleRate);

    for (let tj = 0; tj < timeBins; tj++) {
      const centerSample = Math.round(times[tj] * sampleRate);
      const start = centerSample - Math.floor(windowSamples / 2);

      // Fill windowed segment
      paddedInput.fill(0);
      for (let k = 0; k < windowSamples; k++) {
        const idx = start + k;
        if (idx >= 0 && idx < data.length) {
          paddedInput[k] = data[idx] * window[k];
        }
      }

      // FFT
      fft.realTransform(spectrum, paddedInput);

      // Extract magnitude at the target frequency bin
      if (binIndex >= 0 && binIndex < fftSize / 2) {
        const re = spectrum[2 * binIndex];
        const im = spectrum[2 * binIndex + 1];
        const mag = Math.sqrt(re * re + im * im) / fftSize;
        amplitudes[fi * timeBins + tj] = mag;
        if (mag > maxAmplitude) maxAmplitude = mag;
      }
    }
  }

  return { amplitudes, freqs, times, freqBins, timeBins, maxAmplitude };
}

// ─── Worker message handler ──────────────────────────────────────────

self.onmessage = (e: MessageEvent<SpectrogramRequest>) => {
  const result = computeQTransform(e.data);
  // Transfer the large arrays for zero-copy
  (self as unknown as Worker).postMessage(result, [
    result.amplitudes.buffer,
    result.freqs.buffer,
    result.times.buffer,
  ]);
};
