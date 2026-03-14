/**
 * Canvas2D sky localization narrowing diagram for GW170817.
 *
 * Shows three nested regions drawn sequentially:
 *   1. LIGO-only: large ellipse (190 deg²)
 *   2. LIGO+Virgo: smaller ellipse (28 deg²)
 *   3. Optical pinpoint: dot labeled "NGC 4993"
 *
 * Regions animate in as the tour advances through GW170817 steps.
 * Color gradient from large (faint) to small (bright).
 *
 * HiDPI canvas support follows the VeffPlot / MMTimeline pattern.
 */

import { getViewMode } from "./view-mode";

// ─── Sky region data ─────────────────────────────────────────────────

interface SkyRegion {
  label: string;
  areaDeg2: number;
  /** Relative semi-major axis (fraction of canvas width) */
  rx: number;
  /** Relative semi-minor axis (fraction of canvas height) */
  ry: number;
  color: string;
  /** Fill opacity when fully visible */
  fillAlpha: number;
  /** Stroke opacity */
  strokeAlpha: number;
  /** Which mm-timeline stepIndex triggers this region */
  stepIndex: number;
}

const SKY_REGIONS: SkyRegion[] = [
  {
    label: "190 deg²",
    areaDeg2: 190,
    rx: 0.42,
    ry: 0.38,
    color: "#a78bfa", // purple — LIGO-only
    fillAlpha: 0.08,
    strokeAlpha: 0.5,
    stepIndex: 0,
  },
  {
    label: "28 deg²",
    areaDeg2: 28,
    rx: 0.16,
    ry: 0.14,
    color: "#60a5fa", // blue — LIGO+Virgo
    fillAlpha: 0.12,
    strokeAlpha: 0.7,
    stepIndex: 0,
  },
  {
    label: "NGC 4993",
    areaDeg2: 0,
    rx: 0,
    ry: 0,
    color: "#facc15", // yellow — Optical pinpoint
    fillAlpha: 1,
    strokeAlpha: 1,
    stepIndex: 2,
  },
];

// ─── Constants ───────────────────────────────────────────────────────

const TEXT_DIM = "rgba(255,255,255,0.35)";
const TEXT_MED = "rgba(255,255,255,0.6)";
const TITLE_FONT = "bold 10px system-ui, sans-serif";
const LABEL_FONT = "9px system-ui, sans-serif";
const ANIM_DURATION = 0.6; // seconds per region reveal

// ─── Renderer ────────────────────────────────────────────────────────

