/**
 * Canvas2D interactive Penrose (conformal) diagram for Schwarzschild spacetime.
 *
 * Draws the maximally extended Schwarzschild Penrose diagram with:
 * - Diamond boundary (i^0, I^+/I^-, i^+/i^-)
 * - Event horizon at 45° diagonals dividing 4 regions
 * - Singularities (r=0) as wavy lines at top/bottom
 * - Region labels I–IV and infinity labels
 * - Constant-r and constant-t coordinate grid lines
 * - Click-to-place worldlines with 45° light cones
 * - Causal constraints: Region II worldlines terminate at singularity
 */

// ── Colors ──────────────────────────────────────────────────────────
const BG_COLOR = "rgba(5, 5, 20, 0.92)";
const BORDER_COLOR = "rgba(255,255,255,0.5)";
const HORIZON_COLOR = "#818cf8"; // indigo-400
const SINGULARITY_COLOR = "#f87171"; // red-400
const GRID_COLOR = "rgba(255,255,255,0.06)";
const LABEL_COLOR = "rgba(255,255,255,0.5)";
const REGION_LABEL_COLOR = "rgba(255,255,255,0.15)";
const LIGHTCONE_COLOR = "rgba(251, 191, 36, 0.4)"; // amber-400 semi
const WORLDLINE_COLORS = [
  "#22d3ee", // cyan
  "#a78bfa", // violet
  "#34d399", // emerald
  "#fb923c", // orange
  "#f472b6", // pink
  "#facc15", // yellow
];
const WORLDLINE_WIDTH = 2.5;
const HORIZON_CROSS_COLOR = "#fbbf24"; // amber-400

// ── Types ───────────────────────────────────────────────────────────

interface Worldline {
  /** Points in diagram coordinates (0–1 range within diamond) */
  points: { x: number; y: number }[];
  color: string;
  crossedHorizon: boolean;
  /** Which region the starting point is in */
  region: number;
}

// ── Diagram coordinate helpers ──────────────────────────────────────

/** Map diagram coords (u,v) in [-1,1] to canvas pixel coords */
function toCanvas(
  u: number,
  v: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): { x: number; y: number } {
  return { x: cx + u * halfW, y: cy - v * halfH };
}

/** Map canvas pixel coords back to diagram coords (u,v) in [-1,1] */
function fromCanvas(
  px: number,
  py: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): { u: number; v: number } {
  return { u: (px - cx) / halfW, v: -(py - cy) / halfH };
}

/** Check if (u,v) is inside the diamond |u|+|v| <= 1 */
function insideDiamond(u: number, v: number): boolean {
  return Math.abs(u) + Math.abs(v) <= 1.0;
}

/** Determine which region a point (u,v) is in:
 *  I:   right (u>0, |v|<u)  — exterior
 *  II:  top (v>0, |u|<v)    — BH interior (future)
 *  III: bottom (v<0, |u|<-v) — white hole (past)
 *  IV:  left (u<0, |v|<-u)  — parallel exterior
 */
function getRegion(u: number, v: number): number {
  if (u >= Math.abs(v)) return 1;
  if (v >= Math.abs(u)) return 2;
  if (-v >= Math.abs(u)) return 3;
  return 4;
}

// ── Coordinate grid (Kruskal → Penrose mapping) ────────────────────

/**
 * Map Kruskal coordinates (U,V) to compactified Penrose coords (u,v).
 * Uses arctan compactification: u = arctan(U+V)/π + arctan(U-V)/π (scaled)
 * Simplified: T = arctan(V), X = arctan(U), then rotated.
 */
function kruskalToPenrose(U: number, V: number): { u: number; v: number } {
  // Compactify each null coordinate
  const p = (2 / Math.PI) * Math.atan(V + U); // ~right-going null
  const q = (2 / Math.PI) * Math.atan(V - U); // ~left-going null
  // Penrose u,v from null coords
  return { u: (p - q) / 2, v: (p + q) / 2 };
}

