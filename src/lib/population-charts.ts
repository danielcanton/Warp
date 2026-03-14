// ─── Population Scatter Plot ──────────────────────────────────────────
// Canvas2D m1 vs m2 scatter plot for the Stats tab in the event list panel.
// Follows the NoiseCurvePlot pattern: HiDPI canvas, container div, show/hide.

import { classifyEvent, type GWEvent } from "./waveform";
import type { ViewMode } from "./view-mode";

const COLORS: Record<string, string> = {
  BBH: "rgba(99, 102, 241, 0.85)",   // indigo
  BNS: "rgba(245, 158, 11, 0.85)",   // amber
  NSBH: "rgba(16, 185, 129, 0.85)",  // green
};

const COLORS_HIGHLIGHT: Record<string, string> = {
  BBH: "rgba(129, 132, 255, 1)",
  BNS: "rgba(255, 188, 41, 1)",
  NSBH: "rgba(46, 215, 159, 1)",
};

const COLORS_ELLIPSE: Record<string, string> = {
  BBH: "rgba(99, 102, 241, 0.12)",
  BNS: "rgba(245, 158, 11, 0.12)",
  NSBH: "rgba(16, 185, 129, 0.12)",
};

const COLORS_ELLIPSE_STROKE: Record<string, string> = {
  BBH: "rgba(99, 102, 241, 0.35)",
  BNS: "rgba(245, 158, 11, 0.35)",
  NSBH: "rgba(16, 185, 129, 0.35)",
};

const STYLE = {
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.12)",
  text: "rgba(255,255,255,0.4)",
  label: "rgba(255,255,255,0.6)",
  selectedRing: "rgba(255,255,255,0.9)",
};

export class PopulationScatter {
  readonly container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private events: GWEvent[] = [];
  private selectedName: string | null = null;
  private onSelectEvent: ((event: GWEvent) => void) | null = null;
  private resizeObserver: ResizeObserver;
  private viewMode: ViewMode = "explorer";

  // Cached layout for hit testing
  private pointPositions: { x: number; y: number; event: GWEvent }[] = [];
  private padL = 40;
  private padR = 12;
  private padT = 10;
  private padB = 28;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "population-scatter";
    this.container.style.cssText = "display:none;width:100%;";

