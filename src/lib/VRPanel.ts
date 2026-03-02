import * as THREE from "three";

export interface VRPanelButton {
  label: string;
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  w: number; // normalized width
  h: number; // normalized height
  onClick: () => void;
}

/**
 * World-space UI panel rendered via CanvasTexture on a quad.
 *
 * Used in VR mode as a replacement for DOM overlays.
 * Canvas is 1024px wide by default for crisp VR readability.
 * Holographic sci-fi render style with glow effects and scan lines.
 */
export class VRPanel {
  readonly mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private buttons: VRPanelButton[] = [];
  private _hovered = false;

  private title = "";
  private lines: string[] = [];

  constructor(
    width = 1.2,
    height = 0.8,
    resolution = 1024,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = resolution;
    this.canvas.height = Math.floor(resolution * (height / width));
    this.cx = this.canvas.getContext("2d")!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
    });

    const geometry = new THREE.PlaneGeometry(width, height);
    this.mesh = new THREE.Mesh(geometry, material);
  }

  /** Set the title displayed at the top of the panel. */
  setTitle(title: string) {
    this.title = title;
    this.render();
  }

  /** Set body text lines. */
  setLines(lines: string[]) {
    this.lines = lines;
    this.render();
  }

  /** Add an interactive button region. */
  addButton(button: VRPanelButton) {
    this.buttons.push(button);
    this.render();
  }

  /** Clear all buttons. */
  clearButtons() {
    this.buttons = [];
    this.render();
  }

  /** Update a button's label by index and re-render. */
  updateButton(index: number, label: string) {
    if (index >= 0 && index < this.buttons.length) {
      this.buttons[index].label = label;
      this.render();
    }
  }

  /** Called by XRManager when a controller ray intersects this panel. */
  handleClick(u: number, v: number) {
    // UV coordinates: u = 0..1 left-right, v = 0..1 bottom-top
    const x = u;
    const y = 1 - v; // flip to top-down

    for (const btn of this.buttons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        btn.onClick();
        return;
      }
    }
  }

  /** Visual hover feedback. */
  setHovered(hovered: boolean) {
    if (this._hovered !== hovered) {
      this._hovered = hovered;
      this.render();
    }
  }

  /** Redraw the canvas with holographic sci-fi style. */
  private render() {
    const { cx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const hovered = this._hovered;

    cx.clearRect(0, 0, w, h);

    // ── Background: dark translucent gradient ──
    const bgGrad = cx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, hovered ? "rgba(8, 15, 40, 0.88)" : "rgba(5, 10, 30, 0.82)");
    bgGrad.addColorStop(1, hovered ? "rgba(2, 6, 18, 0.92)" : "rgba(1, 3, 12, 0.88)");
    cx.beginPath();
    cx.roundRect(0, 0, w, h, 12);
    cx.fillStyle = bgGrad;
    cx.fill();

    // ── Border glow ──
    cx.save();
    cx.shadowColor = hovered ? "rgba(103, 232, 249, 0.6)" : "rgba(99, 102, 241, 0.35)";
    cx.shadowBlur = hovered ? 18 : 10;
    cx.strokeStyle = hovered ? "rgba(103, 232, 249, 0.7)" : "rgba(99, 130, 241, 0.4)";
    cx.lineWidth = 2;
    cx.stroke();
    cx.restore();

    // ── Corner brackets (HUD accent) ──
    const bracketLen = Math.round(w * 0.06);
    const bracketInset = 6;
    cx.strokeStyle = hovered ? "rgba(103, 232, 249, 0.8)" : "rgba(103, 232, 249, 0.45)";
    cx.lineWidth = 2;
    // Top-left
    cx.beginPath();
    cx.moveTo(bracketInset, bracketInset + bracketLen);
    cx.lineTo(bracketInset, bracketInset);
    cx.lineTo(bracketInset + bracketLen, bracketInset);
    cx.stroke();
    // Top-right
    cx.beginPath();
    cx.moveTo(w - bracketInset - bracketLen, bracketInset);
    cx.lineTo(w - bracketInset, bracketInset);
    cx.lineTo(w - bracketInset, bracketInset + bracketLen);
    cx.stroke();
    // Bottom-left
    cx.beginPath();
    cx.moveTo(bracketInset, h - bracketInset - bracketLen);
    cx.lineTo(bracketInset, h - bracketInset);
    cx.lineTo(bracketInset + bracketLen, h - bracketInset);
    cx.stroke();
    // Bottom-right
    cx.beginPath();
    cx.moveTo(w - bracketInset - bracketLen, h - bracketInset);
    cx.lineTo(w - bracketInset, h - bracketInset);
    cx.lineTo(w - bracketInset, h - bracketInset - bracketLen);
    cx.stroke();

    // ── Scan lines ──
    cx.fillStyle = "rgba(103, 232, 249, 0.03)";
    for (let y = 0; y < h; y += 4) {
      cx.fillRect(0, y, w, 1);
    }

    // ── Title with glow ──
    const margin = w * 0.06;
    const maxTextWidth = w - margin * 2;

    if (this.title) {
      cx.save();
      cx.shadowColor = "rgba(103, 232, 249, 0.7)";
      cx.shadowBlur = 12;
      cx.fillStyle = "#67e8f9";
      cx.font = `600 ${Math.round(w * 0.06)}px -apple-system, system-ui, sans-serif`;
      cx.fillText(this.title, margin, h * 0.12, maxTextWidth);
      cx.restore();
    }

    // ── Body text ──
    cx.fillStyle = "rgba(186, 230, 253, 0.7)";
    cx.font = `400 ${Math.round(w * 0.04)}px -apple-system, system-ui, sans-serif`;
    for (let i = 0; i < this.lines.length; i++) {
      cx.fillText(this.lines[i], margin, h * 0.22 + i * w * 0.055, maxTextWidth);
    }

    // ── Buttons: outlined with glow ──
    for (const btn of this.buttons) {
      const bx = btn.x * w;
      const by = btn.y * h;
      const bw = btn.w * w;
      const bh = btn.h * h;

      cx.save();
      cx.shadowColor = hovered ? "rgba(103, 232, 249, 0.5)" : "rgba(99, 102, 241, 0.3)";
      cx.shadowBlur = hovered ? 10 : 6;

      // Outlined button (not filled)
      cx.fillStyle = hovered ? "rgba(103, 232, 249, 0.08)" : "rgba(99, 102, 241, 0.06)";
      cx.strokeStyle = hovered ? "rgba(103, 232, 249, 0.6)" : "rgba(99, 130, 241, 0.4)";
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.roundRect(bx, by, bw, bh, 6);
      cx.fill();
      cx.stroke();
      cx.restore();

      // Button label
      cx.fillStyle = hovered ? "#67e8f9" : "#a5b4fc";
      cx.font = `500 ${Math.round(w * 0.035)}px -apple-system, system-ui, sans-serif`;
      const textWidth = cx.measureText(btn.label).width;
      cx.fillText(btn.label, bx + (bw - textWidth) / 2, by + bh * 0.65);
    }

    this.texture.needsUpdate = true;
  }

  /** Whether the panel is currently visible. */
  get visible(): boolean {
    return this.mesh.visible;
  }

  /** Show the panel. */
  show() {
    this.mesh.visible = true;
  }

  /** Hide the panel. */
  hide() {
    this.mesh.visible = false;
  }

  /** Toggle visibility. Returns new visible state. */
  toggle(): boolean {
    this.mesh.visible = !this.mesh.visible;
    return this.mesh.visible;
  }

  /** Position the panel in world space relative to the user. */
  positionInFront(camera: THREE.Camera, distance = 2, yOffset = 0) {
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    camera.getWorldPosition(worldPos);
    camera.getWorldQuaternion(worldQuat);

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat);
    const lookTarget = worldPos.clone();
    const pos = worldPos.add(dir.multiplyScalar(distance));
    pos.y += yOffset;
    this.mesh.position.copy(pos);
    this.mesh.lookAt(lookTarget);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshBasicMaterial).dispose();
    this.texture.dispose();
  }
}
