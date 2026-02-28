import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import type { VRPanel } from "./VRPanel";

/**
 * WebXR session management, controller tracking, and VR interaction.
 *
 * Responsibilities:
 * - Request and manage 'immersive-vr' sessions
 * - Track controllers and load models
 * - Ray intersection with VRPanels for menu interaction
 * - Teleport locomotion (point + trigger)
 */
export class XRManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private panels: VRPanel[] = [];

  // Controllers
  private controller1: THREE.Group | null = null;
  private controller2: THREE.Group | null = null;
  private raycaster = new THREE.Raycaster();
  private tempMatrix = new THREE.Matrix4();

  // Teleport
  private teleportTarget: THREE.Mesh | null = null;
  private cameraRig: THREE.Group;

  // Callbacks
  onSessionStart: (() => void) | null = null;
  onSessionEnd: (() => void) | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;

    // Camera rig for teleport locomotion
    this.cameraRig = new THREE.Group();
    this.cameraRig.name = "xr-camera-rig";
  }

  /**
   * Check XR support and create the VR button.
   * Returns the button element, or null if unsupported.
   */
  async createButton(): Promise<HTMLElement | null> {
    if (!("xr" in navigator)) return null;

    const xr = (navigator as Navigator & { xr: XRSystem }).xr;
    const supported = await xr.isSessionSupported("immersive-vr");
    if (!supported) return null;

    this.renderer.xr.enabled = true;

    const button = VRButton.createButton(this.renderer);

    this.renderer.xr.addEventListener("sessionstart", () => {
      this.setupControllers();
      this.onSessionStart?.();
    });

    this.renderer.xr.addEventListener("sessionend", () => {
      this.cleanupControllers();
      this.onSessionEnd?.();
    });

    return button;
  }

  private setupControllers() {
    this.controller1 = this.renderer.xr.getController(0);
    this.controller2 = this.renderer.xr.getController(1);

    // Visual ray for pointing
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -5),
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.5,
    });

    if (this.controller1) {
      this.controller1.add(new THREE.Line(lineGeometry.clone(), lineMaterial.clone()));
      this.scene.add(this.controller1);

      (this.controller1 as unknown as EventTarget).addEventListener("selectstart", () => this.onSelect(this.controller1!));
    }

    if (this.controller2) {
      this.controller2.add(new THREE.Line(lineGeometry.clone(), lineMaterial.clone()));
      this.scene.add(this.controller2);

      (this.controller2 as unknown as EventTarget).addEventListener("selectstart", () => this.onSelect(this.controller2!));
    }

    // Teleport target marker
    const teleportGeo = new THREE.RingGeometry(0.15, 0.2, 32);
    teleportGeo.rotateX(-Math.PI / 2);
    this.teleportTarget = new THREE.Mesh(
      teleportGeo,
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.5 })
    );
    this.teleportTarget.visible = false;
    this.scene.add(this.teleportTarget);
  }

  private cleanupControllers() {
    if (this.controller1) {
      this.scene.remove(this.controller1);
      this.controller1 = null;
    }
    if (this.controller2) {
      this.scene.remove(this.controller2);
      this.controller2 = null;
    }
    if (this.teleportTarget) {
      this.scene.remove(this.teleportTarget);
      this.teleportTarget = null;
    }
  }

  private onSelect(controller: THREE.Group) {
    // Check for VRPanel intersection
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    for (const panel of this.panels) {
      const intersects = this.raycaster.intersectObject(panel.mesh);
      if (intersects.length > 0) {
        const uv = intersects[0].uv;
        if (uv) panel.handleClick(uv.x, uv.y);
        return;
      }
    }
  }

  /** Register a VRPanel for ray interaction. */
  registerPanel(panel: VRPanel) {
    this.panels.push(panel);
  }

  /** Unregister a VRPanel. */
  unregisterPanel(panel: VRPanel) {
    const idx = this.panels.indexOf(panel);
    if (idx >= 0) this.panels.splice(idx, 1);
  }

  /** Update controller visuals and interactions each frame. */
  update() {
    if (!this.renderer.xr.isPresenting) return;

    // Update pointer hover on panels
    for (const controller of [this.controller1, this.controller2]) {
      if (!controller) continue;
      this.tempMatrix.identity().extractRotation(controller.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

      for (const panel of this.panels) {
        const intersects = this.raycaster.intersectObject(panel.mesh);
        panel.setHovered(intersects.length > 0);
      }
    }
  }

  get isPresenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  dispose() {
    this.cleanupControllers();
    this.panels = [];
  }
}