    // Legend
    const legend = document.createElement("div");
    legend.style.cssText =
      "display:flex;gap:10px;margin-bottom:6px;font-size:9px;font-family:-apple-system,system-ui,sans-serif;color:rgba(255,255,255,0.5);";
    for (const [type, color] of Object.entries(COLORS)) {
      const item = document.createElement("span");
      item.style.cssText = "display:flex;align-items:center;gap:3px;";
      const dot = document.createElement("span");
      dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;`;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(type));
      legend.appendChild(item);
    }
    this.container.appendChild(legend);

    // Title
    const title = document.createElement("div");
    title.style.cssText =
      "font-size:9px;color:rgba(255,255,255,0.4);margin-bottom:4px;font-family:-apple-system,system-ui,sans-serif;";
    title.textContent = "m₁ vs m₂ (source-frame solar masses)";
    this.container.appendChild(title);

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "width:100%;height:200px;display:block;border-radius:6px;cursor:crosshair;";
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.canvas);

    // Click handler for hit testing
    this.canvas.addEventListener("click", (e) => this.handleClick(e));
  }

  setEvents(events: GWEvent[]): void {
    this.events = events;
    this.draw();
  }

  setSelectedEvent(name: string | null): void {
    this.selectedName = name;
    this.draw();
  }

  setOnSelectEvent(cb: (event: GWEvent) => void): void {
    this.onSelectEvent = cb;
  }

  setViewMode(mode: ViewMode): void {
    if (this.viewMode !== mode) {
      this.viewMode = mode;
      this.draw();
    }
  }

  show(): void {
    this.container.style.display = "block";
    this.draw();
  }

  hide(): void {
    this.container.style.display = "none";
  }

  private handleClick(e: MouseEvent): void {
    if (!this.onSelectEvent || this.pointPositions.length === 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Find nearest point within 12px
    let nearest: { event: GWEvent; dist: number } | null = null;
    for (const pp of this.pointPositions) {
      const dx = pp.x - mx;
      const dy = pp.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 12 && (!nearest || dist < nearest.dist)) {
        nearest = { event: pp.event, dist };
      }
    }

    if (nearest) {
      this.onSelectEvent(nearest.event);
    }
  }

  private draw(): void {
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
    const padL = this.padL;
    const padR = this.padR;
    const padT = this.padT;
    const padB = this.padB;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    if (this.events.length === 0) return;

    // Determine axis ranges from data
    let m1Max = 0;
    let m2Max = 0;
    for (const ev of this.events) {
      if (ev.mass_1_source > m1Max) m1Max = ev.mass_1_source;
      if (ev.mass_2_source > m2Max) m2Max = ev.mass_2_source;
    }
    // Round up to nice numbers
    m1Max = Math.ceil(m1Max / 10) * 10 + 10;
    m2Max = Math.ceil(m2Max / 10) * 10 + 10;

    const toX = (m1: number) => padL + (m1 / m1Max) * plotW;
    const toY = (m2: number) => padT + plotH - (m2 / m2Max) * plotH;

    // ─── Grid ─────────────────────────────────
    ctx.strokeStyle = STYLE.grid;
    ctx.lineWidth = 0.5;

    const xStep = m1Max <= 50 ? 5 : m1Max <= 100 ? 10 : 20;
    const yStep = m2Max <= 50 ? 5 : m2Max <= 100 ? 10 : 20;

    for (let m = xStep; m < m1Max; m += xStep) {
      const x = toX(m);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }
    for (let m = yStep; m < m2Max; m += yStep) {
      const y = toY(m);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // ─── Mass gap shading (3–5 M☉) on both axes ──────
    ctx.fillStyle = "rgba(239, 68, 68, 0.07)";
    // Horizontal band: m2 in [3, 5]
    const gapTop = toY(5);
    const gapBot = toY(3);
    ctx.fillRect(padL, gapTop, plotW, gapBot - gapTop);
    // Vertical band: m1 in [3, 5]
    const gapLeft = toX(3);
    const gapRight = toX(5);
    ctx.fillRect(gapLeft, padT, gapRight - gapLeft, plotH);

    // ─── Equal mass line (m1 = m2) ────────────
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const eqMax = Math.min(m1Max, m2Max);
    ctx.moveTo(toX(0), toY(0));
    ctx.lineTo(toX(eqMax), toY(eqMax));
    ctx.stroke();
    ctx.setLineDash([]);

    // ─── 90% CI posterior ellipses (Researcher only) ──────
    if (this.viewMode === "researcher") {
      this.drawEllipses(ctx, toX, toY, m1Max, m2Max, plotW, plotH);
    }

    // ─── Data points ──────────────────────────
    this.pointPositions = [];
    const pointRadius = 4;

    // Draw non-selected points first, selected last
    const sorted = [...this.events].sort((a, b) => {
      if (a.commonName === this.selectedName) return 1;
      if (b.commonName === this.selectedName) return -1;
      return 0;
    });

    for (const ev of sorted) {
      const type = classifyEvent(ev);
      const x = toX(ev.mass_1_source);
      const y = toY(ev.mass_2_source);
      const isSelected = ev.commonName === this.selectedName;

      this.pointPositions.push({ x, y, event: ev });

      if (isSelected) {
        // Selection ring
        ctx.beginPath();
        ctx.arc(x, y, pointRadius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = STYLE.selectedRing;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Filled point
        ctx.beginPath();
        ctx.arc(x, y, pointRadius + 1, 0, Math.PI * 2);
        ctx.fillStyle = COLORS_HIGHLIGHT[type] ?? COLORS_HIGHLIGHT.BBH;
        ctx.fill();

        // Label
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "bold 8px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(ev.commonName, x + pointRadius + 6, y + 3);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[type] ?? COLORS.BBH;
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // ─── Axes labels ──────────────────────────
    ctx.fillStyle = STYLE.text;
    ctx.font = "9px -apple-system, system-ui, sans-serif";

    // X-axis labels
    ctx.textAlign = "center";
    for (let m = 0; m <= m1Max; m += xStep) {
      ctx.fillText(String(m), toX(m), H - 4);
    }
    // X-axis title
    ctx.fillStyle = STYLE.label;
    ctx.fillText("m₁ (M☉)", padL + plotW / 2, H - 14);

    // Y-axis labels
    ctx.fillStyle = STYLE.text;
    ctx.textAlign = "right";
    for (let m = 0; m <= m2Max; m += yStep) {
      const y = toY(m);
      if (y > padT + 4 && y < padT + plotH - 4) {
        ctx.fillText(String(m), padL - 4, y + 3);
      }
    }
    // Y-axis title (rotated)
    ctx.save();
    ctx.fillStyle = STYLE.label;
    ctx.translate(8, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("m₂ (M☉)", 0, 0);
    ctx.restore();

    // ─── Axes lines ───────────────────────────
    ctx.strokeStyle = STYLE.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();
  }

  /** Draw 90% CI posterior ellipses with chirp-mass anti-correlation tilt */
  private drawEllipses(
    ctx: CanvasRenderingContext2D,
    toX: (m1: number) => number,
    toY: (m2: number) => number,
    m1Max: number,
    m2Max: number,
    plotW: number,
    plotH: number,
  ): void {
    // 1.645 = z-score for 90% CI (two-sided)
    const Z90 = 1.645;

    for (const ev of this.events) {
      // Compute 1-sigma from 90% CI bounds
      const sigma_m1 = (ev.mass_1_source_upper - ev.mass_1_source_lower) / (2 * Z90);
      const sigma_m2 = (ev.mass_2_source_upper - ev.mass_2_source_lower) / (2 * Z90);

      // Skip if uncertainties are missing or zero
      if (sigma_m1 <= 0 || sigma_m2 <= 0) continue;

      // Rotation angle from chirp mass constraint: Mc = (m1*m2)^(3/5) / (m1+m2)^(1/5) = const
      // Partial derivatives along Mc = const contour give the tilt direction.
      // dMc/dm1 = 0 and dMc/dm2 = 0 along contour → dm2/dm1 = -(∂Mc/∂m1)/(∂Mc/∂m2)
      const m1 = ev.mass_1_source;
      const m2 = ev.mass_2_source;
      const S = m1 + m2;
      // dm2/dm1 along Mc=const: -(3m2*S - m1*m2) / (3m1*S - m1*m2)
      //                        = -(3*S/m1 - 1) / (3*S/m2 - 1)  — simplified
      const dm2_dm1 = -(3 * m2 * S - m1 * m2) / (3 * m1 * S - m1 * m2);

      // Convert slope to pixel-space angle (axes have different scales)
      const scaleX = plotW / m1Max;
      const scaleY = plotH / m2Max;
      const theta = Math.atan2(dm2_dm1 * scaleY, scaleX);

      // Semi-axes in pixel space (90% CI = 1.645 sigma, and we already divided by 1.645,
      // so multiply back by 1.645 to get the 90% ellipse radius)
      const a = sigma_m1 * Z90 * scaleX;
      const b = sigma_m2 * Z90 * scaleY;

      const cx = toX(m1);
      const cy = toY(m2);
      const type = classifyEvent(ev);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-theta); // negative because canvas y-axis is flipped

      ctx.beginPath();
      ctx.ellipse(0, 0, a, b, 0, 0, Math.PI * 2);

      ctx.fillStyle = COLORS_ELLIPSE[type] ?? COLORS_ELLIPSE.BBH;
      ctx.fill();
      ctx.strokeStyle = COLORS_ELLIPSE_STROKE[type] ?? COLORS_ELLIPSE_STROKE.BBH;
      ctx.lineWidth = 0.75;
      ctx.stroke();

      ctx.restore();
    }
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.container.remove();
  }
}

// ─── Chirp Mass Histogram ──────────────────────────────────────────────
// Bar chart of chirp mass distribution with mass gap shading.

interface HistBin {
  lo: number;
  hi: number;
  events: GWEvent[];
  dominant: string; // dominant event type key
}

export class ChirpMassHistogram {
  readonly container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private events: GWEvent[] = [];
  private selectedName: string | null = null;
  private highlightedBin: number = -1;
  private onSelectEvent: ((event: GWEvent) => void) | null = null;
  private onHighlightEvents: ((events: GWEvent[]) => void) | null = null;
  private resizeObserver: ResizeObserver;

  private bins: HistBin[] = [];
  private padL = 40;
  private padR = 12;
  private padT = 10;
  private padB = 28;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "chirp-mass-histogram";
    this.container.style.cssText = "display:none;width:100%;margin-top:12px;";

    // Title
    const title = document.createElement("div");
    title.style.cssText =
      "font-size:9px;color:rgba(255,255,255,0.4);margin-bottom:4px;font-family:-apple-system,system-ui,sans-serif;";
    title.textContent = "Chirp mass distribution (Mc in M☉)";
    this.container.appendChild(title);

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "width:100%;height:180px;display:block;border-radius:6px;cursor:crosshair;";
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.canvas);

    this.canvas.addEventListener("click", (e) => this.handleClick(e));
  }

  setEvents(events: GWEvent[]): void {
    this.events = events;
    this.computeBins();
    this.draw();
  }

  setSelectedEvent(name: string | null): void {
    this.selectedName = name;
    this.draw();
  }

  setOnSelectEvent(cb: (event: GWEvent) => void): void {
    this.onSelectEvent = cb;
  }

  setOnHighlightEvents(cb: (events: GWEvent[]) => void): void {
    this.onHighlightEvents = cb;
  }

  show(): void {
    this.container.style.display = "block";
    this.draw();
  }

  hide(): void {
    this.container.style.display = "none";
  }

  private computeBins(): void {
    if (this.events.length === 0) {
      this.bins = [];
      return;
    }

    // Determine range
    let mcMin = Infinity;
    let mcMax = -Infinity;
    for (const ev of this.events) {
      if (ev.chirp_mass_source <= 0) continue;
      if (ev.chirp_mass_source < mcMin) mcMin = ev.chirp_mass_source;
      if (ev.chirp_mass_source > mcMax) mcMax = ev.chirp_mass_source;
    }
    if (mcMin === Infinity) {
      this.bins = [];
      return;
    }

    // Nice bin edges: ~15-20 bins
    const range = mcMax - mcMin;
    const nBins = Math.max(8, Math.min(20, Math.round(range / 2)));
    const binW = range / nBins;
    const start = Math.floor(mcMin / binW) * binW;

    this.bins = [];
    for (let i = 0; i <= nBins; i++) {
      this.bins.push({
        lo: start + i * binW,
        hi: start + (i + 1) * binW,
        events: [],
        dominant: "BBH",
      });
    }

    for (const ev of this.events) {
      if (ev.chirp_mass_source <= 0) continue;
      const idx = Math.min(
        Math.floor((ev.chirp_mass_source - start) / binW),
        this.bins.length - 1,
      );
      if (idx >= 0) this.bins[idx].events.push(ev);
    }

    // Determine dominant type per bin
    for (const bin of this.bins) {
      const counts: Record<string, number> = {};
      for (const ev of bin.events) {
        const t = classifyEvent(ev);
        counts[t] = (counts[t] || 0) + 1;
      }
      let maxType = "BBH";
      let maxCount = 0;
      for (const [t, c] of Object.entries(counts)) {
        if (c > maxCount) {
          maxType = t;
          maxCount = c;
        }
      }
      bin.dominant = maxType;
    }
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const binIdx = this.hitTestBin(mx);

    if (binIdx >= 0 && binIdx < this.bins.length) {
      const bin = this.bins[binIdx];
      if (bin.events.length > 0) {
        this.highlightedBin = this.highlightedBin === binIdx ? -1 : binIdx;
        this.draw();

        if (this.highlightedBin >= 0 && this.onHighlightEvents) {
          this.onHighlightEvents(bin.events);
        }

        // Select first event in bin if single-clicking
        if (this.onSelectEvent && bin.events.length > 0) {
          this.onSelectEvent(bin.events[0]);
        }
      }
    }
  }

  private hitTestBin(mx: number): number {
    if (this.bins.length === 0) return -1;

    const rect = this.canvas.getBoundingClientRect();
    const W = rect.width;
    const plotW = W - this.padL - this.padR;

    const start = this.bins[0].lo;
    const end = this.bins[this.bins.length - 1].hi;
    const range = end - start;
    if (range <= 0) return -1;

    const barW = plotW / this.bins.length;

    for (let i = 0; i < this.bins.length; i++) {
      const x0 = this.padL + i * barW;
      const x1 = x0 + barW;
      if (mx >= x0 && mx < x1) return i;
    }
    return -1;
  }

  private draw(): void {
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
    const padL = this.padL;
    const padR = this.padR;
    const padT = this.padT;
    const padB = this.padB;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    if (this.bins.length === 0) return;

    // Y-axis max
    let countMax = 0;
    for (const bin of this.bins) {
      if (bin.events.length > countMax) countMax = bin.events.length;
    }
    countMax = Math.max(countMax, 1);
    // Round up to nice number
    countMax = Math.ceil(countMax / 2) * 2 + 1;

    const start = this.bins[0].lo;
    const end = this.bins[this.bins.length - 1].hi;
    const range = end - start;
    const barW = plotW / this.bins.length;

    const toX = (mc: number) => padL + ((mc - start) / range) * plotW;
    const toY = (count: number) => padT + plotH - (count / countMax) * plotH;

    // ─── Mass gap shading (3–5 M☉) ──────
    if (start < 5 && end > 3) {
      const gapL = Math.max(toX(3), padL);
      const gapR = Math.min(toX(5), padL + plotW);
      if (gapR > gapL) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.10)";
        ctx.fillRect(gapL, padT, gapR - gapL, plotH);

        // Label
        ctx.fillStyle = "rgba(239, 68, 68, 0.5)";
        ctx.font = "bold 8px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("mass gap", (gapL + gapR) / 2, padT + 12);
      }
    }

    // ─── Grid ─────────────────────────────────
    ctx.strokeStyle = STYLE.grid;
    ctx.lineWidth = 0.5;
    const yStep = countMax <= 10 ? 1 : countMax <= 30 ? 5 : 10;
    for (let c = yStep; c < countMax; c += yStep) {
      const y = toY(c);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // ─── Bars ─────────────────────────────────
    const gap = Math.max(1, barW * 0.1);
    for (let i = 0; i < this.bins.length; i++) {
      const bin = this.bins[i];
      if (bin.events.length === 0) continue;

      const x0 = padL + i * barW + gap / 2;
      const bw = barW - gap;
      const barH = (bin.events.length / countMax) * plotH;
      const y0 = padT + plotH - barH;

      const isHighlighted = i === this.highlightedBin;
      const containsSelected = bin.events.some(
        (ev) => ev.commonName === this.selectedName,
      );

      // Fill with dominant type color
      if (isHighlighted || containsSelected) {
        ctx.fillStyle = COLORS_HIGHLIGHT[bin.dominant] ?? COLORS_HIGHLIGHT.BBH;
        ctx.globalAlpha = 0.95;
      } else {
        ctx.fillStyle = COLORS[bin.dominant] ?? COLORS.BBH;
        ctx.globalAlpha = 0.7;
      }

      ctx.beginPath();
      ctx.roundRect(x0, y0, bw, barH, [2, 2, 0, 0]);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Highlight border
      if (isHighlighted || containsSelected) {
        ctx.strokeStyle = STYLE.selectedRing;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x0, y0, bw, barH, [2, 2, 0, 0]);
        ctx.stroke();
      }

      // Count label on top of bar
      if (barH > 12) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "bold 8px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(bin.events.length), x0 + bw / 2, y0 - 3);
      }
    }

    // ─── Axes labels ──────────────────────────
    ctx.fillStyle = STYLE.text;
    ctx.font = "9px -apple-system, system-ui, sans-serif";

    // X-axis labels (bin edges)
    ctx.textAlign = "center";
    const xLabelStep = Math.max(1, Math.floor(this.bins.length / 8));
    for (let i = 0; i <= this.bins.length; i += xLabelStep) {
      const val = i < this.bins.length ? this.bins[i].lo : this.bins[this.bins.length - 1].hi;
      const x = padL + (i / this.bins.length) * plotW;
      ctx.fillText(val.toFixed(0), x, H - 4);
    }
    // X-axis title
    ctx.fillStyle = STYLE.label;
    ctx.fillText("Mc (M☉)", padL + plotW / 2, H - 14);

    // Y-axis labels
    ctx.fillStyle = STYLE.text;
    ctx.textAlign = "right";
    for (let c = 0; c <= countMax; c += yStep) {
      const y = toY(c);
      if (y > padT + 4 && y < padT + plotH - 4) {
        ctx.fillText(String(c), padL - 4, y + 3);
      }
    }
    // Y-axis title
    ctx.save();
    ctx.fillStyle = STYLE.label;
    ctx.translate(8, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Count", 0, 0);
    ctx.restore();

    // ─── Axes lines ───────────────────────────
    ctx.strokeStyle = STYLE.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.container.remove();
  }
}

// ─── Chi_eff Histogram ──────────────────────────────────────────────────
// Effective spin parameter distribution, binned from -1 to +1.

interface ChiEffBin {
  lo: number;
  hi: number;
  events: GWEvent[];
  dominant: string;
}

export class ChiEffHistogram {
  readonly container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private events: GWEvent[] = [];
  private selectedName: string | null = null;
  private highlightedBin: number = -1;
  private onSelectEvent: ((event: GWEvent) => void) | null = null;
  private resizeObserver: ResizeObserver;

  private bins: ChiEffBin[] = [];
  private padL = 40;
  private padR = 12;
  private padT = 10;
  private padB = 28;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "chi-eff-histogram";
    this.container.style.cssText = "display:none;width:100%;margin-top:12px;";

    const title = document.createElement("div");
    title.style.cssText =
      "font-size:9px;color:rgba(255,255,255,0.4);margin-bottom:4px;font-family:-apple-system,system-ui,sans-serif;";
    title.textContent = "Effective spin parameter (χ_eff)";
    this.container.appendChild(title);

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "width:100%;height:180px;display:block;border-radius:6px;cursor:crosshair;";
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.canvas);

    this.canvas.addEventListener("click", (e) => this.handleClick(e));
  }

  setEvents(events: GWEvent[]): void {
    this.events = events;
    this.computeBins();
    this.draw();
  }

  setSelectedEvent(name: string | null): void {
    this.selectedName = name;
    this.draw();
  }

  setOnSelectEvent(cb: (event: GWEvent) => void): void {
    this.onSelectEvent = cb;
  }

  show(): void {
    this.container.style.display = "block";
    this.draw();
  }

  hide(): void {
    this.container.style.display = "none";
  }

  private computeBins(): void {
    const nBins = 20;
    const binW = 2 / nBins;
    this.bins = [];
    for (let i = 0; i < nBins; i++) {
      this.bins.push({
        lo: -1 + i * binW,
        hi: -1 + (i + 1) * binW,
        events: [],
        dominant: "BBH",
      });
    }

    for (const ev of this.events) {
      const chi = ev.chi_eff;
      if (chi < -1 || chi > 1) continue;
      const idx = Math.min(Math.floor((chi + 1) / binW), nBins - 1);
      if (idx >= 0) this.bins[idx].events.push(ev);
    }

    for (const bin of this.bins) {
      const counts: Record<string, number> = {};
      for (const ev of bin.events) {
        const t = classifyEvent(ev);
        counts[t] = (counts[t] || 0) + 1;
      }
      let maxType = "BBH";
      let maxCount = 0;
      for (const [t, c] of Object.entries(counts)) {
        if (c > maxCount) { maxType = t; maxCount = c; }
      }
      bin.dominant = maxType;
    }
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const binIdx = this.hitTestBin(mx);

    if (binIdx >= 0 && binIdx < this.bins.length) {
      const bin = this.bins[binIdx];
      if (bin.events.length > 0) {
        this.highlightedBin = this.highlightedBin === binIdx ? -1 : binIdx;
        this.draw();
        if (this.onSelectEvent && bin.events.length > 0) {
          this.onSelectEvent(bin.events[0]);
        }
      }
    }
  }

  private hitTestBin(mx: number): number {
    if (this.bins.length === 0) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const plotW = rect.width - this.padL - this.padR;
    const barW = plotW / this.bins.length;

    for (let i = 0; i < this.bins.length; i++) {
      const x0 = this.padL + i * barW;
      const x1 = x0 + barW;
      if (mx >= x0 && mx < x1) return i;
    }
    return -1;
  }

  private draw(): void {
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
    const padL = this.padL;
    const padR = this.padR;
    const padT = this.padT;
    const padB = this.padB;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    if (this.bins.length === 0) return;

    let countMax = 0;
    for (const bin of this.bins) {
      if (bin.events.length > countMax) countMax = bin.events.length;
    }
    countMax = Math.max(countMax, 1);
    countMax = Math.ceil(countMax / 2) * 2 + 1;

    const barW = plotW / this.bins.length;

    const toX = (chi: number) => padL + ((chi + 1) / 2) * plotW;
    const toY = (count: number) => padT + plotH - (count / countMax) * plotH;

    // ─── Zero line ──────────────────────────
    const zeroX = toX(0);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(zeroX, padT);
    ctx.lineTo(zeroX, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "bold 8px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("χ=0", zeroX, padT + 12);

    // ─── Grid ─────────────────────────────────
    ctx.strokeStyle = STYLE.grid;
    ctx.lineWidth = 0.5;
    const yStep = countMax <= 10 ? 1 : countMax <= 30 ? 5 : 10;
    for (let c = yStep; c < countMax; c += yStep) {
      const y = toY(c);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // ─── Bars ─────────────────────────────────
    const gap = Math.max(1, barW * 0.1);
    for (let i = 0; i < this.bins.length; i++) {
      const bin = this.bins[i];
      if (bin.events.length === 0) continue;

      const x0 = padL + i * barW + gap / 2;
      const bw = barW - gap;
      const barH = (bin.events.length / countMax) * plotH;
      const y0 = padT + plotH - barH;

      const isHighlighted = i === this.highlightedBin;
      const containsSelected = bin.events.some(
        (ev) => ev.commonName === this.selectedName,
      );

      if (isHighlighted || containsSelected) {
        ctx.fillStyle = COLORS_HIGHLIGHT[bin.dominant] ?? COLORS_HIGHLIGHT.BBH;
        ctx.globalAlpha = 0.95;
      } else {
        ctx.fillStyle = COLORS[bin.dominant] ?? COLORS.BBH;
        ctx.globalAlpha = 0.7;
      }

      ctx.beginPath();
      ctx.roundRect(x0, y0, bw, barH, [2, 2, 0, 0]);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isHighlighted || containsSelected) {
        ctx.strokeStyle = STYLE.selectedRing;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x0, y0, bw, barH, [2, 2, 0, 0]);
        ctx.stroke();
      }

      if (barH > 12) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "bold 8px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(bin.events.length), x0 + bw / 2, y0 - 3);
      }
    }

    // ─── Axes labels ──────────────────────────
    ctx.fillStyle = STYLE.text;
    ctx.font = "9px -apple-system, system-ui, sans-serif";

    ctx.textAlign = "center";
    for (let v = -1; v <= 1; v += 0.5) {
      ctx.fillText(v.toFixed(1), toX(v), H - 4);
    }
    ctx.fillStyle = STYLE.label;
    ctx.fillText("χ_eff", padL + plotW / 2, H - 14);

    ctx.fillStyle = STYLE.text;
    ctx.textAlign = "right";
    for (let c = 0; c <= countMax; c += yStep) {
      const y = toY(c);
      if (y > padT + 4 && y < padT + plotH - 4) {
        ctx.fillText(String(c), padL - 4, y + 3);
      }
    }
    ctx.save();
    ctx.fillStyle = STYLE.label;
    ctx.translate(8, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Count", 0, 0);
    ctx.restore();

    // ─── Axes lines ───────────────────────────
    ctx.strokeStyle = STYLE.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.container.remove();
  }
}

// ─── Chirp Mass vs Distance Scatter ──────────────────────────────────────
// Mc on x-axis, luminosity distance on y-axis (log scale).
// Shows selection effects: heavier systems detectable at greater distances.

export class ChirpMassDistanceScatter {
  readonly container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private events: GWEvent[] = [];
  private selectedName: string | null = null;
  private onSelectEvent: ((event: GWEvent) => void) | null = null;
  private resizeObserver: ResizeObserver;
  private viewMode: ViewMode = "explorer";

  private pointPositions: { x: number; y: number; event: GWEvent }[] = [];
  private padL = 44;
  private padR = 12;
  private padT = 10;
  private padB = 28;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "chirp-mass-distance-scatter";
    this.container.style.cssText = "display:none;width:100%;margin-top:12px;";

    const title = document.createElement("div");
    title.style.cssText =
      "font-size:9px;color:rgba(255,255,255,0.4);margin-bottom:4px;font-family:-apple-system,system-ui,sans-serif;";
    title.textContent = "Chirp mass vs luminosity distance";
    this.container.appendChild(title);

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "width:100%;height:200px;display:block;border-radius:6px;cursor:crosshair;";
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.canvas);

    this.canvas.addEventListener("click", (e) => this.handleClick(e));
  }

  setEvents(events: GWEvent[]): void {
    this.events = events;
    this.draw();
  }

  setSelectedEvent(name: string | null): void {
    this.selectedName = name;
    this.draw();
  }

  setOnSelectEvent(cb: (event: GWEvent) => void): void {
    this.onSelectEvent = cb;
  }

  setViewMode(mode: ViewMode): void {
    if (this.viewMode !== mode) {
      this.viewMode = mode;
      this.draw();
    }
  }

  show(): void {
    this.container.style.display = "block";
    this.draw();
  }

  hide(): void {
    this.container.style.display = "none";
  }

  private handleClick(e: MouseEvent): void {
    if (!this.onSelectEvent || this.pointPositions.length === 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let nearest: { event: GWEvent; dist: number } | null = null;
    for (const pp of this.pointPositions) {
      const dx = pp.x - mx;
      const dy = pp.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 12 && (!nearest || dist < nearest.dist)) {
        nearest = { event: pp.event, dist };
      }
    }

    if (nearest) {
      this.onSelectEvent(nearest.event);
    }
  }

  private draw(): void {
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
    const padL = this.padL;
    const padR = this.padR;
    const padT = this.padT;
    const padB = this.padB;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    const valid = this.events.filter(
      (ev) => ev.chirp_mass_source > 0 && ev.luminosity_distance > 0,
    );
    if (valid.length === 0) return;

    let mcMax = 0;
    let dMin = Infinity;
    let dMax = 0;
    for (const ev of valid) {
      if (ev.chirp_mass_source > mcMax) mcMax = ev.chirp_mass_source;
      if (ev.luminosity_distance < dMin) dMin = ev.luminosity_distance;
      if (ev.luminosity_distance > dMax) dMax = ev.luminosity_distance;
    }
    mcMax = Math.ceil(mcMax / 10) * 10 + 10;

    const logDMin = Math.floor(Math.log10(Math.max(dMin, 1)));
    const logDMax = Math.ceil(Math.log10(dMax));
    const logRange = Math.max(logDMax - logDMin, 1);

    const toX = (mc: number) => padL + (mc / mcMax) * plotW;
    const toY = (d: number) => {
      const logD = Math.log10(Math.max(d, 1));
      return padT + plotH - ((logD - logDMin) / logRange) * plotH;
    };

    // ─── Grid ─────────────────────────────────
    ctx.strokeStyle = STYLE.grid;
    ctx.lineWidth = 0.5;

    const xStep = mcMax <= 50 ? 5 : mcMax <= 100 ? 10 : 20;
    for (let m = xStep; m < mcMax; m += xStep) {
      const x = toX(m);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }
    for (let p = logDMin; p <= logDMax; p++) {
      const y = toY(Math.pow(10, p));
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // ─── Selection effect guide line (researcher only) ──────
    if (this.viewMode === "researcher") {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      let first = true;
      const refMc = 30;
      const medianD = valid.reduce((s, ev) => s + ev.luminosity_distance, 0) / valid.length;
      for (let mc = 1; mc <= mcMax; mc += 0.5) {
        const d = medianD * Math.pow(mc / refMc, 5 / 6);
        if (d < Math.pow(10, logDMin) || d > Math.pow(10, logDMax)) {
          first = true;
          continue;
        }
        const x = toX(mc);
        const y = toY(d);
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ─── Data points ──────────────────────────
    this.pointPositions = [];
    const pointRadius = 4;

    const sorted = [...valid].sort((a, b) => {
      if (a.commonName === this.selectedName) return 1;
      if (b.commonName === this.selectedName) return -1;
      return 0;
    });

    for (const ev of sorted) {
      const type = classifyEvent(ev);
      const x = toX(ev.chirp_mass_source);
      const y = toY(ev.luminosity_distance);
      const isSelected = ev.commonName === this.selectedName;

      this.pointPositions.push({ x, y, event: ev });

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, pointRadius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = STYLE.selectedRing;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, pointRadius + 1, 0, Math.PI * 2);
        ctx.fillStyle = COLORS_HIGHLIGHT[type] ?? COLORS_HIGHLIGHT.BBH;
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "bold 8px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(ev.commonName, x + pointRadius + 6, y + 3);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[type] ?? COLORS.BBH;
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // ─── Axes labels ──────────────────────────
    ctx.fillStyle = STYLE.text;
    ctx.font = "9px -apple-system, system-ui, sans-serif";

    ctx.textAlign = "center";
    for (let m = 0; m <= mcMax; m += xStep) {
      ctx.fillText(String(m), toX(m), H - 4);
    }
    ctx.fillStyle = STYLE.label;
    ctx.fillText("Mc (M☉)", padL + plotW / 2, H - 14);

    ctx.fillStyle = STYLE.text;
    ctx.textAlign = "right";
    for (let p = logDMin; p <= logDMax; p++) {
      const y = toY(Math.pow(10, p));
      if (y > padT + 4 && y < padT + plotH - 4) {
        const label = p >= 3 ? `${Math.pow(10, p - 3)}k` : String(Math.pow(10, p));
        ctx.fillText(label, padL - 4, y + 3);
      }
    }
    ctx.save();
    ctx.fillStyle = STYLE.label;
    ctx.translate(8, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("dL (Mpc)", 0, 0);
    ctx.restore();

    // ─── Axes lines ───────────────────────────
    ctx.strokeStyle = STYLE.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.container.remove();
  }
}
