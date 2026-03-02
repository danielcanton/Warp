import * as THREE from "three";
import { VRPanel } from "./VRPanel";

const STORAGE_KEY = "warplab-vr-tutorial-seen";

/**
 * Shared VR tutorial that can be attached to any scene.
 * Shows control hints on session start, auto-dismisses after a timeout.
 *
 * Usage:
 *   const tutorial = new VRTutorial();
 *   // In onSessionStart: tutorial.show(camera, scene);
 *   // In onMenuPress:    if (tutorial.dismiss()) return; // consume press
 *   // In onSessionEnd:   tutorial.hide(scene);
 *   // In dispose:        tutorial.dispose(scene);
 */
export class VRTutorial {
  private panel: VRPanel;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.panel = new VRPanel(1.1, 0.7);
  }

  get visible(): boolean {
    return this.panel.visible;
  }

  /** Show the tutorial in front of the camera. Call after a short delay (200ms) from sessionstart. */
  show(camera: THREE.Camera, scene: THREE.Scene) {
    const seen = localStorage.getItem(STORAGE_KEY) === "1";

    if (seen) {
      this.panel.setTitle("Controls");
      this.panel.setLines(["X or L-stick click \u2192 Menu"]);
    } else {
      this.panel.setTitle("Welcome to VR!");
      this.panel.setLines([
        "Left stick: Move",
        "Grip + Left stick: Fly (vertical)",
        "Right stick: Smooth turn",
        "X button or L-stick click: Menu",
        "Trigger: Select / Teleport",
      ]);
    }

    camera.updateWorldMatrix(true, false);
    this.panel.show();
    scene.add(this.panel.mesh);
    this.panel.positionInFront(camera, 2, 0);

    const duration = seen ? 3000 : 8000;
    this.timeout = setTimeout(() => {
      this.hideInternal(scene);
      if (!seen) localStorage.setItem(STORAGE_KEY, "1");
    }, duration);
  }

  /** Dismiss on menu press. Returns true if the tutorial was visible (consumed the press). */
  dismiss(): boolean {
    if (!this.panel.visible) return false;
    localStorage.setItem(STORAGE_KEY, "1");
    // We need the scene to remove the mesh — caller should call hide() too
    this.clearTimeout();
    this.panel.hide();
    return true;
  }

  /** Hide and remove from scene. Call on sessionend. */
  hide(scene: THREE.Scene) {
    this.hideInternal(scene);
  }

  /** Full cleanup. Call on scene dispose. */
  dispose(scene: THREE.Scene) {
    this.clearTimeout();
    this.panel.hide();
    scene.remove(this.panel.mesh);
    this.panel.dispose();
  }

  private hideInternal(scene: THREE.Scene) {
    this.clearTimeout();
    if (!this.panel.visible) return;
    this.panel.hide();
    setTimeout(() => scene.remove(this.panel.mesh), 100);
  }

  private clearTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}
