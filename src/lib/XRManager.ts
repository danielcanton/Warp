import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import type { VRPanel } from "./VRPanel";

/**
 * WebXR session management, controller tracking, hand tracking, and VR interaction.
 *
 * Responsibilities:
 * - Request and manage 'immersive-vr' sessions
 * - Track controllers and load models
 * - Detect Quest 3 hand tracking and pinch gestures
 * - Ray intersection with VRPanels for menu interaction
 * - Teleport locomotion (point + trigger / pinch)
 * - Seamless fallback between hands and controllers
 */
export class XRManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private panels: VRPanel[] = [];

  // Controllers
  private controller1: THREE.Group | null = null;
  private controller2: THREE.Group | null = null;
  private controllerRay1: THREE.Line | null = null;
  private controllerRay2: THREE.Line | null = null;
  private raycaster = new THREE.Raycaster();
  private tempMatrix = new THREE.Matrix4();

  // Hand tracking
  private hand1: THREE.Group | null = null;
  private hand2: THREE.Group | null = null;
  private handJoints1: THREE.Group | null = null;
  private handJoints2: THREE.Group | null = null;
  private handRay1: THREE.Line | null = null;
  private handRay2: THREE.Line | null = null;
  private prevPinch1 = false;
  private prevPinch2 = false;
  private static readonly PINCH_THRESHOLD = 0.02; // 2cm

  // Input mode
  private usingHands = false;

  // Teleport
  private teleportTarget: THREE.Mesh | null = null;
  private cameraRig: THREE.Group;
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private teleportMaxDistance = 20;

  // Locomotion & snap turn
  private static readonly DEAD_ZONE = 0.15;
  private static readonly MOVE_SPEED = 2.0; // m/s
  private static readonly SNAP_ANGLE = Math.PI / 4; // 45°
  private static readonly SNAP_COOLDOWN = 0.3; // seconds
  private snapCooldownTimer = 0;
  private prevLeftThumbstickPressed = false;
  private prevLeftXButtonPressed = false;
  private clock = new THREE.Clock();

  // Callbacks
  onSessionStart: (() => void) | null = null;
  onSessionEnd: (() => void) | null = null;
  /** Scene-level hook: fires on trigger press. Return true to consume (skip teleport). */
  onControllerSelectStart: ((origin: THREE.Vector3, direction: THREE.Vector3) => boolean) | null = null;
  /** Scene-level hook: fires on trigger release. */
  onControllerSelectEnd: ((origin: THREE.Vector3, direction: THREE.Vector3) => void) | null = null;
  /** Fires on left thumbstick press (rising edge). */
  onMenuPress: (() => void) | null = null;

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
      this.setupHands();
      this.onSessionStart?.();
    });

    this.renderer.xr.addEventListener("sessionend", () => {
      this.cleanupControllers();
      this.cleanupHands();
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
      this.controllerRay1 = new THREE.Line(lineGeometry.clone(), lineMaterial.clone());
      this.controller1.add(this.controllerRay1);
      this.cameraRig.add(this.controller1);

      (this.controller1 as unknown as EventTarget).addEventListener("selectstart", () => this.onSelect(this.controller1!));
      (this.controller1 as unknown as EventTarget).addEventListener("selectend", () => this.onSelectEnd(this.controller1!));
    }

    if (this.controller2) {
      this.controllerRay2 = new THREE.Line(lineGeometry.clone(), lineMaterial.clone());
      this.controller2.add(this.controllerRay2);
      this.cameraRig.add(this.controller2);

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
    this.cameraRig.add(this.teleportTarget);
  }

  private setupHands() {
    this.hand1 = this.renderer.xr.getHand(0);
    this.hand2 = this.renderer.xr.getHand(1);

    // Joint visualization containers
    this.handJoints1 = this.createJointVisualization();
    this.handJoints2 = this.createJointVisualization();

    // Hand pointing rays (index finger direction)
    const handRayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -5),
    ]);
    const handRayMat = new THREE.LineBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.4,
    });
    this.handRay1 = new THREE.Line(handRayGeo.clone(), handRayMat.clone());
    this.handRay2 = new THREE.Line(handRayGeo.clone(), handRayMat.clone());
    this.handRay1.visible = false;
    this.handRay2.visible = false;

    if (this.hand1) this.scene.add(this.hand1);
    if (this.hand2) this.scene.add(this.hand2);
    this.scene.add(this.handJoints1);
    this.scene.add(this.handJoints2);
    this.scene.add(this.handRay1);
    this.scene.add(this.handRay2);
  }

  /** Create a group of small spheres to visualize hand joints. */
  private createJointVisualization(): THREE.Group {
    const group = new THREE.Group();
    group.visible = false;
    const jointGeo = new THREE.SphereGeometry(0.005, 8, 8);
    const jointMat = new THREE.MeshBasicMaterial({
      color: 0xa5b4fc,
      transparent: true,
      opacity: 0.6,
    });
    // 25 joints in XRHand
    for (let i = 0; i < 25; i++) {
      group.add(new THREE.Mesh(jointGeo, jointMat));
    }
    return group;
  }

  private cleanupControllers() {
    if (this.controller1) {
      this.cameraRig.remove(this.controller1);
      this.controller1 = null;
      this.controllerRay1 = null;
    }
    if (this.controller2) {
      this.cameraRig.remove(this.controller2);
      this.controller2 = null;
      this.controllerRay2 = null;
    }
    if (this.teleportTarget) {
      this.cameraRig.remove(this.teleportTarget);
      this.teleportTarget = null;
    }
    this.snapCooldownTimer = 0;
    this.prevLeftThumbstickPressed = false;
    this.prevLeftXButtonPressed = false;
  }

  private cleanupHands() {
    if (this.hand1) {
      this.scene.remove(this.hand1);
      this.hand1 = null;
    }
    if (this.hand2) {
      this.scene.remove(this.hand2);
      this.hand2 = null;
    }
    if (this.handJoints1) {
      this.scene.remove(this.handJoints1);
      this.handJoints1 = null;
    }
    if (this.handJoints2) {
      this.scene.remove(this.handJoints2);
      this.handJoints2 = null;
    }
    if (this.handRay1) {
      this.scene.remove(this.handRay1);
      this.handRay1 = null;
    }
    if (this.handRay2) {
      this.scene.remove(this.handRay2);
      this.handRay2 = null;
    }
    this.prevPinch1 = false;
    this.prevPinch2 = false;
    this.usingHands = false;
  }

  private onSelect(controller: THREE.Group) {
    // Ignore controller select events when using hands
    if (this.usingHands) return;

    this.performSelect(controller);
  }

  /**
   * Perform a select action using a ray derived from the given object's
   * matrixWorld (works for controllers).
   */
  private performSelect(source: THREE.Group) {
    this.tempMatrix.identity().extractRotation(source.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(source.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    for (const panel of this.panels) {
      if (!panel.visible) continue;
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

  // Reusable vectors to avoid per-frame allocations
  private readonly _thumbTip = new THREE.Vector3();
  private readonly _indexTip = new THREE.Vector3();
  private readonly _indexBase = new THREE.Vector3();
  private readonly _rayDir = new THREE.Vector3();

  /**
   * Detect active input sources and determine whether hands or controllers
   * are in use. Called at the start of each update().
   */
  private detectInputMode() {
    const session = this.renderer.xr.getSession();
    if (!session) return;

    let hasHand = false;
    let hasController = false;
    for (const source of session.inputSources) {
      if (source.hand) hasHand = true;
      else if (source.gamepad) hasController = true;
    }

    // Seamless switching: prefer hands when available
    if (hasHand && !hasController) {
      this.usingHands = true;
    } else if (hasController && !hasHand) {
      this.usingHands = false;
    }
    // If both somehow present, keep current mode

    // Toggle visibility
    if (this.controllerRay1) this.controllerRay1.visible = !this.usingHands;
    if (this.controllerRay2) this.controllerRay2.visible = !this.usingHands;
    if (this.handJoints1) this.handJoints1.visible = this.usingHands;
    if (this.handJoints2) this.handJoints2.visible = this.usingHands;
    if (this.handRay1) this.handRay1.visible = this.usingHands;
    if (this.handRay2) this.handRay2.visible = this.usingHands;
  }

  /**
   * Read joint positions from an XRHand, update joint visualization,
   * compute pinch state, and return the index finger ray.
   * Returns null if hand data is not available.
   */
  private updateHandState(
    handIndex: number,
    jointsGroup: THREE.Group,
    handRay: THREE.Line,
  ): { pinching: boolean; rayOrigin: THREE.Vector3; rayDirection: THREE.Vector3 } | null {
    const session = this.renderer.xr.getSession();
    if (!session) return null;

    const refSpace = this.renderer.xr.getReferenceSpace();
    const frame = this.renderer.xr.getFrame() as XRFrame | null;
    if (!frame || !refSpace) return null;

    // Find the hand input source by handedness
    let handSource: XRInputSource | null = null;
    for (const source of session.inputSources) {
      if (source.hand && source.handedness === (handIndex === 0 ? "left" : "right")) {
        handSource = source;
        break;
      }
    }
    // Fallback: take any hand by index order
    if (!handSource) {
      let idx = 0;
      for (const source of session.inputSources) {
        if (source.hand) {
          if (idx === handIndex) { handSource = source; break; }
          idx++;
        }
      }
    }

    if (!handSource || !handSource.hand) return null;

    const hand = handSource.hand;

    const jointNames = [
      "wrist",
      "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip",
      "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip",
      "middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip",
      "ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip",
      "pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip",
    ];

    let gotThumbTip = false;
    let gotIndexTip = false;
    let gotIndexBase = false;
    let jointIdx = 0;

    for (const jointName of jointNames) {
      const joint = hand.get(jointName as XRHandJoint);
      if (!joint) { jointIdx++; continue; }

      const pose = frame.getJointPose?.(joint, refSpace);
      if (!pose) { jointIdx++; continue; }

      const pos = pose.transform.position;

      // Update joint sphere position
      if (jointIdx < jointsGroup.children.length) {
        jointsGroup.children[jointIdx].position.set(pos.x, pos.y, pos.z);
        const r = pose.radius ?? 0.005;
        jointsGroup.children[jointIdx].scale.setScalar(r / 0.005);
      }

      if (jointName === "thumb-tip") {
        this._thumbTip.set(pos.x, pos.y, pos.z);
        gotThumbTip = true;
      }
      if (jointName === "index-finger-tip") {
        this._indexTip.set(pos.x, pos.y, pos.z);
        gotIndexTip = true;
      }
      if (jointName === "index-finger-phalanx-proximal") {
        this._indexBase.set(pos.x, pos.y, pos.z);
        gotIndexBase = true;
      }

      jointIdx++;
    }

    if (!gotThumbTip || !gotIndexTip || !gotIndexBase) return null;

    // Pinch detection: thumb tip to index tip distance
    const pinching = this._thumbTip.distanceTo(this._indexTip) < XRManager.PINCH_THRESHOLD;

    // Index finger ray: from proximal knuckle through tip
    this._rayDir.copy(this._indexTip).sub(this._indexBase).normalize();

    // Update hand ray line in world space
    const positions = (handRay.geometry as THREE.BufferGeometry).getAttribute("position") as THREE.BufferAttribute;
    positions.setXYZ(0, this._indexTip.x, this._indexTip.y, this._indexTip.z);
    positions.setXYZ(
      1,
      this._indexTip.x + this._rayDir.x * 5,
      this._indexTip.y + this._rayDir.y * 5,
      this._indexTip.z + this._rayDir.z * 5,
    );
    positions.needsUpdate = true;

    return {
      pinching,
      rayOrigin: this._indexTip.clone(),
      rayDirection: this._rayDir.clone(),
    };
  }

  /** Update controller visuals and interactions each frame. */
  update() {
    if (!this.renderer.xr.isPresenting) return;

    this.detectInputMode();

    if (this.usingHands) {
      this.updateHands();
    } else {
      this.updateControllers();
    }
  }

  private updateControllers() {
    const dt = this.clock.getDelta();
    let showTeleport = false;
    const hit = new THREE.Vector3();

    // Find gamepads by handedness
    const session = this.renderer.xr.getSession();
    let leftGamepad: Gamepad | null = null;
    let rightGamepad: Gamepad | null = null;
    if (session) {
      for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        if (source.handedness === "left") leftGamepad = source.gamepad;
        else if (source.handedness === "right") rightGamepad = source.gamepad;
      }
    }

    // ── Left stick: smooth locomotion ──
    if (leftGamepad && leftGamepad.axes.length >= 4) {
      const lx = leftGamepad.axes[2]; // strafe
      const ly = leftGamepad.axes[3]; // forward/back

      if (Math.abs(lx) > XRManager.DEAD_ZONE || Math.abs(ly) > XRManager.DEAD_ZONE) {
        // Head-relative movement on XZ plane
        const camera = this.renderer.xr.getCamera();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0;
        right.normalize();

        const moveX = Math.abs(lx) > XRManager.DEAD_ZONE ? lx : 0;
        const moveZ = Math.abs(ly) > XRManager.DEAD_ZONE ? ly : 0;

        this.cameraRig.position.addScaledVector(right, moveX * XRManager.MOVE_SPEED * dt);
        this.cameraRig.position.addScaledVector(forward, -moveZ * XRManager.MOVE_SPEED * dt);
      }

      // Left stick press → menu toggle (rising edge)
      const thumbstickPressed = leftGamepad.buttons.length > 3 && leftGamepad.buttons[3].pressed;
      if (thumbstickPressed && !this.prevLeftThumbstickPressed) {
        this.onMenuPress?.();
      }
      this.prevLeftThumbstickPressed = thumbstickPressed;

      // X button (buttons[4]) → menu toggle (rising edge)
      const xButtonPressed = leftGamepad.buttons.length > 4 && leftGamepad.buttons[4].pressed;
      if (xButtonPressed && !this.prevLeftXButtonPressed) {
        this.onMenuPress?.();
      }
      this.prevLeftXButtonPressed = xButtonPressed;
    }

    // ── Right stick: snap turn ──
    if (this.snapCooldownTimer > 0) {
      this.snapCooldownTimer -= dt;
    }

    if (rightGamepad && rightGamepad.axes.length >= 4) {
      const rx = rightGamepad.axes[2];
      if (Math.abs(rx) > XRManager.DEAD_ZONE && this.snapCooldownTimer <= 0) {
        const angle = rx > 0 ? -XRManager.SNAP_ANGLE : XRManager.SNAP_ANGLE;
        this.cameraRig.rotateY(angle);
        this.snapCooldownTimer = XRManager.SNAP_COOLDOWN;
      }
    }

    // ── Panel hover + teleport preview ──
    for (const controller of [this.controller1, this.controller2]) {
      if (!controller) continue;
      this.tempMatrix.identity().extractRotation(controller.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

      let hitPanel = false;
      for (const panel of this.panels) {
        if (!panel.visible) continue;
        const intersects = this.raycaster.intersectObject(panel.mesh);
        if (intersects.length > 0) hitPanel = true;
        panel.setHovered(intersects.length > 0);
      }

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

  private updateHands() {
    let showTeleport = false;
    const hit = new THREE.Vector3();

    const handConfigs = [
      { index: 0, joints: this.handJoints1, ray: this.handRay1, prevPinchKey: "prevPinch1" as const },
      { index: 1, joints: this.handJoints2, ray: this.handRay2, prevPinchKey: "prevPinch2" as const },
    ];

    for (const cfg of handConfigs) {
      if (!cfg.joints || !cfg.ray) continue;

      const state = this.updateHandState(cfg.index, cfg.joints, cfg.ray);
      if (!state) {
        cfg.joints.visible = false;
        cfg.ray.visible = false;
        continue;
      }

      cfg.joints.visible = true;
      cfg.ray.visible = true;

      // Set up raycaster from index finger
      this.raycaster.ray.origin.copy(state.rayOrigin);
      this.raycaster.ray.direction.copy(state.rayDirection);

      // Hover panels
      let hitPanel = false;
      for (const panel of this.panels) {
        if (!panel.visible) continue;
        const intersects = this.raycaster.intersectObject(panel.mesh);
        if (intersects.length > 0) hitPanel = true;
        panel.setHovered(intersects.length > 0);
      }

      // Pinch just started -> trigger select
      const wasPinching = this[cfg.prevPinchKey];
      if (state.pinching && !wasPinching) {
        this.performHandSelect(state.rayOrigin, state.rayDirection);
      }
      this[cfg.prevPinchKey] = state.pinching;

      // Teleport preview
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

  /** Perform a select action from hand ray origin and direction. */
  private performHandSelect(origin: THREE.Vector3, direction: THREE.Vector3) {
    this.raycaster.ray.origin.copy(origin);
    this.raycaster.ray.direction.copy(direction);

    for (const panel of this.panels) {
      if (!panel.visible) continue;
      const intersects = this.raycaster.intersectObject(panel.mesh);
      if (intersects.length > 0) {
        const uv = intersects[0].uv;
        if (uv) panel.handleClick(uv.x, uv.y);
        return;
      }
    }

    // Teleport
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      if (hit.length() <= this.teleportMaxDistance) {
        this.cameraRig.position.set(hit.x, 0, hit.z);
        if (this.teleportTarget) this.teleportTarget.visible = false;
      }
    }
  }

  /** Pulse haptic actuators on all active gamepads. No-op for hands or intensity ≤ 0. */
  pulseHaptics(intensity: number, duration = 16) {
    if (intensity <= 0 || this.usingHands) return;
    const session = this.renderer.xr.getSession();
    if (!session) return;
    for (const source of session.inputSources) {
      const actuator = source.gamepad?.hapticActuators?.[0] as
        | { pulse(value: number, duration: number): void }
        | undefined;
      actuator?.pulse(intensity, duration);
    }
  }

  get cameraRigPosition(): THREE.Vector3 {
    return this.cameraRig.position;
  }

  get isPresenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  dispose() {
    this.cleanupControllers();
    this.cleanupHands();
    this.panels = [];
  }
}
