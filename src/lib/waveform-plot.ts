// ─── Waveform Plot with QNM Annotations ─────────────────────────────
// Renders an h+(t) waveform on a 2D canvas, with optional QNM mode
// overlays and damping time annotations in Researcher mode.

import type { WaveformData } from "./waveform";
import type { QNMMode } from "./qnm";
import type { ViewMode } from "./view-mode";

export interface WaveformPlotOptions {
  waveform: WaveformData;
  qnmModes: QNMMode[];
  viewMode: ViewMode;
}

const COLORS = {
  waveform: "#6ec6ff",
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.15)",
  text: "rgba(255,255,255,0.5)",
  fundamental: "#6ec6ff",
  overtone: "#ff9e64",
  annotation: "rgba(255,255,255,0.7)",
  cursor: "#ffffff",
};

/**
 * Create and manage a waveform plot canvas element.
 * Append the returned container to your DOM.
 */
export class WaveformPlot {
  readonly container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: WaveformPlotOptions | null = null;
  private cursorNorm = -1; // normalized playback position [0,1], -1 = hidden
  private resizeObserver: ResizeObserver;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "waveform-plot";
    this.container.style.cssText =
      "display:none;margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;";

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "width:100%;height:100px;display:block;border-radius:6px;";
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.canvas);
  }

  update(options: WaveformPlotOptions): void {
    this.options = options;

    // Only show in student + researcher modes
    const visible = options.viewMode !== "explorer";
    this.container.style.display = visible ? "block" : "none";

    if (visible) this.draw();
  }

  /** Update the playback cursor position. Called each frame from the scene update loop. */
  setCursorTime(normalizedTime: number): void {
    this.cursorNorm = normalizedTime;
    if (this.options && this.options.viewMode !== "explorer") {
      this.draw();
    }
  }

  private draw(): void {
    if (!this.options) return;

    const { waveform, qnmModes, viewMode } = this.options;
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
    const padL = 4;
    const padR = 4;
    const padT = 14;
    const padB = 18;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // Zero axis
    const zeroY = padT + plotH / 2;
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(padL + plotW, zeroY);
    ctx.stroke();

    const hPlus = waveform.hPlus;
    const N = hPlus.length;
    if (N === 0) return;

    // Find peak for scaling
    let maxVal = 0;
    for (let i = 0; i < N; i++) {
      const abs = Math.abs(hPlus[i]);
      if (abs > maxVal) maxVal = abs;
    }
    if (maxVal === 0) maxVal = 1;

    // Draw main waveform
    ctx.strokeStyle = COLORS.waveform;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = padL + (i / (N - 1)) * plotW;
      const y = zeroY - (hPlus[i] / maxVal) * (plotH / 2) * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Mark merger time
    const mergerX = padL + (waveform.peakIndex / (N - 1)) * plotW;
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(mergerX, padT);
    ctx.lineTo(mergerX, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Time labels
    ctx.fillStyle = COLORS.text;
    ctx.font = "9px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("0", padL, H - 2);
    ctx.textAlign = "right";
    ctx.fillText(`${waveform.duration.toFixed(1)}s`, W - padR, H - 2);
    ctx.textAlign = "center";
    ctx.fillText("merger", mergerX, H - 2);

    // ─── Researcher mode: QNM overlays ──────────────────────────
    if (viewMode === "researcher" && qnmModes.length > 0) {
      this.drawQNMOverlays(qnmModes, waveform, plotW, plotH, padL, padT, zeroY, maxVal, N);
    }

    // ─── Playback cursor ──────────────────────────────────────
    if (this.cursorNorm >= 0 && this.cursorNorm <= 1) {
      const cursorX = padL + this.cursorNorm * plotW;
      ctx.strokeStyle = COLORS.cursor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(cursorX, padT);
      ctx.lineTo(cursorX, padT + plotH);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawQNMOverlays(
    modes: QNMMode[],
    waveform: WaveformData,
    plotW: number,
    plotH: number,
    padL: number,
    padT: number,
    zeroY: number,
    maxVal: number,
    N: number,
  ): void {
    const ctx = this.ctx;
    const mergerSample = waveform.peakIndex;
    const dt = 1 / waveform.sampleRate;
    const postMergerSamples = N - mergerSample;

    const modeColors = [COLORS.fundamental, COLORS.overtone];

    for (let mi = 0; mi < modes.length; mi++) {
      const mode = modes[mi];
      const color = modeColors[mi] ?? COLORS.overtone;

      // Draw damped sinusoid from merger onwards
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();

      // Scale: match waveform amplitude at merger
      const mergerAmp = Math.abs(waveform.hPlus[mergerSample]);
      const ampScale = mergerAmp / maxVal;
      // Overtone starts at smaller amplitude
      const modeAmpFactor = mi === 0 ? ampScale : ampScale * 0.4;

      for (let j = 0; j < postMergerSamples; j++) {
        const tPost = j * dt;
        const envelope = Math.exp(-tPost / mode.dampingTime);
        const val = modeAmpFactor * envelope * Math.cos(2 * Math.PI * mode.frequency * tPost);
        const sampleIdx = mergerSample + j;
        const x = padL + (sampleIdx / (N - 1)) * plotW;
        const y = zeroY - val * (plotH / 2) * 0.9;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Damping time annotation — draw a small bracket/arrow showing τ
      const tauSamples = Math.min(
        Math.floor(mode.dampingTime * waveform.sampleRate),
        postMergerSamples - 1,
      );
      if (tauSamples > 2) {
        const tauEndIdx = mergerSample + tauSamples;
        const xStart = padL + (mergerSample / (N - 1)) * plotW;
        const xEnd = padL + (tauEndIdx / (N - 1)) * plotW;
        const annotY = padT + 6 + mi * 12;

        // Horizontal line
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xStart, annotY);
        ctx.lineTo(xEnd, annotY);
        ctx.stroke();

        // End ticks
        ctx.beginPath();
        ctx.moveTo(xStart, annotY - 3);
        ctx.lineTo(xStart, annotY + 3);
        ctx.moveTo(xEnd, annotY - 3);
        ctx.lineTo(xEnd, annotY + 3);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Label
        ctx.fillStyle = color;
        ctx.font = "bold 8px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "left";
        const tauMs = mode.dampingTime * 1000;
        const tauLabel = tauMs >= 1 ? `τ=${tauMs.toFixed(1)}ms` : `τ=${(tauMs * 1000).toFixed(0)}μs`;
        ctx.fillText(`${mode.label} ${tauLabel}`, xEnd + 4, annotY + 3);
      }
    }

    // Legend
    this.drawLegend(modes, modeColors, plotW, padL, padT, plotH);
  }

  private drawLegend(
    modes: QNMMode[],
    colors: string[],
    plotW: number,
    padL: number,
    padT: number,
    plotH: number,
  ): void {
    const ctx = this.ctx;
    const legendX = padL + plotW - 4;
    const legendY = padT + plotH - 4;

    ctx.textAlign = "right";
    ctx.font = "8px -apple-system, system-ui, sans-serif";

    for (let i = modes.length - 1; i >= 0; i--) {
      const mode = modes[i];
      const color = colors[i] ?? COLORS.overtone;
      const y = legendY - (modes.length - 1 - i) * 11;

      // Frequency label
      const fLabel = mode.frequency >= 1000
        ? `${(mode.frequency / 1000).toFixed(2)} kHz`
        : `${mode.frequency.toFixed(0)} Hz`;

      ctx.fillStyle = color;
      ctx.fillText(`${mode.label} f=${fLabel}`, legendX, y);
    }
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.container.remove();
  }
}
