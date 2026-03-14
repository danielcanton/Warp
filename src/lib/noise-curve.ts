// ─── FFT & aLIGO Noise Curve ─────────────────────────────────────────
// Radix-2 Cooley-Tukey FFT, characteristic strain computation, and
// hardcoded aLIGO design sensitivity for a log-log Canvas2D overlay.

import type { WaveformData } from "./waveform";
import type { ViewMode } from "./view-mode";

// ─── FFT ──────────────────────────────────────────────────────────────

/** In-place radix-2 Cooley-Tukey FFT. Arrays must have length = power of 2. */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const N = re.length;
  // Bit-reversal permutation
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
  // Butterfly stages
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

export interface CharacteristicStrain {
  /** Frequency bins in Hz */
  frequencies: Float64Array;
  /** h_c(f) = 2f |h̃(f)| */
  hc: Float64Array;
}

/**
 * Compute characteristic strain h_c(f) from a time-domain waveform.
 * Zero-pads to at least 2048 samples (next power of 2).
 */
export function computeCharacteristicStrain(waveform: WaveformData): CharacteristicStrain {
  const minN = 2048;
  const N = nextPow2(Math.max(waveform.hPlus.length, minN));
  const dt = 1 / waveform.sampleRate;

  // Zero-padded input
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < waveform.hPlus.length; i++) {
    re[i] = waveform.hPlus[i];
  }

  fftInPlace(re, im);

  // Only positive frequencies (up to Nyquist)
  const halfN = N / 2;
  const df = 1 / (N * dt);
  const frequencies = new Float64Array(halfN);
  const hc = new Float64Array(halfN);

  for (let k = 0; k < halfN; k++) {
    const f = k * df;
    frequencies[k] = f;
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * dt; // |h̃(f)|
    hc[k] = 2 * f * mag;
  }

  return { frequencies, hc };
}

// ─── aLIGO design sensitivity ─────────────────────────────────────────
// Approximate aLIGO design ASD √S_n(f) in 1/√Hz, sampled at ~100 points
// from 10 Hz to 5 kHz. Based on LIGO-T1800044 / aligo_O4high.txt.
// Values are amplitude spectral density (strain / √Hz).

const ALIGO_DATA: [number, number][] = [
  [10, 1e-20],
  [11, 6.5e-21],
  [12, 4.2e-21],
  [13, 2.9e-21],
  [14, 2.1e-21],
  [15, 1.6e-21],
  [16, 1.3e-21],
  [17, 1.1e-21],
  [18, 9.0e-22],
  [19, 7.8e-22],
  [20, 6.8e-22],
  [22, 5.3e-22],
  [24, 4.3e-22],
  [26, 3.6e-22],
  [28, 3.1e-22],
  [30, 2.7e-22],
  [33, 2.3e-22],
  [36, 2.0e-22],
  [40, 1.7e-22],
  [45, 1.4e-22],
  [50, 1.2e-22],
  [55, 1.05e-22],
  [60, 9.5e-23],
  [65, 8.7e-23],
  [70, 8.0e-23],
  [75, 7.5e-23],
  [80, 7.0e-23],
  [85, 6.6e-23],
  [90, 6.3e-23],
  [95, 6.0e-23],
  [100, 5.7e-23],
  [110, 5.2e-23],
  [120, 4.8e-23],
  [130, 4.5e-23],
  [140, 4.2e-23],
  [150, 4.0e-23],
  [160, 3.9e-23],
  [170, 3.8e-23],
  [180, 3.7e-23],
  [190, 3.6e-23],
  [200, 3.6e-23],
  [220, 3.6e-23],
  [240, 3.7e-23],
  [260, 3.8e-23],
  [280, 4.0e-23],
  [300, 4.2e-23],
  [320, 4.5e-23],
  [340, 4.8e-23],
  [360, 5.2e-23],
  [380, 5.6e-23],
  [400, 6.0e-23],
  [430, 6.8e-23],
  [460, 7.7e-23],
  [500, 9.0e-23],
  [550, 1.1e-22],
  [600, 1.3e-22],
  [650, 1.5e-22],
  [700, 1.8e-22],
  [750, 2.1e-22],
  [800, 2.5e-22],
  [850, 2.9e-22],
  [900, 3.4e-22],
  [950, 4.0e-22],
  [1000, 4.6e-22],
  [1100, 6.2e-22],
  [1200, 8.2e-22],
  [1300, 1.1e-21],
  [1400, 1.4e-21],
  [1500, 1.8e-21],
  [1600, 2.3e-21],
  [1700, 3.0e-21],
  [1800, 3.8e-21],
  [1900, 4.8e-21],
  [2000, 6.0e-21],
  [2200, 9.5e-21],
  [2400, 1.5e-20],
  [2600, 2.3e-20],
  [2800, 3.5e-20],
  [3000, 5.5e-20],
  [3500, 1.5e-19],
  [4000, 4.5e-19],
  [4500, 1.3e-18],
  [5000, 4.0e-18],
];