/** Generate constant-r curve in Penrose coords for Region I.
 *  In Kruskal: U² - V² = (r/rs - 1)e^{r/rs} for r > rs */
function constantRCurveRegionI(rOverRs: number, nPts: number): { u: number; v: number }[] {
  const pts: { u: number; v: number }[] = [];
  const val = (rOverRs - 1) * Math.exp(rOverRs);
  if (val <= 0) return pts;
  // Parameterise by V: U = sqrt(V² + val)
  for (let i = 0; i <= nPts; i++) {
    const V = -6 + (12 * i) / nPts;
    const U2 = V * V + val;
    if (U2 < 0) continue;
    const U = Math.sqrt(U2);
    pts.push(kruskalToPenrose(U, V));
  }
  return pts;
}

/** Generate constant-r curve in Penrose coords for Region II (inside BH).
 *  r < rs: V² - U² = (1 - r/rs)e^{r/rs}, V > 0 */
function constantRCurveRegionII(rOverRs: number, nPts: number): { u: number; v: number }[] {
  const pts: { u: number; v: number }[] = [];
  const val = (1 - rOverRs) * Math.exp(rOverRs);
  if (val <= 0) return pts;
  for (let i = 0; i <= nPts; i++) {
    const U = -6 + (12 * i) / nPts;
    const V2 = U * U + val;
    if (V2 < 0) continue;
    const V = Math.sqrt(V2);
    pts.push(kruskalToPenrose(U, V));
  }
  return pts;
}

/** Generate constant-t curve in Penrose coords for Region I.
 *  In Kruskal: V/U = tanh(t/(2rs)) for Region I */
function constantTCurveRegionI(tOverRs: number, nPts: number): { u: number; v: number }[] {
  const pts: { u: number; v: number }[] = [];
  const slope = Math.tanh(tOverRs / 2);
  for (let i = 0; i <= nPts; i++) {
    const U = 0.01 + (8 * i) / nPts;
    const V = slope * U;
    pts.push(kruskalToPenrose(U, V));
  }
  return pts;
}

// ── Worldline propagation ───────────────────────────────────────────

/**
 * Propagate a worldline from a starting point with a given initial
 * direction bias. In the Penrose diagram, all causal paths must stay
 * within the 45° light cone (|du| <= dv for future-directed).
 *
 * @param u0 Starting u coordinate
 * @param v0 Starting v coordinate
 * @param bias Horizontal bias (-1 to 1): 0 = purely timelike (straight up),
 *             ±1 = null (45° light ray)
 */
function propagateWorldline(
  u0: number,
  v0: number,
  bias: number,
): { points: { x: number; y: number }[]; crossedHorizon: boolean } {
  const points: { x: number; y: number }[] = [{ x: u0, y: v0 }];
  let u = u0;
  let v = v0;
  const region = getRegion(u0, v0);
  let crossedHorizon = false;

  const step = 0.004;
  const maxSteps = 600;

  for (let i = 0; i < maxSteps; i++) {
    // Determine future direction based on region and bias
    let du: number;
    let dv: number;

    if (region === 2) {
      // Inside BH (future region): worldline must go upward toward singularity
      // All paths curve toward v=1 top boundary
      // dv > 0 always, du influenced by bias but |du| < dv
      dv = step;
      du = bias * step * 0.8;

      // Curve toward singularity — add attraction toward u=0
      du -= u * step * 0.3;
    } else if (region === 1) {
      // Exterior region I: worldline goes upward (future timelike)
      dv = step;
      du = bias * step * 0.7;

      // Check if we'll cross the horizon (u + v > 0 and u < v means entering region II)
      const nextRegion = getRegion(u + du, v + dv);
      if (nextRegion === 2 && !crossedHorizon) {
        crossedHorizon = true;
      }
    } else if (region === 4) {
      // Parallel exterior (left): mirror of region I
      dv = step;
      du = bias * step * 0.7;

      const nextRegion = getRegion(u + du, v + dv);
      if (nextRegion === 2 && !crossedHorizon) {
        crossedHorizon = true;
      }
    } else {
      // Region III (white hole): worldlines go up out of it
      dv = step;
      du = bias * step * 0.7;
    }

    // Ensure causal: |du| <= dv (within light cone)
    const maxDu = Math.abs(dv) * 0.95;
    du = Math.max(-maxDu, Math.min(maxDu, du));

    u += du;
    v += dv;

    // Stop if outside diamond
    if (!insideDiamond(u, v)) {
      // Clamp to boundary
      const scale = 0.999 / (Math.abs(u) + Math.abs(v));
      if (scale < 1) {
        u *= scale;
        v *= scale;
      }
      points.push({ x: u, y: v });
      break;
    }

    points.push({ x: u, y: v });
  }

  return { points, crossedHorizon };
}

