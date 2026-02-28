/**
 * Strain overlay chart: renders real detector strain (blue) overlaid
 * with synthetic IMRPhenom template (orange) on a 2D canvas.
 * Includes a vertical playback cursor synced to 3D animation time.
 */

import type { StrainData } from "./strain";
import type { WaveformData } from "./waveform";

// ─── Layout constants ────────────────────────────────────────────────

const MARGIN_LEFT = 52;
const MARGIN_RIGHT = 16;
const MARGIN_TOP = 14;
const MARGIN_BOTTOM = 28;

// ─── Colors ──────────────────────────────────────────────────────────

const STRAIN_COLOR = "rgba(56, 189, 248, 0.85)";    // cyan/blue for real strain
const TEMPLATE_COLOR = "rgba(251, 191, 36, 0.85)";  // amber/orange for template
const CURSOR_COLOR = "rgba(255, 255, 255, 0.7)";
const AXIS_COLOR = "rgba(255, 255, 255, 0.35)";
const GRID_COLOR = "rgba(255, 255, 255, 0.06)";
const LABEL_COLOR = "rgba(255, 255, 255, 0.3)";
const BG_COLOR = "rgba(0, 0, 0, 0.85)";

// ─── Downsampling ────────────────────────────────────────────────────

const MAX_DISPLAY_POINTS = 2000;

/**
 * Downsample a Float32Array or number[] to at most maxPoints using
 * min/max preserving (LTTB-like) so peaks aren't lost.
 */
function downsample(
  data: Float32Array | number[],
  maxPoints: number,
): { values: number[]; indices: number[] } {
  const len = data.length;
  if (len <= maxPoints) {
    const values: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < len; i++) {
      values.push(Number(data[i]));
      indices.push(i);
    }
    return { values, indices };
  }

  const bucketSize = len / maxPoints;
  const values: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(Math.floor((i + 1) * bucketSize), len);
    let minVal = Infinity;
    let maxVal = -Infinity;
    let minIdx = start;
    let maxIdx = start;

    for (let j = start; j < end; j++) {
      const v = Number(data[j]);
      if (v < minVal) { minVal = v; minIdx = j; }
      if (v > maxVal) { maxVal = v; maxIdx = j; }
    }

    // Add in order of index to preserve time ordering
    if (minIdx <= maxIdx) {
      values.push(minVal, maxVal);
      indices.push(minIdx, maxIdx);
    } else {
      values.push(maxVal, minVal);
      indices.push(maxIdx, minIdx);
    }
  }

  return { values, indices };
}

// ─── Cached base image ───────────────────────────────────────────────

let cachedBase: ImageBitmap | null = null;
let cachedKey: string | null = null;
let cachedW = 0;
let cachedH = 0;

export interface StrainChartData {
  /** Downsampled real strain values (normalized) */
  strainValues: number[];
  /** Normalized x positions [0..1] for each strain point */
  strainXNorm: number[];
  /** Downsampled template values (normalized) */
  templateValues: number[];
  /** Normalized x positions [0..1] for each template point */
  templateXNorm: number[];
  /** Whether real strain data is available */
  hasStrain: boolean;
  /** Event name for cache key */
  eventName: string;
  /** Duration of the aligned time axis in seconds */
  duration: number;
  /** Active detector ID (e.g. "H1") for legend label */
  detector?: string;
  /** Whether the strain has been whitened */
  whitened?: boolean;
}

/**
 * Prepare chart data: align real strain and synthetic waveform on a
 * common time axis centered on merger. Downsample for display.
 */
