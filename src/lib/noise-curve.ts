// ─── Noise Curve ────────────────────────────────────────────────────────
// Re-exports core computation and provides browser-only Canvas2D plot.

// Re-export core computation
export type { CharacteristicStrain } from "../core/types";
export {
  computeCharacteristicStrain,
  computeOptimalSNR,
  getALIGOCharacteristicStrain,
  interpolateALIGO_ASD,
} from "../core/noise-curve";

import type { WaveformData } from "./waveform";
import type { ViewMode } from "./view-mode";
import type { CharacteristicStrain } from "../core/types";
import {
  computeCharacteristicStrain,
  computeOptimalSNR,
  getALIGOCharacteristicStrain,
  interpolateALIGO_ASD,
} from "../core/noise-curve";

// ─── Noise Curve Plot (Browser-only) ────────────────────────────────────

export interface NoiseCurvePlotOptions {
  waveform: WaveformData;
  viewMode: ViewMode;
  catalogSNR?: number;
}

const COLORS = {
  aligo: "rgba(255, 255, 255, 0.35)",
  aligoFill: "rgba(255, 255, 255, 0.03)",
  signal: "#6ec6ff",
  signalGlow: "rgba(110, 198, 255, 0.15)",
  snrShading: "rgba(110, 198, 255, 0.08)",
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
  private computedSNR: number | null = null;
  private resizeObserver: ResizeObserver;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "noise-curve-plot";
    this.container.style.cssText =
      "display:none;margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;";

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

    const visible = options.viewMode === "researcher";
    this.container.style.display = visible ? "block" : "none";

    if (visible) {
      this.cachedStrain = computeCharacteristicStrain(options.waveform);
      this.computedSNR = computeOptimalSNR(this.cachedStrain);
      this.draw();
    } else {
      this.cachedStrain = null;
      this.computedSNR = null;
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

    const fMin = 10;
    const fMax = 5000;
    const logFMin = Math.log10(fMin);
    const logFMax = Math.log10(fMax);

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

    const logHMin = Math.floor(Math.log10(hMin)) - 1;
    const logHMax = Math.ceil(Math.log10(hMax)) + 1;

    const toX = (f: number) => padL + ((Math.log10(f) - logFMin) / (logFMax - logFMin)) * plotW;
    const toY = (h: number) => {
      if (h <= 0) return padT + plotH;
      return padT + (1 - (Math.log10(h) - logHMin) / (logHMax - logHMin)) * plotH;
    };

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let logF = Math.ceil(logFMin); logF <= Math.floor(logFMax); logF++) {
      const x = toX(Math.pow(10, logF));
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }
    for (let logH = logHMin; logH <= logHMax; logH++) {
      const y = toY(Math.pow(10, logH));
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }

    // aLIGO fill
    ctx.fillStyle = COLORS.aligoFill;
    ctx.beginPath();
    for (let i = 0; i < aligo.frequencies.length; i++) {
      const x = toX(aligo.frequencies[i]);
      const y = toY(aligo.hc[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineTo(toX(aligo.frequencies[aligo.frequencies.length - 1]), padT + plotH);
    ctx.lineTo(toX(aligo.frequencies[0]), padT + plotH);
    ctx.closePath();
    ctx.fill();

    // aLIGO line
    ctx.strokeStyle = COLORS.aligo;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < aligo.frequencies.length; i++) {
      const x = toX(aligo.frequencies[i]);
      const y = toY(aligo.hc[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // aLIGO label
    ctx.fillStyle = COLORS.text;
    ctx.font = "8px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "left";
    const labelIdx = Math.floor(aligo.frequencies.length * 0.35);
    ctx.fillText("aLIGO", toX(aligo.frequencies[labelIdx]), toY(aligo.hc[labelIdx]) - 5);

    // SNR shading
    ctx.fillStyle = COLORS.snrShading;
    const shadingTop: { x: number; y: number }[] = [];
    const shadingBot: { x: number; y: number }[] = [];
    for (let k = 1; k < strain.frequencies.length; k++) {
      const f = strain.frequencies[k];
      if (f < fMin || f > fMax || strain.hc[k] <= 0) continue;
      const aligoAsd = interpolateALIGO_ASD(f);
      const aligoHc = Math.sqrt(f) * aligoAsd;
      if (strain.hc[k] > aligoHc) {
        const x = toX(f);
        shadingTop.push({ x, y: toY(strain.hc[k]) });
        shadingBot.push({ x, y: toY(aligoHc) });
      }
    }
    if (shadingTop.length > 1) {
      ctx.beginPath();
      ctx.moveTo(shadingTop[0].x, shadingTop[0].y);
      for (let i = 1; i < shadingTop.length; i++) ctx.lineTo(shadingTop[i].x, shadingTop[i].y);
      for (let i = shadingBot.length - 1; i >= 0; i--) ctx.lineTo(shadingBot[i].x, shadingBot[i].y);
      ctx.closePath();
      ctx.fill();
    }

    // Signal glow
    ctx.strokeStyle = COLORS.signalGlow;
    ctx.lineWidth = 4;
    ctx.beginPath();
    let started = false;
    for (let k = 1; k < strain.frequencies.length; k++) {
      const f = strain.frequencies[k];
      if (f < fMin || f > fMax || strain.hc[k] <= 0) continue;
      const x = toX(f); const y = toY(strain.hc[k]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Signal line
    ctx.strokeStyle = COLORS.signal;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    started = false;
    for (let k = 1; k < strain.frequencies.length; k++) {
      const f = strain.frequencies[k];
      if (f < fMin || f > fMax || strain.hc[k] <= 0) continue;
      const x = toX(f); const y = toY(strain.hc[k]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Axes labels
    ctx.fillStyle = COLORS.text;
    ctx.font = "9px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let logF = Math.ceil(logFMin); logF <= Math.floor(logFMax); logF++) {
      const f = Math.pow(10, logF);
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, toX(f), H - 3);
    }
    ctx.textAlign = "right";
    ctx.fillText("Hz", padL + plotW, H - 3);

    ctx.font = "8px -apple-system, system-ui, sans-serif";
    for (let logH = logHMin; logH <= logHMax; logH += 2) {
      const y = toY(Math.pow(10, logH));
      if (y > padT + 4 && y < padT + plotH - 4) ctx.fillText(`10^${logH}`, padL - 3, y + 3);
    }

    ctx.fillStyle = COLORS.signal;
    ctx.font = "bold 8px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("h_c(f)", padL + plotW, padT + 10);

    // SNR annotations
    const snrY = padT + 22;
    ctx.font = "8px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "right";
    if (this.computedSNR !== null) {
      ctx.fillStyle = COLORS.signal;
      ctx.fillText(`SNR (computed): ${this.computedSNR.toFixed(1)}`, padL + plotW, snrY);
    }
    if (this.options?.catalogSNR != null) {
      ctx.fillStyle = COLORS.text;
      ctx.fillText(`SNR (catalog): ${this.options.catalogSNR.toFixed(1)}`, padL + plotW, snrY + 11);
    }
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.container.remove();
  }
}
