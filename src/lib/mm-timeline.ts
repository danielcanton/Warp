/**
 * Canvas2D multi-messenger timeline for GW170817.
 *
 * Horizontal bar with logarithmic time scale (1 s → 16 days) showing
 * the sequence of observations. An animated cursor advances through
 * the timeline and labels appear as it passes each marker.
 *
 * HiDPI canvas support follows the VeffPlot pattern.
 */

import { getViewMode, type ViewMode } from "./view-mode";

// ─── Observation markers ────────────────────────────────────────────

export interface MMMarker {
  /** Seconds after GW trigger (t = 0) */
  time: number;
  label: string;
  /** Short label for mobile */
  shortLabel: string;
  color: string;
  /** Which tour step index (0-based within GW170817 sub-steps) highlights this */
  stepIndex: number;
}

const SECONDS = 1;
const HOURS = 3600;
const DAYS = 86400;

export const MM_MARKERS: MMMarker[] = [
  { time: 0,              label: "Gravitational waves",  shortLabel: "GW",      color: "#a78bfa", stepIndex: 0 }, // purple
  { time: 1.7 * SECONDS,  label: "Gamma-ray burst",      shortLabel: "GRB",     color: "#facc15", stepIndex: 1 }, // yellow
  { time: 11 * HOURS,     label: "Optical counterpart",  shortLabel: "Optical", color: "#60a5fa", stepIndex: 2 }, // blue
  { time: 2.5 * DAYS,     label: "Kilonova peak",        shortLabel: "KN",      color: "#60a5fa", stepIndex: 3 }, // blue
  { time: 9 * DAYS,       label: "X-ray detection",      shortLabel: "X-ray",   color: "#22d3ee", stepIndex: 4 }, // cyan
  { time: 16 * DAYS,      label: "Radio detection",      shortLabel: "Radio",   color: "#f87171", stepIndex: 5 }, // red
];

// ─── Constants ──────────────────────────────────────────────────────

const BG_COLOR = "rgba(10, 10, 30, 0.85)";
const BAR_BG = "rgba(255,255,255,0.06)";
const BAR_BORDER = "rgba(255,255,255,0.1)";
const CURSOR_COLOR = "rgba(255,255,255,0.9)";
const TEXT_DIM = "rgba(255,255,255,0.35)";
const TEXT_MED = "rgba(255,255,255,0.6)";

const BAR_HEIGHT = 6;
const MARKER_RADIUS = 5;
const LABEL_FONT = "10px system-ui, sans-serif";
const TITLE_FONT = "bold 10px system-ui, sans-serif";

// Log scale: we map time in seconds to a 0-1 fraction.
// We use log10(t + 1) so t=0 maps to 0.
const T_MIN = 0;
const T_MAX = 16 * DAYS; // ~1,382,400 s
const LOG_MAX = Math.log10(T_MAX + 1);

function timeToFrac(t: number): number {
  if (t <= 0) return 0;
  return Math.log10(t + 1) / LOG_MAX;
}

// ─── Axis tick helpers ──────────────────────────────────────────────

interface TickMark {
  time: number;
  label: string;
}

const TICKS: TickMark[] = [
  { time: 0, label: "0" },
  { time: 1, label: "1 s" },
  { time: 60, label: "1 m" },
  { time: HOURS, label: "1 hr" },
  { time: DAYS, label: "1 d" },
  { time: 7 * DAYS, label: "7 d" },
  { time: 16 * DAYS, label: "16 d" },
];

// ─── Renderer ───────────────────────────────────────────────────────

export class MMTimeline {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLDivElement;