// ── Draw helpers ────────────────────────────────────────────────────

function drawWavyLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  amplitude: number,
  frequency: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len;
  const ny = dx / len;

  ctx.beginPath();
  const steps = Math.max(60, Math.floor(len / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const offset = Math.sin(t * Math.PI * 2 * frequency) * amplitude;
    const x = x1 + dx * t + nx * offset;
    const y = y1 + dy * t + ny * offset;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ── Main class ──────────────────────────────────────────────────────

export class PenroseDiagram {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLDivElement;
  private worldlines: Worldline[] = [];
  private colorIndex = 0;

  // Interaction state
  private isDragging = false;
  private dragWorldline: Worldline | null = null;
  private dragStartU = 0;
  private dragStartV = 0;

  // Layout cache
  private cx = 0;
  private cy = 0;
  private halfW = 0;
  private halfH = 0;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "penrose-container";
    this.container.style.cssText = `
      position: fixed;
      z-index: 100;
      border-radius: 12px;
      overflow: hidden;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.08);
      display: none;
    `;
    this.applyResponsiveLayout();

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%;cursor:crosshair;";
    this.ctx = this.canvas.getContext("2d")!;
    this.container.appendChild(this.canvas);

    // Clear button
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.7);
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-family: system-ui, sans-serif;
      z-index: 1;
    `;
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.clearWorldlines();
    });
    this.container.appendChild(clearBtn);

    // Event listeners
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", this.onTouchEnd);

    document.body.appendChild(this.container);
    this.resizeCanvas();
  }

  private applyResponsiveLayout() {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      this.container.style.left = "0";
      this.container.style.right = "0";
      this.container.style.bottom = "0";
      this.container.style.top = "auto";
      this.container.style.width = "100%";
      this.container.style.height = "60vh";
      this.container.style.borderRadius = "12px 12px 0 0";
    } else {
      const size = Math.min(window.innerHeight * 0.5, 400);
      this.container.style.width = size + "px";
      this.container.style.height = size + "px";
      this.container.style.bottom = "16px";
      this.container.style.right = "16px";
      this.container.style.left = "auto";
      this.container.style.top = "auto";
      this.container.style.transform = "none";
      this.container.style.borderRadius = "12px";
    }
  }

  private resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 400;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Compute diamond layout
    const padding = Math.min(w, h) * 0.12;
    this.cx = w / 2;
    this.cy = h / 2;
    this.halfW = w / 2 - padding;
    this.halfH = h / 2 - padding;
  }

  show() {
    this.container.style.display = "block";
    this.applyResponsiveLayout();
    this.resizeCanvas();
  }

  hide() {
    this.container.style.display = "none";
  }

  clearWorldlines() {
    this.worldlines = [];
    this.colorIndex = 0;
  }

  // ── Mouse / Touch handlers ──────────────────────────────────────

  private getCanvasCoords(clientX: number, clientY: number): { u: number; v: number } {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    // Scale to actual CSS dimensions (rect dimensions match CSS)
    return fromCanvas(px, py, this.cx, this.cy, this.halfW, this.halfH);
  }

  private onMouseDown = (e: MouseEvent) => {
    const { u, v } = this.getCanvasCoords(e.clientX, e.clientY);
    if (!insideDiamond(u, v)) return;

    this.isDragging = true;
    this.dragStartU = u;
    this.dragStartV = v;

    // Create a default worldline (will be updated on drag)
    this.startWorldline(u, v, 0);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging || !this.dragWorldline) return;
    const { u } = this.getCanvasCoords(e.clientX, e.clientY);
    // Compute bias from horizontal drag
    const bias = Math.max(-1, Math.min(1, (u - this.dragStartU) * 5));
    this.updateWorldline(this.dragStartU, this.dragStartV, bias);
  };

  private onMouseUp = () => {
    this.isDragging = false;
    this.dragWorldline = null;
  };

  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const { u, v } = this.getCanvasCoords(t.clientX, t.clientY);
    if (!insideDiamond(u, v)) return;

    this.isDragging = true;
    this.dragStartU = u;
    this.dragStartV = v;
    this.startWorldline(u, v, 0);
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.isDragging || !this.dragWorldline || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const { u } = this.getCanvasCoords(t.clientX, t.clientY);
    const bias = Math.max(-1, Math.min(1, (u - this.dragStartU) * 5));
    this.updateWorldline(this.dragStartU, this.dragStartV, bias);
  };

  private onTouchEnd = () => {
    this.isDragging = false;
    this.dragWorldline = null;
  };

  private startWorldline(u: number, v: number, bias: number) {
    const color = WORLDLINE_COLORS[this.colorIndex % WORLDLINE_COLORS.length];
    this.colorIndex++;

    const { points, crossedHorizon } = propagateWorldline(u, v, bias);
    const wl: Worldline = {
      points,
      color,
      crossedHorizon,
      region: getRegion(u, v),
    };
    this.worldlines.push(wl);
    this.dragWorldline = wl;
  }

  private updateWorldline(u: number, v: number, bias: number) {
    if (!this.dragWorldline) return;
    const { points, crossedHorizon } = propagateWorldline(u, v, bias);
    this.dragWorldline.points = points;
    this.dragWorldline.crossedHorizon = crossedHorizon;
  }

  // ── Rendering ───────────────────────────────────────────────────

  render() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 400;
    const ctx = this.ctx;

    // Check resize
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.resizeCanvas();
    }

    const { cx, cy, halfW, halfH } = this;
    const tc = (u: number, v: number) => toCanvas(u, v, cx, cy, halfW, halfH);

    // ── Background ──
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // ── Coordinate grid lines (constant r, constant t) ──
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.8;

    // Constant r lines (Region I) — r/rs = 1.5, 2, 3, 5, 8
    for (const rr of [1.5, 2, 3, 5, 8]) {
      const pts = constantRCurveRegionI(rr, 80);
      if (pts.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = tc(pts[i].u, pts[i].v);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Constant r lines (Region II — inside BH) — r/rs = 0.3, 0.5, 0.7, 0.9
    for (const rr of [0.3, 0.5, 0.7, 0.9]) {
      const pts = constantRCurveRegionII(rr, 80);
      if (pts.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = tc(pts[i].u, pts[i].v);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Constant t lines (Region I) — t/rs = -3, -1.5, 0, 1.5, 3
    for (const tt of [-3, -1.5, 0, 1.5, 3]) {
      const pts = constantTCurveRegionI(tt, 60);
      if (pts.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = tc(pts[i].u, pts[i].v);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // ── Diamond boundary ──
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const top = tc(0, 1);
    const right = tc(1, 0);
    const bottom = tc(0, -1);
    const left = tc(-1, 0);
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(left.x, left.y);
    ctx.closePath();
    ctx.stroke();

    // ── Event horizons (45° diagonals through center) ──
    ctx.strokeStyle = HORIZON_COLOR;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    // Future horizon: bottom-left to top-right
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    // Future horizon: bottom-right to top-left
    ctx.beginPath();
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    // Past horizon: top-left to bottom-right
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.stroke();
    // Past horizon: top-right to bottom-left
    ctx.beginPath();
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Singularities (wavy lines) ──
    ctx.strokeStyle = SINGULARITY_COLOR;
    ctx.lineWidth = 2.5;
    // Future singularity: top edge from (-1,0)→(0,1)→(1,0) — only the top "V" part
    // Actually it's the segment between the two top corners
    const singTL = tc(-0.95, 0.05);
    const singTR = tc(0.95, 0.05);
    const singTopMid = tc(0, 1);
    // Draw wavy from top-left corner to top-right corner (through the top)
    // The singularity is at the TOP of the diamond between the two horizon lines
    const futSingL = tc(-0.5, 0.5);
    const futSingR = tc(0.5, 0.5);
    // Actually, the future singularity is along the entire top boundary
    // In a standard Penrose diagram, it's between (-1,0)→(0,1) and (0,1)→(1,0)
    // but it's drawn as a horizontal wavy line at the top of region II
    drawWavyLine(ctx, left.x, left.y, top.x, top.y, 4, 6);
    drawWavyLine(ctx, top.x, top.y, right.x, right.y, 4, 6);

    // Past singularity: bottom
    ctx.strokeStyle = SINGULARITY_COLOR;
    ctx.globalAlpha = 0.5;
    drawWavyLine(ctx, left.x, left.y, bottom.x, bottom.y, 4, 6);
    drawWavyLine(ctx, bottom.x, bottom.y, right.x, right.y, 4, 6);
    ctx.globalAlpha = 1;

    // ── Region labels ──
    ctx.fillStyle = REGION_LABEL_COLOR;
    ctx.font = `bold ${Math.max(16, halfW * 0.12)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const rI = tc(0.45, 0);
    ctx.fillText("I", rI.x, rI.y);
    const rII = tc(0, 0.4);
    ctx.fillText("II", rII.x, rII.y);
    const rIII = tc(0, -0.4);
    ctx.fillText("III", rIII.x, rIII.y);
    const rIV = tc(-0.45, 0);
    ctx.fillText("IV", rIV.x, rIV.y);

    // ── Infinity labels ──
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = `${Math.max(10, halfW * 0.06)}px system-ui, sans-serif`;

    // i+ (future timelike infinity) — top
    const iPlus = tc(0, 1);
    ctx.textAlign = "center";
    ctx.fillText("i⁺", iPlus.x, iPlus.y - 10);

    // i- (past timelike infinity) — bottom
    const iMinus = tc(0, -1);
    ctx.fillText("i⁻", iMinus.x, iMinus.y + 14);

    // i0 (spatial infinity) — right
    const i0R = tc(1, 0);
    ctx.textAlign = "left";
    ctx.fillText("i⁰", i0R.x + 6, i0R.y);

    // i0 — left
    const i0L = tc(-1, 0);
    ctx.textAlign = "right";
    ctx.fillText("i⁰", i0L.x - 6, i0L.y);

    // I+ (future null infinity) — upper right and upper left edges
    const scrPlus = tc(0.6, 0.55);
    ctx.textAlign = "left";
    ctx.fillText("ℐ⁺", scrPlus.x + 4, scrPlus.y - 4);
    const scrPlusL = tc(-0.6, 0.55);
    ctx.textAlign = "right";
    ctx.fillText("ℐ⁺", scrPlusL.x - 4, scrPlusL.y - 4);

    // I- (past null infinity) — lower right and lower left edges
    const scrMinus = tc(0.6, -0.55);
    ctx.textAlign = "left";
    ctx.fillText("ℐ⁻", scrMinus.x + 4, scrMinus.y + 4);
    const scrMinusL = tc(-0.6, -0.55);
    ctx.textAlign = "right";
    ctx.fillText("ℐ⁻", scrMinusL.x - 4, scrMinusL.y + 4);

    // Singularity labels
    ctx.fillStyle = SINGULARITY_COLOR;
    ctx.globalAlpha = 0.7;
    ctx.textAlign = "center";
    ctx.fillText("r = 0", cx, top.y + Math.max(14, halfH * 0.08));
    ctx.globalAlpha = 0.4;
    ctx.fillText("r = 0", cx, bottom.y - Math.max(8, halfH * 0.06));
    ctx.globalAlpha = 1;

    // ── Worldlines ──
    for (const wl of this.worldlines) {
      this.drawWorldline(wl);
    }

    // ── Instruction hint ──
    if (this.worldlines.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = `${Math.max(11, halfW * 0.05)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Click to place a worldline. Drag to adjust direction.", cx, h - 16);
    }
  }

  private drawWorldline(wl: Worldline) {
    const ctx = this.ctx;
    const { cx, cy, halfW, halfH } = this;

    if (wl.points.length < 2) return;

    // Draw light cone at starting point
    const start = wl.points[0];
    const sp = toCanvas(start.x, start.y, cx, cy, halfW, halfH);

    // Light cone (45° lines from start, going forward in time)
    const coneLen = halfW * 0.15;
    ctx.strokeStyle = LIGHTCONE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Right null ray (45° up-right)
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(sp.x + coneLen, sp.y - coneLen);
    // Left null ray (45° up-left)
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(sp.x - coneLen, sp.y - coneLen);
    ctx.stroke();

    // Fill light cone triangle
    ctx.fillStyle = "rgba(251, 191, 36, 0.08)";
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(sp.x + coneLen, sp.y - coneLen);
    ctx.lineTo(sp.x - coneLen, sp.y - coneLen);
    ctx.closePath();
    ctx.fill();

    // Draw the worldline path
    ctx.strokeStyle = wl.color;
    ctx.lineWidth = WORLDLINE_WIDTH;
    ctx.beginPath();
    for (let i = 0; i < wl.points.length; i++) {
      const p = toCanvas(wl.points[i].x, wl.points[i].y, cx, cy, halfW, halfH);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Glow effect
    ctx.shadowColor = wl.color;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = wl.color;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Starting point dot
    ctx.fillStyle = wl.color;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Horizon crossing indicator
    if (wl.crossedHorizon) {
      // Find where worldline crosses horizon (u ≈ v transition)
      for (let i = 1; i < wl.points.length; i++) {
        const prev = wl.points[i - 1];
        const curr = wl.points[i];
        const prevRegion = getRegion(prev.x, prev.y);
        const currRegion = getRegion(curr.x, curr.y);
        if (prevRegion !== currRegion && (currRegion === 2 || prevRegion === 2)) {
          const hp = toCanvas(curr.x, curr.y, cx, cy, halfW, halfH);
          ctx.strokeStyle = HORIZON_CROSS_COLOR;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(hp.x, hp.y, 6, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
    }

    // End point: if in region II, show it hitting singularity
    const end = wl.points[wl.points.length - 1];
    const endRegion = getRegion(end.x, end.y);
    if (endRegion === 2 || (wl.region === 2)) {
      const ep = toCanvas(end.x, end.y, cx, cy, halfW, halfH);
      // Small cross at singularity hit
      ctx.strokeStyle = SINGULARITY_COLOR;
      ctx.lineWidth = 2;
      const s = 5;
      ctx.beginPath();
      ctx.moveTo(ep.x - s, ep.y - s);
      ctx.lineTo(ep.x + s, ep.y + s);
      ctx.moveTo(ep.x + s, ep.y - s);
      ctx.lineTo(ep.x - s, ep.y + s);
      ctx.stroke();
    }
  }

  dispose() {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.canvas.removeEventListener("touchend", this.onTouchEnd);
    this.container.remove();
  }
}