/**
 * Get the aLIGO design sensitivity as characteristic strain h_c = √(f · S_n(f)).
 * Returns [frequency, h_c] pairs for plotting.
 */
export function getALIGOCharacteristicStrain(): { frequencies: number[]; hc: number[] } {
  const frequencies: number[] = [];
  const hc: number[] = [];
  for (const [f, asd] of ALIGO_DATA) {
    frequencies.push(f);
    // h_c = √(f · S_n(f)) = √f · ASD
    hc.push(Math.sqrt(f) * asd);
  }
  return { frequencies, hc };
}

// ─── Noise Curve Plot ─────────────────────────────────────────────────

export interface NoiseCurvePlotOptions {
  waveform: WaveformData;
  viewMode: ViewMode;
}

const COLORS = {
  aligo: "rgba(255, 255, 255, 0.35)",
  aligoFill: "rgba(255, 255, 255, 0.03)",
  signal: "#6ec6ff",
  signalGlow: "rgba(110, 198, 255, 0.15)",
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.12)",
  text: "rgba(255,255,255,0.4)",
  label: "rgba(255,255,255,0.6)",
};

/**
 * Canvas2D log-log plot showing event characteristic strain vs aLIGO sensitivity.
 * Only visible in Researcher mode.
 */
export class NoiseCurvePlot {
  readonly container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: NoiseCurvePlotOptions | null = null;
  private cachedStrain: CharacteristicStrain | null = null;
  private resizeObserver: ResizeObserver;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "noise-curve-plot";
    this.container.style.cssText =
      "display:none;margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;";