export function prepareChartData(
  waveform: WaveformData,
  strain: StrainData | null,
  event: { commonName: string; GPS: number },
): StrainChartData {
  // Synthetic template time axis
  const templateDuration = waveform.duration;
  const mergerNorm = waveform.peakIndex / waveform.hPlus.length;

  if (!strain) {
    // No real strain — show template only
    const ds = downsample(waveform.hPlus, MAX_DISPLAY_POINTS);
    const xNorm = ds.indices.map((i) => i / (waveform.hPlus.length - 1));

    return {
      strainValues: [],
      strainXNorm: [],
      templateValues: ds.values,
      templateXNorm: xNorm,
      hasStrain: false,
      eventName: event.commonName,
      duration: templateDuration,
    };
  }

  // Align real strain and template on merger time.
  // Template merger is at mergerNorm * templateDuration (seconds from template start).
  // Strain GPS time: the merger GPS is event.GPS. Strain starts at strain.gpsStart.
  // So merger is at (event.GPS - strain.gpsStart) seconds into the strain data.

  const strainMergerSec = event.GPS - strain.gpsStart;
  const templateMergerSec = mergerNorm * templateDuration;

  // Common time window: we need to find overlapping region
  // Strain: [0, strain.duration] with merger at strainMergerSec
  // Template: [0, templateDuration] with merger at templateMergerSec
  // Align at merger = 0:
  //   Strain goes from [-strainMergerSec, strain.duration - strainMergerSec]
  //   Template goes from [-templateMergerSec, templateDuration - templateMergerSec]
  // Use the union for the display window (show all available data)

  const tMinStrain = -strainMergerSec;
  const tMaxStrain = strain.duration - strainMergerSec;
  const tMinTemplate = -templateMergerSec;
  const tMaxTemplate = templateDuration - templateMergerSec;

  const tMin = Math.min(tMinStrain, tMinTemplate);
  const tMax = Math.max(tMaxStrain, tMaxTemplate);
  const totalDuration = tMax - tMin;

  // Downsample strain
  const strainDs = downsample(strain.data, MAX_DISPLAY_POINTS);
  const strainXNorm = strainDs.indices.map((i) => {
    const tSec = (i / strain.sampleRate) - strainMergerSec; // relative to merger
    return (tSec - tMin) / totalDuration;
  });

  // Normalize strain values to [-1, 1]
  let strainMax = 0;
  for (const v of strainDs.values) {
    const abs = Math.abs(v);
    if (abs > strainMax) strainMax = abs;
  }
  const normStrain = strainMax > 0
    ? strainDs.values.map((v) => v / strainMax)
    : strainDs.values;

  // Downsample template
  const templateDs = downsample(waveform.hPlus, MAX_DISPLAY_POINTS);
  const templateXNorm = templateDs.indices.map((i) => {
    const tSec = (i / waveform.sampleRate) - templateMergerSec;
    return (tSec - tMin) / totalDuration;
  });

  // Template is already normalized to [-1, 1] from generateWaveform

  return {
    strainValues: normStrain,
    strainXNorm: strainXNorm,
    templateValues: templateDs.values,
    templateXNorm: templateXNorm,
    hasStrain: true,
    eventName: event.commonName,
    duration: totalDuration,
  };
}

/**
 * Build the cached base image with strain + template lines, axes, and legend.
 */
async function buildBaseImage(
  canvas: HTMLCanvasElement,
  data: StrainChartData,
): Promise<void> {
  const dpr = window.devicePixelRatio || 1;
  const displayW = canvas.clientWidth;
  const displayH = canvas.clientHeight;

  const off = new OffscreenCanvas(displayW * dpr, displayH * dpr);
  const ctx = off.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const plotW = displayW - MARGIN_LEFT - MARGIN_RIGHT;
  const plotH = displayH - MARGIN_TOP - MARGIN_BOTTOM;

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, displayW, displayH);

  if (plotW <= 0 || plotH <= 0) return;

  const plotCenterY = MARGIN_TOP + plotH / 2;

  // ─── Grid lines ──────────────────────────────────────────────────

  // Horizontal: 0 line
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN_LEFT, plotCenterY);
  ctx.lineTo(MARGIN_LEFT + plotW, plotCenterY);
  ctx.stroke();

  // ±0.5 lines
  for (const frac of [0.25, 0.75]) {
    const y = MARGIN_TOP + frac * plotH;
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, y);
    ctx.lineTo(MARGIN_LEFT + plotW, y);
    ctx.stroke();
  }

  // ─── Draw waveform lines ──────────────────────────────────────────

  function drawLine(
    c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    xNorm: number[],
    values: number[],
    color: string,
    lineWidth: number,
  ) {
    if (values.length === 0) return;
    c.strokeStyle = color;
    c.lineWidth = lineWidth;
    c.lineJoin = "round";
    c.beginPath();
    let started = false;
    for (let i = 0; i < values.length; i++) {
      const x = MARGIN_LEFT + xNorm[i] * plotW;
      const y = plotCenterY - values[i] * (plotH * 0.45); // scale to 90% of half-height
      if (!started) {
        c.moveTo(x, y);
        started = true;
      } else {
        c.lineTo(x, y);
      }
    }
    c.stroke();
  }

  // Draw real strain first (behind template)
  if (data.hasStrain) {
    drawLine(ctx, data.strainXNorm, data.strainValues, STRAIN_COLOR, 1);
  }
  // Draw template on top
  drawLine(ctx, data.templateXNorm, data.templateValues, TEMPLATE_COLOR, 1.5);

  // ─── Axes ──────────────────────────────────────────────────────────

  ctx.fillStyle = AXIS_COLOR;
  ctx.font = "10px -apple-system, system-ui, sans-serif";

  // Y-axis label
  ctx.save();
  ctx.translate(10, MARGIN_TOP + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = "9px -apple-system, system-ui, sans-serif";
  ctx.fillText("Strain", 0, 0);
  ctx.restore();

  // Y-axis ticks
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = AXIS_COLOR;
  ctx.font = "9px -apple-system, system-ui, sans-serif";
  for (const { label, frac } of [
    { label: "+1", frac: 0 },
    { label: "0", frac: 0.5 },
    { label: "−1", frac: 1 },
  ]) {
    const y = MARGIN_TOP + frac * plotH;
    ctx.fillText(label, MARGIN_LEFT - 6, y);
  }

  // X-axis time ticks
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = AXIS_COLOR;
  ctx.font = "10px -apple-system, system-ui, sans-serif";

  const duration = data.duration;
  // Pick a reasonable tick interval
  const tickInterval = duration > 16 ? 8 : duration > 8 ? 4 : duration > 4 ? 2 : duration > 1 ? 0.5 : 0.2;
  const numTicks = Math.floor(duration / tickInterval);
  for (let i = 0; i <= numTicks; i++) {
    const t = i * tickInterval;
    const x = MARGIN_LEFT + (t / duration) * plotW;
    if (x < MARGIN_LEFT || x > MARGIN_LEFT + plotW) continue;
    ctx.fillText(`${t.toFixed(t < 1 ? 1 : 0)}s`, x, displayH - MARGIN_BOTTOM + 6);

    // Vertical grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.beginPath();
    ctx.moveTo(x, MARGIN_TOP);
    ctx.lineTo(x, MARGIN_TOP + plotH);
    ctx.stroke();
  }

  // X-axis label
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = "9px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Time", MARGIN_LEFT + plotW / 2, displayH - 3);

  // ─── Legend ────────────────────────────────────────────────────────

  const legendX = MARGIN_LEFT + 8;
  const legendY = MARGIN_TOP + 6;
  ctx.font = "10px -apple-system, system-ui, sans-serif";

  if (data.hasStrain) {
    // Strain legend
    const detLabel = data.detector ?? "H1";
    const whiteLabel = data.whitened ? " (W)" : "";
    ctx.strokeStyle = STRAIN_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(legendX, legendY + 5);
    ctx.lineTo(legendX + 16, legendY + 5);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`Strain (${detLabel})${whiteLabel}`, legendX + 20, legendY + 5);

    // Template legend
    const templateLegendX = legendX + 120;
    ctx.strokeStyle = TEMPLATE_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(templateLegendX, legendY + 5);
    ctx.lineTo(templateLegendX + 16, legendY + 5);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillText("Template", templateLegendX + 20, legendY + 5);
  } else {
    // Template only + no-strain label
    ctx.strokeStyle = TEMPLATE_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(legendX, legendY + 5);
    ctx.lineTo(legendX + 16, legendY + 5);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Template", legendX + 20, legendY + 5);

    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.font = "9px -apple-system, system-ui, sans-serif";
    ctx.fillText("No strain data", legendX + 100, legendY + 5);
  }

  cachedBase = await createImageBitmap(off);
  cachedKey = `${data.eventName}/${data.detector ?? ""}/${data.whitened ? "w" : "r"}`;
  cachedW = displayW;
  cachedH = displayH;
}