export class MMSkymap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLDivElement;

  /** Number of regions currently revealed (0–3) */
  private revealedCount = 0;
  /** Animation progress for the currently-revealing region (0–1) */
  private revealProgress = 1;
  private animStart = 0;
  private animating = false;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "mm-skymap-container";
    this.container.style.cssText = `
      width: 100%;
      margin-top: 6px;
      border-radius: 8px;
      overflow: hidden;
      pointer-events: none;
    `;

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "width: 100%; display: block;";
    this.ctx = this.canvas.getContext("2d")!;
    this.container.appendChild(this.canvas);
  }

  getElement(): HTMLDivElement {
    return this.container;
  }

  /**
   * Set how many regions to reveal (1 = LIGO-only, 2 = +Virgo, 3 = +Optical).
   * Triggers animation for the newly revealed region.
   */
  setRevealCount(count: number) {
    const clamped = Math.max(0, Math.min(3, count));
    if (clamped === this.revealedCount && this.revealProgress >= 1) return;
    if (clamped > this.revealedCount) {
      this.revealedCount = clamped;
      this.revealProgress = 0;
      this.animStart = performance.now() / 1000;
      this.animating = true;
    } else if (clamped < this.revealedCount) {
      // Going backwards — snap immediately
      this.revealedCount = clamped;
      this.revealProgress = 1;
      this.animating = false;
    }
  }

  show() {
    this.container.style.display = "block";
    this.resizeCanvas();
  }

  hide() {
    this.container.style.display = "none";
  }

  reset() {
    this.revealedCount = 0;
    this.revealProgress = 1;
    this.animating = false;
  }

  private resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth || 360;
    const h = 110;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render() {
    const w = this.container.clientWidth || 360;
    const h = 110;
    const ctx = this.ctx;

    // Resize if needed
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.resizeCanvas();
    }

    // Advance animation
    if (this.animating) {
      const now = performance.now() / 1000;
      const elapsed = now - this.animStart;
      const t = Math.min(elapsed / ANIM_DURATION, 1);
      this.revealProgress = 1 - Math.pow(1 - t, 3); // ease-out cubic
      if (t >= 1) {
        this.revealProgress = 1;
        this.animating = false;
      }
    }

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Title
    ctx.fillStyle = TEXT_MED;
    ctx.font = TITLE_FONT;
    ctx.textAlign = "left";
    ctx.fillText("Sky Localization", 12, 14);

    // Researcher annotation
    const viewMode = getViewMode();
    if (viewMode === "researcher") {
      ctx.fillStyle = TEXT_DIM;
      ctx.font = "8px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("schematic, not to scale", w - 12, 14);
    }

    // Center of the sky oval
    const cx = w / 2;
    const cy = 60;

    // Draw schematic sky oval background
    const skyRx = w * 0.44;
    const skyRy = 36;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, skyRx, skyRy, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Grid lines on sky oval
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(cx - skyRx, cy);
    ctx.lineTo(cx + skyRx, cy);
    ctx.stroke();
    // Vertical
    ctx.beginPath();
    ctx.moveTo(cx, cy - skyRy);
    ctx.lineTo(cx, cy + skyRy);
    ctx.stroke();

    if (this.revealedCount === 0) return;

    // Draw revealed regions (outermost first)
    for (let i = 0; i < Math.min(this.revealedCount, SKY_REGIONS.length); i++) {
      const region = SKY_REGIONS[i];
      const isRevealing = i === this.revealedCount - 1;
      const progress = isRevealing ? this.revealProgress : 1;

      if (region.areaDeg2 > 0) {
        // Ellipse region
        const rx = w * region.rx * progress;
        const ry = h * region.ry * progress;
        const alpha = progress;

        // Fill
        ctx.fillStyle = this.colorWithAlpha(region.color, region.fillAlpha * alpha);
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        ctx.fill();

        // Stroke
        ctx.strokeStyle = this.colorWithAlpha(region.color, region.strokeAlpha * alpha);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        if (progress > 0.5) {
          const labelAlpha = (progress - 0.5) * 2; // fade in second half
          ctx.fillStyle = this.colorWithAlpha(region.color, labelAlpha * 0.9);
          ctx.font = LABEL_FONT;
          ctx.textAlign = "left";
          // Position label outside the ellipse
          const labelX = cx + rx + 6;
          const labelY = i === 0 ? cy - 4 : cy + 4;
          ctx.fillText(region.label, Math.min(labelX, w - 50), labelY);
        }
      } else {
        // Pinpoint dot (NGC 4993)
        const dotRadius = 3 * progress;
        const alpha = progress;

        // Glow
        ctx.shadowColor = region.color;
        ctx.shadowBlur = 12 * progress;
        ctx.fillStyle = this.colorWithAlpha(region.color, alpha);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(dotRadius, 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Cross-hair
        if (progress > 0.3) {
          const crossAlpha = (progress - 0.3) * (1 / 0.7);
          const crossLen = 8;
          ctx.strokeStyle = this.colorWithAlpha(region.color, crossAlpha * 0.6);
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(cx - crossLen, cy);
          ctx.lineTo(cx + crossLen, cy);
          ctx.moveTo(cx, cy - crossLen);
          ctx.lineTo(cx, cy + crossLen);
          ctx.stroke();
        }

        // Label
        if (progress > 0.5) {
          const labelAlpha = (progress - 0.5) * 2;
          ctx.fillStyle = this.colorWithAlpha(region.color, labelAlpha);
          ctx.font = "bold 10px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(region.label, cx, cy + 20);
        }
      }
    }

    // Legend at bottom
    const legendY = h - 6;
    ctx.font = "8px system-ui, sans-serif";
    ctx.textAlign = "center";
    const legends = [
      { color: "#a78bfa", label: "LIGO-only", show: this.revealedCount >= 1 },
      { color: "#60a5fa", label: "LIGO+Virgo", show: this.revealedCount >= 2 },
      { color: "#facc15", label: "Optical", show: this.revealedCount >= 3 },
    ];
    const visibleLegends = legends.filter((l) => l.show);
    const legendSpacing = Math.min(80, (w - 24) / visibleLegends.length);
    const legendStartX = cx - ((visibleLegends.length - 1) * legendSpacing) / 2;

    visibleLegends.forEach((leg, i) => {
      const lx = legendStartX + i * legendSpacing;
      // Dot
      ctx.fillStyle = leg.color;
      ctx.beginPath();
      ctx.arc(lx - 16, legendY - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      // Text
      ctx.fillStyle = TEXT_DIM;
      ctx.textAlign = "left";
      ctx.fillText(leg.label, lx - 11, legendY);
    });
  }

  private colorWithAlpha(hex: string, alpha: number): string {
    // Convert hex (#rrggbb) to rgba
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  dispose() {
    this.container.remove();
  }
}