    // Title
    const title = document.createElement("div");
    title.style.cssText =
      "font-size:9px;color:rgba(255,255,255,0.4);margin-bottom:4px;font-family:-apple-system,system-ui,sans-serif;";
    title.textContent = "Characteristic Strain vs Detector Sensitivity";
    this.container.appendChild(title);

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "width:100%;height:140px;display:block;border-radius:6px;";
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.canvas);
  }

  update(options: NoiseCurvePlotOptions): void {
    this.options = options;

    // Only show in researcher mode
    const visible = options.viewMode === "researcher";
    this.container.style.display = visible ? "block" : "none";

    if (visible) {
      this.cachedStrain = computeCharacteristicStrain(options.waveform);
      this.draw();
    } else {
      this.cachedStrain = null;
    }
  }

  private draw(): void {
    if (!this.options || !this.cachedStrain) return;

    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = rect.width;
    const H = rect.height;
    const padL = 38;
    const padR = 8;
    const padT = 6;
    const padB = 22;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    // Log scale bounds
    const fMin = 10;
    const fMax = 5000;
    const logFMin = Math.log10(fMin);
    const logFMax = Math.log10(fMax);

    // Determine h_c range from data
    const aligo = getALIGOCharacteristicStrain();
    const strain = this.cachedStrain;

    let hMin = Infinity;
    let hMax = -Infinity;

    for (const h of aligo.hc) {
      if (h > 0) { hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); }
    }
    for (let k = 1; k < strain.frequencies.length; k++) {
      const f = strain.frequencies[k];
      if (f >= fMin && f <= fMax && strain.hc[k] > 0) {
        hMin = Math.min(hMin, strain.hc[k]);
        hMax = Math.max(hMax, strain.hc[k]);
      }
    }

    // Add padding to log range
    const logHMin = Math.floor(Math.log10(hMin)) - 1;
    const logHMax = Math.ceil(Math.log10(hMax)) + 1;

    const toX = (f: number) => padL + ((Math.log10(f) - logFMin) / (logFMax - logFMin)) * plotW;
    const toY = (h: number) => {
      if (h <= 0) return padT + plotH;
      return padT + (1 - (Math.log10(h) - logHMin) / (logHMax - logHMin)) * plotH;
    };

    // ─── Grid ─────────────────────────────────────
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;

    // Vertical grid (frequency decades)
    for (let logF = Math.ceil(logFMin); logF <= Math.floor(logFMax); logF++) {
      const x = toX(Math.pow(10, logF));
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }

    // Horizontal grid (strain decades)
    for (let logH = logHMin; logH <= logHMax; logH++) {
      const y = toY(Math.pow(10, logH));
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // ─── aLIGO curve ─────────────────────────────
    // Fill under curve
    ctx.fillStyle = COLORS.aligoFill;
    ctx.beginPath();
    for (let i = 0; i < aligo.frequencies.length; i++) {
      const x = toX(aligo.frequencies[i]);
      const y = toY(aligo.hc[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(toX(aligo.frequencies[aligo.frequencies.length - 1]), padT + plotH);
    ctx.lineTo(toX(aligo.frequencies[0]), padT + plotH);
    ctx.closePath();
    ctx.fill();

    // Curve line
    ctx.strokeStyle = COLORS.aligo;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < aligo.frequencies.length; i++) {
      const x = toX(aligo.frequencies[i]);
      const y = toY(aligo.hc[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // aLIGO label
    ctx.fillStyle = COLORS.text;
    ctx.font = "8px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "left";
    const labelIdx = Math.floor(aligo.frequencies.length * 0.35);
    const labelX = toX(aligo.frequencies[labelIdx]);
    const labelY = toY(aligo.hc[labelIdx]) - 5;
    ctx.fillText("aLIGO", labelX, labelY);

    // ─── Event signal ─────────────────────────────
    // Glow
    ctx.strokeStyle = COLORS.signalGlow;
    ctx.lineWidth = 4;
    ctx.beginPath();
    let started = false;
    for (let k = 1; k < strain.frequencies.length; k++) {
      const f = strain.frequencies[k];
      if (f < fMin || f > fMax || strain.hc[k] <= 0) continue;
      const x = toX(f);
      const y = toY(strain.hc[k]);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Main signal line
    ctx.strokeStyle = COLORS.signal;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    started = false;
    for (let k = 1; k < strain.frequencies.length; k++) {
      const f = strain.frequencies[k];
      if (f < fMin || f > fMax || strain.hc[k] <= 0) continue;
      const x = toX(f);
      const y = toY(strain.hc[k]);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ─── Axes labels ──────────────────────────────
    ctx.fillStyle = COLORS.text;
    ctx.font = "9px -apple-system, system-ui, sans-serif";

    // Frequency labels
    ctx.textAlign = "center";
    for (let logF = Math.ceil(logFMin); logF <= Math.floor(logFMax); logF++) {
      const f = Math.pow(10, logF);
      const x = toX(f);
      const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
      ctx.fillText(label, x, H - 3);
    }

    // "Hz" unit
    ctx.textAlign = "right";
    ctx.fillText("Hz", padL + plotW, H - 3);

    // Strain labels (left axis) — every 2 decades to avoid clutter
    ctx.textAlign = "right";
    ctx.font = "8px -apple-system, system-ui, sans-serif";
    for (let logH = logHMin; logH <= logHMax; logH += 2) {
      const y = toY(Math.pow(10, logH));
      if (y > padT + 4 && y < padT + plotH - 4) {
        ctx.fillText(`10^${logH}`, padL - 3, y + 3);
      }
    }

    // Signal label
    ctx.fillStyle = COLORS.signal;
    ctx.font = "bold 8px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("h_c(f)", padL + plotW, padT + 10);
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.container.remove();
  }
}
