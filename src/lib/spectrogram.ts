/**
 * Spectrogram manager: orchestrates Web Worker Q-transform,
 * IndexedDB caching, and canvas rendering with viridis color map.
 */

import type { StrainData } from "./strain";
import type { SpectrogramResult, SpectrogramRequest } from "./spectrogram-worker";

// ─── Types ───────────────────────────────────────────────────────────

export interface SpectrogramData extends SpectrogramResult {
  eventName: string;
  detector: string;
}

// ─── Viridis color map (256 entries) ─────────────────────────────────

const VIRIDIS_STOPS: [number, number, number][] = [
  [68, 1, 84], [72, 35, 116], [64, 67, 135], [52, 94, 141],
  [41, 120, 142], [32, 144, 140], [34, 167, 132], [68, 190, 112],
  [121, 209, 81], [189, 222, 38], [253, 231, 37],
];

function viridisRGB(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const idx = t * (VIRIDIS_STOPS.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, VIRIDIS_STOPS.length - 1);
  const f = idx - lo;
  return [
    Math.round(VIRIDIS_STOPS[lo][0] + f * (VIRIDIS_STOPS[hi][0] - VIRIDIS_STOPS[lo][0])),
    Math.round(VIRIDIS_STOPS[lo][1] + f * (VIRIDIS_STOPS[hi][1] - VIRIDIS_STOPS[lo][1])),
    Math.round(VIRIDIS_STOPS[lo][2] + f * (VIRIDIS_STOPS[hi][2] - VIRIDIS_STOPS[lo][2])),
  ];
}

// Pre-build 256-entry LUT
const VIRIDIS_LUT = new Uint8Array(256 * 3);
for (let i = 0; i < 256; i++) {
  const [r, g, b] = viridisRGB(i / 255);
  VIRIDIS_LUT[i * 3] = r;
  VIRIDIS_LUT[i * 3 + 1] = g;
  VIRIDIS_LUT[i * 3 + 2] = b;
}

// ─── IndexedDB Cache ─────────────────────────────────────────────────

const DB_NAME = "warplab-spectrogram";
const DB_VERSION = 1;
const STORE_NAME = "spectrograms";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCached(key: string): Promise<SpectrogramData | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const val = req.result;
        if (val) {
          // Reconstruct Float32Arrays from stored ArrayBuffers
          val.amplitudes = new Float32Array(val.amplitudes);
          val.freqs = new Float32Array(val.freqs);
          val.times = new Float32Array(val.times);
          resolve(val as SpectrogramData);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCache(key: string, data: SpectrogramData): Promise<void> {
  try {
    const db = await openDB();
    // Store as plain object with ArrayBuffer copies for serialization
    const serializable = {
      ...data,
      amplitudes: new Float32Array(data.amplitudes).buffer,
      freqs: new Float32Array(data.freqs).buffer,
      times: new Float32Array(data.times).buffer,
    };
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(serializable, key);
  } catch {
    // Silently fail on cache write errors
  }
}

// ─── Worker lifecycle ────────────────────────────────────────────────

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL("./spectrogram-worker.ts", import.meta.url),
      { type: "module" }
    );
  }
  return worker;
}

/**
 * Compute (or retrieve cached) spectrogram for strain data.
 */
export async function computeSpectrogram(
  strain: StrainData,
  eventName: string,
): Promise<SpectrogramData> {
  const cacheKey = `${eventName}/${strain.detector}`;

  // Check IndexedDB cache
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  // Compute via Web Worker
  const w = getWorker();

  const request: SpectrogramRequest = {
    data: strain.data,
    sampleRate: strain.sampleRate,
    freqMin: 20,
    freqMax: 1024,
    qMin: 4,
    qMax: 64,
    timeBins: 512,
  };

  const result = await new Promise<SpectrogramResult>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Spectrogram computation timed out")), 30000);
    w.onmessage = (e: MessageEvent<SpectrogramResult>) => {
      clearTimeout(timeout);
      resolve(e.data);
    };
    w.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
    // Transfer the data buffer copy to the worker
    const dataCopy = new Float32Array(strain.data);
    w.postMessage(
      { ...request, data: dataCopy },
      [dataCopy.buffer]
    );
  });

  const spectrogramData: SpectrogramData = {
    ...result,
    eventName,
    detector: strain.detector,
  };

  // Cache in IndexedDB (fire-and-forget)
  setCache(cacheKey, spectrogramData);

  return spectrogramData;
}

// ─── Canvas rendering ────────────────────────────────────────────────

// Cached base image (spectrogram + axes without cursor)
let cachedBaseImage: ImageBitmap | null = null;
let cachedDataId: string | null = null;
let cachedCanvasW = 0;
let cachedCanvasH = 0;

// Layout constants
const MARGIN_LEFT = 48;
const MARGIN_RIGHT = 40;
const MARGIN_TOP = 8;
const MARGIN_BOTTOM = 24;

/**
 * Build the base spectrogram image (without cursor) and cache it.
 */
