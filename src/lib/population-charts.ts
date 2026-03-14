// ─── Population Scatter Plot ──────────────────────────────────────────
// Canvas2D m1 vs m2 scatter plot for the Stats tab in the event list panel.
// Follows the NoiseCurvePlot pattern: HiDPI canvas, container div, show/hide.

import { classifyEvent, type GWEvent } from "./waveform";

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

  dispose(): void {
    this.resizeObserver.disconnect();
    this.container.remove();
  }
}