/**
 * Render the strain chart. Uses cached base image and only redraws
 * the playback cursor each frame for performance.
 *
 * @param playbackNorm - Normalized playback position [0..1] from the waveform timeline
 * @param waveform - Current waveform data (needed to map playback time to chart x)
 */
export function renderStrainChart(
  canvas: HTMLCanvasElement,
  data: StrainChartData,
  playbackNorm?: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const displayW = canvas.clientWidth;
  const displayH = canvas.clientHeight;

  // Rebuild base if needed
  const dataKey = `${data.eventName}/${data.detector ?? ""}/${data.whitened ? "w" : "r"}`;
  if (!cachedBase || cachedKey !== dataKey || cachedW !== displayW || cachedH !== displayH) {
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    buildBaseImage(canvas, data).then(() => {
      renderStrainChart(canvas, data, playbackNorm);
    });
    return;
  }

  // Draw cached base
  canvas.width = displayW * dpr;
  canvas.height = displayH * dpr;
  ctx.scale(dpr, dpr);
  ctx.drawImage(cachedBase, 0, 0, displayW, displayH);

  // Draw playback cursor
  if (playbackNorm != null && playbackNorm >= 0 && playbackNorm <= 1) {
    const plotW = displayW - MARGIN_LEFT - MARGIN_RIGHT;
    const plotH = displayH - MARGIN_TOP - MARGIN_BOTTOM;

    // Map waveform playbackNorm to chart x position
    // The template data xNorm values map waveform indices to chart positions
    // playbackNorm maps linearly to the waveform, so we can interpolate
    const cursorChartX = interpolatePlaybackToChartX(data, playbackNorm);
    if (cursorChartX != null) {
      const x = MARGIN_LEFT + cursorChartX * plotW;
      ctx.strokeStyle = CURSOR_COLOR;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, MARGIN_TOP);
      ctx.lineTo(x, MARGIN_TOP + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/**
 * Map the waveform playback position (0..1) to the chart's x axis (0..1).
 * Since the chart may be wider than the template (if strain data extends further),
 * we need to map through the template x positions.
 */
function interpolatePlaybackToChartX(
  data: StrainChartData,
  playbackNorm: number,
): number | null {
  const { templateXNorm } = data;
  if (templateXNorm.length === 0) return null;

  // playbackNorm goes 0..1 over the template's length
  // templateXNorm[0] = chart x of first template sample
  // templateXNorm[last] = chart x of last template sample
  // Linear interpolation between first and last
  const firstX = templateXNorm[0];
  const lastX = templateXNorm[templateXNorm.length - 1];
  return firstX + playbackNorm * (lastX - firstX);
}

/**
 * Invalidate the cached base image (call on event change or resize).
 */
export function invalidateStrainChart(): void {
  cachedBase = null;
  cachedKey = null;
}
