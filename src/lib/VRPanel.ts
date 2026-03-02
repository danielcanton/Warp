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
 * Canvas is 512x512 by default and re-rendered when content changes.
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
    resolution = 512,
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

  /** Redraw the canvas. */
  private render() {
    const { cx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    // Background
    cx.clearRect(0, 0, w, h);
    cx.fillStyle = this._hovered
      ? "rgba(0, 0, 5, 0.85)"
      : "rgba(0, 0, 5, 0.75)";
    cx.beginPath();
    cx.roundRect(0, 0, w, h, 16);
    cx.fill();

    // Border
    cx.strokeStyle = this._hovered
      ? "rgba(99, 102, 241, 0.4)"
      : "rgba(255, 255, 255, 0.08)";
    cx.lineWidth = 2;
    cx.stroke();

    // Title
    if (this.title) {
      cx.fillStyle = "#fff";
      cx.font = `600 ${Math.round(w * 0.06)}px -apple-system, system-ui, sans-serif`;
      cx.fillText(this.title, w * 0.06, h * 0.12);
    }

    // Body text
    cx.fillStyle = "rgba(255, 255, 255, 0.6)";
    cx.font = `400 ${Math.round(w * 0.04)}px -apple-system, system-ui, sans-serif`;
    for (let i = 0; i < this.lines.length; i++) {
      cx.fillText(this.lines[i], w * 0.06, h * 0.22 + i * w * 0.055);
    }

    // Buttons
    for (const btn of this.buttons) {
      const bx = btn.x * w;
      const by = btn.y * h;
      const bw = btn.w * w;
      const bh = btn.h * h;

      cx.fillStyle = "rgba(99, 102, 241, 0.2)";
      cx.strokeStyle = "rgba(99, 102, 241, 0.4)";
      cx.lineWidth = 1;
      cx.beginPath();
      cx.roundRect(bx, by, bw, bh, 8);
      cx.fill();
      cx.stroke();

      cx.fillStyle = "#a5b4fc";
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
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const pos = camera.position.clone().add(dir.multiplyScalar(distance));
    pos.y += yOffset;
    this.mesh.position.copy(pos);
    this.mesh.lookAt(camera.position);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshBasicMaterial).dispose();
    this.texture.dispose();
  }
}