async function buildBaseImage(
  canvas: HTMLCanvasElement,
  data: SpectrogramData,
): Promise<void> {
  const dpr = window.devicePixelRatio || 1;
  const displayW = canvas.clientWidth;
  const displayH = canvas.clientHeight;

  const offCanvas = new OffscreenCanvas(displayW * dpr, displayH * dpr);
  const ctx = offCanvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const { amplitudes, freqs, freqBins, timeBins, maxAmplitude } = data;
  const plotW = displayW - MARGIN_LEFT - MARGIN_RIGHT;
  const plotH = displayH - MARGIN_TOP - MARGIN_BOTTOM;

  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(0, 0, displayW, displayH);

  if (plotW <= 0 || plotH <= 0 || maxAmplitude === 0) return;

  // Render spectrogram pixels
  const imgData = ctx.createImageData(timeBins, freqBins);
  const pixels = imgData.data;
  for (let fi = 0; fi < freqBins; fi++) {
    const row = freqBins - 1 - fi;
    for (let tj = 0; tj < timeBins; tj++) {
      const amp = amplitudes[fi * timeBins + tj];
      const normalized = Math.log1p(amp / maxAmplitude * 100) / Math.log1p(100);
      const ci = Math.round(normalized * 255);
      const pi = (row * timeBins + tj) * 4;
      pixels[pi] = VIRIDIS_LUT[ci * 3];
      pixels[pi + 1] = VIRIDIS_LUT[ci * 3 + 1];
      pixels[pi + 2] = VIRIDIS_LUT[ci * 3 + 2];
      pixels[pi + 3] = 255;
    }
  }

  const specCanvas = new OffscreenCanvas(timeBins, freqBins);
  const specCtx = specCanvas.getContext("2d")!;
  specCtx.putImageData(imgData, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(specCanvas, MARGIN_LEFT, MARGIN_TOP, plotW, plotH);

  // Frequency axis (log scale)
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "10px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const logFreqMin = Math.log2(freqs[0]);
  const logFreqMax = Math.log2(freqs[freqBins - 1]);
  const freqTicks = [32, 64, 128, 256, 512, 1024].filter(
    (f) => f >= freqs[0] && f <= freqs[freqBins - 1]
  );
  for (const f of freqTicks) {
    const logF = Math.log2(f);
    const yNorm = 1 - (logF - logFreqMin) / (logFreqMax - logFreqMin);
    const y = MARGIN_TOP + yNorm * plotH;
    ctx.fillText(`${f}`, MARGIN_LEFT - 6, y);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, y);
    ctx.lineTo(MARGIN_LEFT + plotW, y);
    ctx.stroke();
  }

  // Axis label
  ctx.save();
  ctx.translate(10, MARGIN_TOP + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.font = "9px -apple-system, system-ui, sans-serif";
  ctx.fillText("Hz", 0, 0);
  ctx.restore();

  // Time axis
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "10px -apple-system, system-ui, sans-serif";
  const duration = data.times[timeBins - 1];
  const timeStep = duration > 16 ? 8 : duration > 8 ? 4 : 2;
  for (let t = 0; t <= duration; t += timeStep) {
    const x = MARGIN_LEFT + (t / duration) * plotW;
    ctx.fillText(`${t.toFixed(0)}s`, x, displayH - MARGIN_BOTTOM + 6);
  }

  // Color bar legend
  const barX = displayW - MARGIN_RIGHT + 10;
  const barW = 10;
  for (let i = 0; i < plotH; i++) {
    const t = 1 - i / plotH;
    const ci = Math.round(t * 255);
    ctx.fillStyle = `rgb(${VIRIDIS_LUT[ci * 3]}, ${VIRIDIS_LUT[ci * 3 + 1]}, ${VIRIDIS_LUT[ci * 3 + 2]})`;
    ctx.fillRect(barX, MARGIN_TOP + i, barW, 1);
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.font = "9px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("max", barX + barW + 3, MARGIN_TOP);
  ctx.textBaseline = "bottom";
  ctx.fillText("min", barX + barW + 3, MARGIN_TOP + plotH);

  cachedBaseImage = await createImageBitmap(offCanvas);
  cachedDataId = `${data.eventName}/${data.detector}`;
  cachedCanvasW = displayW;
  cachedCanvasH = displayH;
}

/**
 * Render spectrogram to a canvas element. Uses cached base image
 * and only redraws the playback cursor each frame.
 */
export function renderSpectrogram(
  canvas: HTMLCanvasElement,
  data: SpectrogramData,
  playbackNorm?: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const displayW = canvas.clientWidth;
  const displayH = canvas.clientHeight;

  const dataId = `${data.eventName}/${data.detector}`;

  // Rebuild base image if data or size changed
  if (!cachedBaseImage || cachedDataId !== dataId || cachedCanvasW !== displayW || cachedCanvasH !== displayH) {
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    buildBaseImage(canvas, data).then(() => {
      renderSpectrogram(canvas, data, playbackNorm);
    });
    return;
  }

  // Draw cached base image
  canvas.width = displayW * dpr;
  canvas.height = displayH * dpr;
  ctx.scale(dpr, dpr);
  ctx.drawImage(cachedBaseImage, 0, 0, displayW, displayH);

  // Draw playback cursor
  if (playbackNorm != null && playbackNorm >= 0 && playbackNorm <= 1) {
    const plotW = displayW - MARGIN_LEFT - MARGIN_RIGHT;
    const plotH = displayH - MARGIN_TOP - MARGIN_BOTTOM;
    const cursorX = MARGIN_LEFT + playbackNorm * plotW;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(cursorX, MARGIN_TOP);
    ctx.lineTo(cursorX, MARGIN_TOP + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Clean up the worker when no longer needed.
 */
export function disposeSpectrogramWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  cachedBaseImage = null;
  cachedDataId = null;
}
