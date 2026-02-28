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

// ─── Pre-computed spectrogram loader ─────────────────────────────────

interface PrecomputedManifestEntry {
  freqBins: number;
  timeBins: number;
  freqMin: number;
  freqMax: number;
  qMin: number;
  qMax: number;
  maxAmplitude: number;
}

let precomputedManifest: Record<string, PrecomputedManifestEntry> | null = null;
let precomputedUnavailable = false;

async function getPrecomputedManifest(): Promise<Record<string, PrecomputedManifestEntry>> {
  if (precomputedUnavailable) return {};
  if (precomputedManifest) return precomputedManifest;
  try {
    const res = await fetch("/spectrogram/manifest.json");
    if (!res.ok) { precomputedUnavailable = true; return {}; }
    precomputedManifest = await res.json();
    return precomputedManifest!;
  } catch {
    precomputedUnavailable = true;
    return {};
  }
}

async function loadPrecomputed(eventName: string, detector: string): Promise<SpectrogramData | null> {
  const manifest = await getPrecomputedManifest();
  const key = `${eventName}/${detector}`;
  const entry = manifest[key];
  if (!entry) return null;

  try {
    const res = await fetch(`/spectrogram/${eventName}/${detector}.bin`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const all = new Float32Array(buf);

    const ampLen = entry.freqBins * entry.timeBins;
    const freqLen = entry.freqBins;
    const timeLen = entry.timeBins;

    return {
      amplitudes: all.slice(0, ampLen),
      freqs: all.slice(ampLen, ampLen + freqLen),
      times: all.slice(ampLen + freqLen, ampLen + freqLen + timeLen),
      freqBins: entry.freqBins,
      timeBins: entry.timeBins,
      maxAmplitude: entry.maxAmplitude,
      eventName,
      detector,
    };
  } catch {
    return null;
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
 * Load (or compute) spectrogram for strain data.
 * Priority: pre-computed static file → IndexedDB cache → Web Worker.
 */
export async function computeSpectrogram(
  strain: StrainData,
  eventName: string,
): Promise<SpectrogramData> {
  const cacheKey = `${eventName}/${strain.detector}`;

  // 1. Try pre-computed static file (instant, no computation)
  const precomputed = await loadPrecomputed(eventName, strain.detector);
  if (precomputed) return precomputed;

  // 2. Check IndexedDB cache
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  // 3. Fall back to Web Worker computation
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

  // Compute visible time bin range based on zoom/pan
  const visStartFrac = panOffset;
  const visEndFrac = panOffset + 1 / zoomLevel;
  const visStartBin = Math.floor(visStartFrac * timeBins);
  const visEndBin = Math.min(timeBins, Math.ceil(visEndFrac * timeBins));
  const visBins = visEndBin - visStartBin;

  // Render spectrogram pixels (only visible time range)
  const imgData = ctx.createImageData(visBins, freqBins);
  const pixels = imgData.data;
  for (let fi = 0; fi < freqBins; fi++) {
    const row = freqBins - 1 - fi;
    for (let vj = 0; vj < visBins; vj++) {
      const tj = visStartBin + vj;
      const amp = amplitudes[fi * timeBins + tj];
      const normalized = Math.log1p(amp / maxAmplitude * 100) / Math.log1p(100);
      const ci = Math.round(normalized * 255);
      const pi = (row * visBins + vj) * 4;
      pixels[pi] = VIRIDIS_LUT[ci * 3];
      pixels[pi + 1] = VIRIDIS_LUT[ci * 3 + 1];
      pixels[pi + 2] = VIRIDIS_LUT[ci * 3 + 2];
      pixels[pi + 3] = 255;
    }
  }

  const specCanvas = new OffscreenCanvas(visBins, freqBins);
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

  // Time axis (adjusted for zoom/pan)
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "10px -apple-system, system-ui, sans-serif";
  const duration = data.times[timeBins - 1];
  const visStartTime = visStartFrac * duration;
  const visEndTime = visEndFrac * duration;
  const visDuration = visEndTime - visStartTime;
  const timeStep = visDuration > 16 ? 8 : visDuration > 8 ? 4 : visDuration > 4 ? 2 : visDuration > 1 ? 0.5 : 0.2;
  // Start from a tick-aligned time
  const firstTick = Math.ceil(visStartTime / timeStep) * timeStep;
  for (let t = firstTick; t <= visEndTime; t += timeStep) {
    const xFrac = (t - visStartTime) / visDuration;
    const x = MARGIN_LEFT + xFrac * plotW;
    ctx.fillText(`${t.toFixed(t < 1 || timeStep < 1 ? 1 : 0)}s`, x, displayH - MARGIN_BOTTOM + 6);
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
  cachedDataId = `${data.eventName}/${data.detector}/${zoomLevel.toFixed(3)}/${panOffset.toFixed(4)}`;
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

  const dataId = `${data.eventName}/${data.detector}/${zoomLevel.toFixed(3)}/${panOffset.toFixed(4)}`;

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

  // Draw playback cursor (adjusted for zoom/pan)
  if (playbackNorm != null && playbackNorm >= 0 && playbackNorm <= 1) {
    const plotW = displayW - MARGIN_LEFT - MARGIN_RIGHT;
    const plotH = displayH - MARGIN_TOP - MARGIN_BOTTOM;
    // Map playbackNorm [0..1] through zoom/pan viewport
    const visStart = panOffset;
    const visWidth = 1 / zoomLevel;
    const cursorInView = (playbackNorm - visStart) / visWidth;
    if (cursorInView >= 0 && cursorInView <= 1) {
      const cursorX = MARGIN_LEFT + cursorInView * plotW;
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
}

// ─── Zoom / Pan state (Researcher mode) ──────────────────────────────

/** Current zoom level (1 = full view, >1 = zoomed in) */
let zoomLevel = 1;
/** Pan offset as fraction of total width [0..1] — left edge of viewport */
let panOffset = 0;

/**
 * Get current zoom/pan view state.
 */
export function getSpectrogramView(): { zoom: number; pan: number } {
  return { zoom: zoomLevel, pan: panOffset };
}

/**
 * Reset zoom/pan to defaults.
 */
export function resetSpectrogramView(): void {
  zoomLevel = 1;
  panOffset = 0;
  // Invalidate cached image so it's redrawn at new zoom
  cachedBaseImage = null;
  cachedDataId = null;
}

/**
 * Apply zoom delta (positive = zoom in, negative = zoom out).
 * Zooms toward the given normalized x position within the plot area.
 */
export function zoomSpectrogram(delta: number, anchorNorm: number): void {
  const oldZoom = zoomLevel;
  zoomLevel = Math.max(1, Math.min(16, zoomLevel * (1 + delta)));

  // Adjust pan to keep the anchor point stable
  const anchorInData = panOffset + anchorNorm / oldZoom;
  panOffset = anchorInData - anchorNorm / zoomLevel;

  // Clamp pan
  const maxPan = 1 - 1 / zoomLevel;
  panOffset = Math.max(0, Math.min(maxPan, panOffset));

  // Invalidate cache
  cachedBaseImage = null;
  cachedDataId = null;
}

/**
 * Pan by a delta in normalized coordinates.
 */
export function panSpectrogram(deltaNorm: number): void {
  panOffset += deltaNorm;
  const maxPan = 1 - 1 / zoomLevel;
  panOffset = Math.max(0, Math.min(maxPan, panOffset));

  // Invalidate cache
  cachedBaseImage = null;
  cachedDataId = null;
}

/**
 * Install mouse wheel + drag handlers on a spectrogram canvas for zoom/pan.
 * Returns a cleanup function to remove listeners.
 */
export function installSpectrogramZoomPan(canvas: HTMLCanvasElement): () => void {
  let dragging = false;
  let lastX = 0;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const plotW = rect.width - MARGIN_LEFT - MARGIN_RIGHT;
    const anchorNorm = Math.max(0, Math.min(1, (x - MARGIN_LEFT) / plotW));
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    zoomSpectrogram(delta, anchorNorm);
  };

  const onMouseDown = (e: MouseEvent) => {
    if (zoomLevel <= 1) return;
    dragging = true;
    lastX = e.clientX;
    canvas.style.cursor = "grabbing";
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const plotW = rect.width - MARGIN_LEFT - MARGIN_RIGHT;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    // Convert pixel drag to normalized pan delta
    panSpectrogram(-dx / plotW / zoomLevel);
  };

  const onMouseUp = () => {
    dragging = false;
    canvas.style.cursor = zoomLevel > 1 ? "grab" : "";
  };

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  return () => {
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };
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
  resetSpectrogramView();
}
