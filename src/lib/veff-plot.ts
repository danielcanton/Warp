/**
 * Canvas2D renderer for the null-geodesic effective potential V_eff(r).
 *
 * V_eff = (1 - r_s/r) * L² / r²
 *
 * Draws the curve, marks the photon-sphere peak, and animates a dot
 * at the particle's current radial position.
 */

export interface VeffPlotOptions {
  /** Schwarzschild radius */
  rs: number;
  /** Angular momentum */
  L: number;
}

const PADDING_LEFT = 40;
const PADDING_BOTTOM = 24;
const PADDING_TOP = 12;
const PADDING_RIGHT = 12;

const GRID_COLOR = "rgba(255,255,255,0.08)";
const AXIS_COLOR = "rgba(255,255,255,0.3)";
const CURVE_COLOR = "#818cf8"; // indigo-400
const DOT_COLOR = "#fbbf24"; // amber-400
const PHOTON_MARKER_COLOR = "#f472b6"; // pink-400
const BG_COLOR = "rgba(10, 10, 30, 0.85)";
const TEXT_COLOR = "rgba(255,255,255,0.6)";

export class VeffPlot {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLDivElement;
  private rs = 1.5;
  private L = 5;
  private dotR: number | null = null; // current radial position of tracked particle

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "veff-plot-container";
    this.container.style.cssText = `
      position: fixed;
      z-index: 100;
      border-radius: 10px;
      overflow: hidden;
      pointer-events: none;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.08);
    `;
    this.applyResponsiveLayout();

    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    this.container.appendChild(this.canvas);

    document.body.appendChild(this.container);
    this.resizeCanvas();
  }

  private applyResponsiveLayout() {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      this.container.style.bottom = "0";
      this.container.style.left = "0";
      this.container.style.right = "0";
      this.container.style.width = "100%";
      this.container.style.height = "150px";
      this.container.style.borderRadius = "10px 10px 0 0";
    } else {
      this.container.style.bottom = "16px";
      this.container.style.right = "16px";
      this.container.style.left = "auto";
      this.container.style.width = "250px";
      this.container.style.height = "200px";
    }
  }

  private resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth || 250;
    const h = this.container.clientHeight || 200;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  show() {
    this.container.style.display = "block";
    this.applyResponsiveLayout();
    this.resizeCanvas();
  }

  hide() {
    this.container.style.display = "none";
  }

  setParams(rs: number, L: number) {
    this.rs = rs;
    this.L = L;
  }

  setDotPosition(r: number | null) {
    this.dotR = r;
  }

  /** Compute V_eff at given r */
  private veff(r: number): number {
    if (r <= this.rs) return 0;
    return (1 - this.rs / r) * (this.L * this.L) / (r * r);
  }

  /** Render the plot. Call each animation frame when visible. */
  render() {
    const w = this.container.clientWidth || 250;
    const h = this.container.clientHeight || 200;
    const ctx = this.ctx;

    // If container size changed, resize canvas
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.resizeCanvas();
    }

    const plotW = w - PADDING_LEFT - PADDING_RIGHT;
    const plotH = h - PADDING_TOP - PADDING_BOTTOM;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Determine r range: from just outside horizon to ~15 rs
    const rMin = this.rs * 1.05;
    const rMax = this.rs * 15;

    // Find V_eff peak for auto-scaling
    let vMax = 0;
    const photonR = 1.5 * this.rs; // photon sphere radius
    for (let r = rMin; r <= rMax; r += (rMax - rMin) / 200) {
      const v = this.veff(r);
      if (v > vMax) vMax = v;
    }
    vMax *= 1.2; // headroom
    if (vMax <= 0) vMax = 1;

    // Map functions
    const mapX = (r: number) => PADDING_LEFT + ((r - rMin) / (rMax - rMin)) * plotW;
    const mapY = (v: number) => PADDING_TOP + plotH - (v / vMax) * plotH;

    // Grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = PADDING_TOP + (i / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(PADDING_LEFT, y);
      ctx.lineTo(w - PADDING_RIGHT, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = PADDING_LEFT + (i / 4) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, PADDING_TOP);
      ctx.lineTo(x, PADDING_TOP + plotH);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING_LEFT, PADDING_TOP);
    ctx.lineTo(PADDING_LEFT, PADDING_TOP + plotH);
    ctx.lineTo(w - PADDING_RIGHT, PADDING_TOP + plotH);
    ctx.stroke();

    // Draw V_eff curve
    ctx.strokeStyle = CURVE_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    const steps = Math.max(plotW, 100);
    for (let i = 0; i <= steps; i++) {
      const r = rMin + (i / steps) * (rMax - rMin);
      const v = this.veff(r);
      const x = mapX(r);
      const y = mapY(v);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Mark photon sphere peak
    if (photonR > rMin && photonR < rMax) {
      const px = mapX(photonR);
      const py = mapY(this.veff(photonR));
      ctx.strokeStyle = PHOTON_MARKER_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, PADDING_TOP + plotH);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = PHOTON_MARKER_COLOR;
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("r_ph", px, PADDING_TOP + plotH + 12);
    }

    // Animated dot at current particle r
    if (this.dotR !== null && this.dotR > rMin && this.dotR < rMax) {
      const dx = mapX(this.dotR);
      const dy = mapY(this.veff(this.dotR));
      ctx.fillStyle = DOT_COLOR;
      ctx.beginPath();
      ctx.arc(dx, dy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Glow
      ctx.shadowColor = DOT_COLOR;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(dx, dy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Axis labels
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("r / r_s", PADDING_LEFT + plotW / 2, h - 2);

    // Y label
    ctx.save();
    ctx.translate(10, PADDING_TOP + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("V_eff", 0, 0);
    ctx.restore();

    // R-axis tick labels
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = "8px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) {
      const r = rMin + (i / 4) * (rMax - rMin);
      const x = mapX(r);
      ctx.fillText((r / this.rs).toFixed(1), x, PADDING_TOP + plotH + 12);
    }

    // L label in top-left
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`L = ${this.L.toFixed(2)}`, PADDING_LEFT + 4, PADDING_TOP + 10);
  }

  dispose() {
    this.container.remove();
  }
}