  /** 0-based index of the currently highlighted step */
  private activeStep = 0;
  /** Animated cursor fraction (0–1) */
  private cursorFrac = 0;
  /** Target cursor fraction for the current step */
  private targetFrac = 0;
  private animating = false;
  private animStart = 0;
  private animFrom = 0;
  private animDuration = 0.8; // seconds

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "mm-timeline-container";
    this.container.style.cssText = `
      width: 100%;
      margin-top: 10px;
      border-radius: 8px;
      overflow: hidden;
      pointer-events: none;
    `;

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "width: 100%; display: block;";
    this.ctx = this.canvas.getContext("2d")!;
    this.container.appendChild(this.canvas);
  }

  /** Returns the container element to be inserted into the tour overlay */
  getElement(): HTMLDivElement {
    return this.container;
  }

  /** Set which step is active (triggers cursor animation) */
  setStep(stepIndex: number) {
    if (stepIndex === this.activeStep && this.cursorFrac > 0) return;
    const marker = MM_MARKERS.find((m) => m.stepIndex === stepIndex);
    if (!marker) return;

    this.activeStep = stepIndex;
    this.animFrom = this.cursorFrac;
    this.targetFrac = timeToFrac(marker.time);
    this.animStart = performance.now() / 1000;
    this.animating = true;
  }

  show() {
    this.container.style.display = "block";
    this.resizeCanvas();
  }

  hide() {
    this.container.style.display = "none";
  }

  private resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth || 360;
    const h = 72;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Call each frame to advance animation + redraw */
  render() {
    const w = this.container.clientWidth || 360;
    const h = 72;
    const ctx = this.ctx;

    // Resize if needed
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.resizeCanvas();
    }

    const isMobile = w < 360;
    const padL = 12;
    const padR = 12;
    const barY = 32;
    const barW = w - padL - padR;

    // Advance cursor animation
    if (this.animating) {
      const now = performance.now() / 1000;
      const elapsed = now - this.animStart;
      const t = Math.min(elapsed / this.animDuration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      this.cursorFrac = this.animFrom + (this.targetFrac - this.animFrom) * ease;
      if (t >= 1) {
        this.cursorFrac = this.targetFrac;
        this.animating = false;
      }
    }

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Title
    ctx.fillStyle = TEXT_MED;
    ctx.font = TITLE_FONT;
    ctx.textAlign = "left";
    ctx.fillText("Multi-Messenger Timeline", padL, 14);

    // Scale label
    ctx.fillStyle = TEXT_DIM;
    ctx.font = LABEL_FONT;
    ctx.textAlign = "right";
    ctx.fillText("log scale", w - padR, 14);

    // Bar background
    ctx.fillStyle = BAR_BG;
    ctx.beginPath();
    ctx.roundRect(padL, barY - BAR_HEIGHT / 2, barW, BAR_HEIGHT, BAR_HEIGHT / 2);
    ctx.fill();

    // Filled portion up to cursor
    if (this.cursorFrac > 0) {
      const filledW = Math.max(0, this.cursorFrac * barW);
      const grad = ctx.createLinearGradient(padL, 0, padL + filledW, 0);
      grad.addColorStop(0, "rgba(167, 139, 250, 0.5)");
      grad.addColorStop(1, "rgba(167, 139, 250, 0.15)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(padL, barY - BAR_HEIGHT / 2, filledW, BAR_HEIGHT, BAR_HEIGHT / 2);
      ctx.fill();
    }

    // Bar border
    ctx.strokeStyle = BAR_BORDER;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(padL, barY - BAR_HEIGHT / 2, barW, BAR_HEIGHT, BAR_HEIGHT / 2);
    ctx.stroke();

    // Markers
    const viewMode = getViewMode();
    for (const marker of MM_MARKERS) {
      const frac = timeToFrac(marker.time);
      const mx = padL + frac * barW;
      const reached = this.cursorFrac >= frac - 0.001;
      const isActive = marker.stepIndex === this.activeStep;

      // Marker dot
      const radius = isActive ? MARKER_RADIUS + 1 : MARKER_RADIUS;
      ctx.fillStyle = reached ? marker.color : "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(mx, barY, radius, 0, Math.PI * 2);
      ctx.fill();

      // Glow on active
      if (isActive && reached) {
        ctx.shadowColor = marker.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(mx, barY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Label (only show if reached or if in researcher mode)
      if (reached || viewMode === "researcher") {
        const labelText = isMobile ? marker.shortLabel : marker.label;
        ctx.fillStyle = reached ? marker.color : TEXT_DIM;
        ctx.font = isActive ? "bold 9px system-ui, sans-serif" : "9px system-ui, sans-serif";
        ctx.textAlign = "center";

        // Alternate labels above/below bar to avoid overlap
        const labelY = marker.stepIndex % 2 === 0 ? barY - 12 : barY + 18;
        ctx.fillText(labelText, mx, labelY);

        // Time annotation for researcher mode
        if (viewMode === "researcher" && reached) {
          const timeStr = formatTime(marker.time);
          ctx.fillStyle = TEXT_DIM;
          ctx.font = "8px system-ui, sans-serif";
          const timeY = marker.stepIndex % 2 === 0 ? barY - 22 : barY + 27;
          ctx.fillText(timeStr, mx, timeY);
        }
      }
    }

    // Cursor line
    if (this.cursorFrac > 0) {
      const cx = padL + this.cursorFrac * barW;
      ctx.strokeStyle = CURSOR_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, barY - 10);
      ctx.lineTo(cx, barY + 10);
      ctx.stroke();
    }

    // Tick marks along bottom
    ctx.fillStyle = TEXT_DIM;
    ctx.font = "8px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const tick of TICKS) {
      const frac = timeToFrac(tick.time);
      const tx = padL + frac * barW;
      // Small tick line
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(tx, barY + BAR_HEIGHT / 2 + 1);
      ctx.lineTo(tx, barY + BAR_HEIGHT / 2 + 4);
      ctx.stroke();

      // Only draw tick labels if they won't overlap with marker labels
      if (tick.time === 0 || tick.time === T_MAX) continue;
      ctx.fillText(tick.label, tx, h - 4);
    }
  }

  dispose() {
    this.container.remove();
  }
}

function formatTime(seconds: number): string {
  if (seconds === 0) return "t = 0";
  if (seconds < 60) return `t+${seconds.toFixed(1)}s`;
  if (seconds < HOURS) return `t+${(seconds / 60).toFixed(0)}m`;
  if (seconds < DAYS) return `t+${(seconds / HOURS).toFixed(0)}h`;
  return `t+${(seconds / DAYS).toFixed(0)}d`;
}
