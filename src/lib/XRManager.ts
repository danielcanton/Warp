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
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private teleportMaxDistance = 20;

  // Callbacks
  onSessionStart: (() => void) | null = null;
  onSessionEnd: (() => void) | null = null;
  /** Scene-level hook: fires on trigger press. Return true to consume (skip teleport). */
  onControllerSelectStart: ((origin: THREE.Vector3, direction: THREE.Vector3) => boolean) | null = null;
  /** Scene-level hook: fires on trigger release. */
  onControllerSelectEnd: ((origin: THREE.Vector3, direction: THREE.Vector3) => void) | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;

    // Camera rig for teleport locomotion
    this.cameraRig = new THREE.Group();
    this.cameraRig.name = "xr-camera-rig";
  }

  /** Add camera to the rig and add the rig to the scene. */
  setupCameraRig(camera: THREE.Camera) {
    this.cameraRig.add(camera);
    this.scene.add(this.cameraRig);
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
      (this.controller1 as unknown as EventTarget).addEventListener("selectend", () => this.onSelectEnd(this.controller1!));
    }

    if (this.controller2) {
      this.controller2.add(new THREE.Line(lineGeometry.clone(), lineMaterial.clone()));
      this.scene.add(this.controller2);

      (this.controller2 as unknown as EventTarget).addEventListener("selectstart", () => this.onSelect(this.controller2!));
      (this.controller2 as unknown as EventTarget).addEventListener("selectend", () => this.onSelectEnd(this.controller2!));
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

    // Scene-level select hook
    if (this.onControllerSelectStart) {
      const origin = this.raycaster.ray.origin.clone();
      const direction = this.raycaster.ray.direction.clone();
      if (this.onControllerSelectStart(origin, direction)) return;
    }

    // Teleport: raycast against ground plane
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      if (hit.length() <= this.teleportMaxDistance) {
        this.cameraRig.position.set(hit.x, 0, hit.z);
        if (this.teleportTarget) this.teleportTarget.visible = false;
      }
    }
  }

  private onSelectEnd(controller: THREE.Group) {
    if (!this.onControllerSelectEnd) return;
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
    this.onControllerSelectEnd(
      this.raycaster.ray.origin.clone(),
      this.raycaster.ray.direction.clone(),
    );
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

    let showTeleport = false;
    const hit = new THREE.Vector3();

    // Update pointer hover on panels + teleport target
    for (const controller of [this.controller1, this.controller2]) {
      if (!controller) continue;
      this.tempMatrix.identity().extractRotation(controller.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

      let hitPanel = false;
      for (const panel of this.panels) {
        const intersects = this.raycaster.intersectObject(panel.mesh);
        if (intersects.length > 0) hitPanel = true;
        panel.setHovered(intersects.length > 0);
      }

      // Show teleport ring if pointing at ground and not at a panel
      if (!hitPanel && this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
        if (hit.length() <= this.teleportMaxDistance) {
          showTeleport = true;
          if (this.teleportTarget) {
            this.teleportTarget.position.copy(hit);
            this.teleportTarget.position.y = 0.01;
          }
        }
      }
    }

    if (this.teleportTarget) {
      this.teleportTarget.visible = showTeleport;
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
