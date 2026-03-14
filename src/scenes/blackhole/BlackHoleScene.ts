import * as THREE from "three";
import type { Scene, SceneContext } from "../types";
import { getViewMode, onViewModeChange, type ViewMode } from "../../lib/view-mode";
import { blackholeEquations } from "../../lib/equation-data";
import { buildEquationsSection, updateEquationValues, removeEquationsSection } from "../../lib/equations";
import { VRPanel } from "../../lib/VRPanel";
import { VRTutorial } from "../../lib/vr-tutorial";
import { integrateGeodesic, type GeodesicResult } from "../../lib/geodesic";
import vertexShader from "../../shaders/blackhole.vert.glsl?raw";
import fragmentShader from "../../shaders/blackhole.frag.glsl?raw";
import vrVertexShader from "../../shaders/blackhole-vr.vert.glsl?raw";
import vrFragmentShader from "../../shaders/blackhole-vr.frag.glsl?raw";

export class BlackHoleScene implements Scene {
  readonly id = "blackhole";
  readonly label = "Black Hole";
  readonly supportsXR = true;

  private ctx!: SceneContext;
  private quad!: THREE.Mesh;
  private bhMaterial!: THREE.ShaderMaterial;
  private orbitCamera!: THREE.PerspectiveCamera; // Independent camera for orbiting
  private panelEl: HTMLElement | null = null;

  // VR mode — inverted sphere skybox
  private vrSphere!: THREE.Mesh;
  private vrMaterial!: THREE.ShaderMaterial;
  private vrPanel: VRPanel | null = null;
  private vrTutorial: VRTutorial | null = null;
  private wasPresenting = false;

  // Interaction state
  private isDragging = false;
  private prevMouse = new THREE.Vector2();
  private spherical = new THREE.Spherical(15, Math.PI / 2.2, 0);
  private targetSpherical = new THREE.Spherical(15, Math.PI / 2.2, 0);
  private mass = 1.5; // Schwarzschild radius scale
  private spin = 0; // Kerr spin parameter a/M (0 to 0.998)
  private showDisk = true;
  private elapsed = 0;
  private pinchStartDist = 0; // for pinch-zoom

  // Starfield texture state
  private useStarfield = false;
  private starfieldTexture: THREE.Texture | null = null;

  // AR mode state
  private arModeActive = false;
  private cameraStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private videoTexture: THREE.CanvasTexture | null = null;
  private arCanvas: HTMLCanvasElement | null = null;
  private arCtx: CanvasRenderingContext2D | null = null;
  private arCheckbox: HTMLInputElement | null = null;
  private invCameraMatrix = new THREE.Matrix4();

  // VR passthrough state
  private passthroughActive = false;
  private hasCameraAccess = false;
  private bhWorldPosition = new THREE.Vector3(0, 1.2, -2); // 2m in front, chest height
  private grabbing = false;
  private grabControllerIndex = -1;
  private grabOffset = new THREE.Vector3();
  private savedBackground: THREE.Color | THREE.Texture | null = null;
  private vrSphereOriginalGeo: THREE.BufferGeometry | null = null;
  private modeButtonIndex = -1; // VR panel button index for passthrough/skybox toggle

  // Geodesic mode state
  private geodesicMode = false;
  private geodesicGroup!: THREE.Group;
  private bhHorizonMesh!: THREE.Mesh;
  private photonSphereRing!: THREE.Line;
  private iscoRing!: THREE.Line;
  private geodesicTrails: THREE.Line[] = [];
  private activeTrail: { line: THREE.Line; points: THREE.Vector3[]; index: number; result: GeodesicResult } | null = null;
  private launchIndicator: THREE.ArrowHelper | null = null;
  private geodesicRaycaster = new THREE.Raycaster();
  private geodesicClickSphere!: THREE.Mesh; // invisible sphere for click raycasting
  private isAiming = false;
  private aimStart = new THREE.Vector2();
  private aimHitPoint = new THREE.Vector3();

  private boundHandlers: { el: EventTarget; type: string; fn: EventListener }[] = [];
  private initialized = false;
  private unsubViewMode: (() => void) | null = null;

  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;
    const { scene } = ctx;
    const firstInit = !this.initialized;

    // Clear fog — black hole scene manages its own background
    scene.fog = null;

    if (firstInit) {
      // ─── Fullscreen quad (desktop) ───
      const geometry = new THREE.PlaneGeometry(2, 2);

      this.orbitCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 500);
      this.updateOrbitCamera();

      this.bhMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uMass: { value: this.mass },
          uSpin: { value: this.spin },
          uShowDisk: { value: 1.0 },
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
          uCameraMatrix: { value: this.orbitCamera.matrixWorld },
          uFov: { value: THREE.MathUtils.degToRad(60) },
          uBackground: { value: new THREE.Texture() },
          uUseCamera: { value: 0.0 },
          uMirrorX: { value: 1.0 },
          uInvCameraMatrix: { value: new THREE.Matrix4() },
          uStarfield: { value: new THREE.Texture() },
          uUseStarfield: { value: 0.0 },
        },
        depthWrite: false,
        depthTest: false,
      });

      this.quad = new THREE.Mesh(geometry, this.bhMaterial);
      this.quad.frustumCulled = false;
      scene.add(this.quad);

      // ─── Inverted sphere (VR skybox) ───
      const sphereGeo = new THREE.IcosahedronGeometry(50, 5);
      // BackSide rendering handles inside-out view — no geometry inversion needed

      this.vrMaterial = new THREE.ShaderMaterial({
        vertexShader: vrVertexShader,
        fragmentShader: vrFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uMass: { value: this.mass },
          uSpin: { value: this.spin },
          uShowDisk: { value: 1.0 },
          uCameraPosVR: { value: new THREE.Vector3() },
          // Passthrough uniforms
          uPassthrough: { value: 0.0 },
          uHasCameraFeed: { value: 0.0 },
          uCameraFeed: { value: new THREE.Texture() },
          uBHCenter: { value: new THREE.Vector3() },
          uSphereRadius: { value: 2.0 },
          uStarfield: { value: new THREE.Texture() },
          uUseStarfield: { value: 0.0 },
        },
        side: THREE.DoubleSide,
        depthWrite: false,
        transparent: false,
      });

      this.vrSphere = new THREE.Mesh(sphereGeo, this.vrMaterial);
      this.vrSphere.frustumCulled = false;
      this.vrSphere.visible = false;
      scene.add(this.vrSphere);

      // ─── Geodesic mode objects ───
      this.geodesicGroup = new THREE.Group();
      this.geodesicGroup.visible = false;
      scene.add(this.geodesicGroup);

      // Dark sphere at event horizon
      const horizonGeo = new THREE.SphereGeometry(this.mass, 32, 24);
      this.bhHorizonMesh = new THREE.Mesh(horizonGeo, new THREE.MeshBasicMaterial({
        color: 0x0a0a0a,
        transparent: true,
        opacity: 0.9,
      }));
      this.geodesicGroup.add(this.bhHorizonMesh);

      // Photon sphere ring at r = 1.5 rs
      const photonR = 1.5 * this.mass;
      this.photonSphereRing = this.createWireframeRing(photonR, 0x6366f1);
      this.geodesicGroup.add(this.photonSphereRing);

      // ISCO ring at r = 3 rs
      const iscoR = 3 * this.mass;
      this.iscoRing = this.createWireframeRing(iscoR, 0x22d3ee);
      this.geodesicGroup.add(this.iscoRing);

      // Invisible click sphere for raycasting (extends to ~20 rs)
      const clickGeo = new THREE.SphereGeometry(this.mass * 20, 16, 12);
      this.geodesicClickSphere = new THREE.Mesh(clickGeo, new THREE.MeshBasicMaterial({
        visible: false,
        side: THREE.DoubleSide,
      }));
      this.geodesicGroup.add(this.geodesicClickSphere);

      // Load starfield equirectangular panorama (ESO Milky Way, CC-BY 4.0)
      new THREE.TextureLoader().load("textures/milkyway.jpg", (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        this.starfieldTexture = tex;
        this.bhMaterial.uniforms.uStarfield.value = tex;
        this.vrMaterial.uniforms.uStarfield.value = tex;
      });
    } else {
      // Re-add meshes to scene on re-entry
      scene.add(this.quad);
      scene.add(this.vrSphere);
      scene.add(this.geodesicGroup);
    }

    // ─── Disable OrbitControls — we handle camera ourselves ───
    ctx.controls.enabled = false;

    // ─── UI panel ───
    if (firstInit) {
      this.buildPanel();
    } else {
      document.body.appendChild(this.panelEl!);
    }

    // ─── Hide merger-specific UI but keep #ui bar visible (VR button, screenshot) ───
    for (const id of ["event-info", "event-list", "time-controls", "map-legend", "help-overlay", "map-toggle", "tour-toggle", "events-toggle"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    }
    const uiBar = document.getElementById("ui");
    if (uiBar) uiBar.style.display = "flex";
    const vrBtn = document.getElementById("vr-button");
    if (vrBtn) vrBtn.style.display = "";

    // Remove loading screen if present
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.classList.add("fade-out");
      setTimeout(() => loadingScreen.remove(), 700);
    }

    this.setupInteraction(ctx);

    // ─── VR panel ───
    if (ctx.xrManager && !this.vrPanel) {
      this.setupVRPanel(ctx);
    }

    // Subscribe to view mode changes for equations
    if (!this.unsubViewMode) {
      this.unsubViewMode = onViewModeChange((mode) => {
        this.ensureEquationsSection(mode);
      });
    }

    // Initial equations render
    this.ensureEquationsSection(getViewMode());

    if (firstInit) {
      this.initialized = true;
    }
  }

  private updateOrbitCamera() {
    this.orbitCamera.position.setFromSpherical(this.spherical);
    this.orbitCamera.lookAt(0, 0, 0);
    this.orbitCamera.updateMatrixWorld();
  }

  // ─── VR Panel ──────────────────────────────────────────────────────

  private setupVRPanel(ctx: SceneContext) {
    const xr = ctx.xrManager!;
    const panelHeight = xr.supportsAR ? 1.3 : 1.0; // taller for AR (4 rows), spin row added
    this.vrPanel = new VRPanel(1.4, panelHeight);
    this.vrPanel.setTitle("Black Hole");

    // Row 1: Mass + Disk
    const row1Y = 0.40;
    const btnH = 0.25;
    const btnW = 0.44;
    const gap = 0.03;
    const startX = 0.04;

    // Mass button — cycles through preset values
    const massValues = [0.5, 1.0, 1.5, 2.5, 4.0];
    let massIdx = 2; // start at 1.5
    this.vrPanel.addButton({
      label: `Mass: ${this.mass}`,
      x: startX,
      y: row1Y,
      w: btnW,
      h: btnH,
      onClick: () => {
        massIdx = (massIdx + 1) % massValues.length;
        this.mass = massValues[massIdx];
        this.bhMaterial.uniforms.uMass.value = this.mass;
        this.vrMaterial.uniforms.uMass.value = this.mass;
        this.vrPanel?.updateButton(0, `Mass: ${this.mass}`);
        this.updateEquationValues();
        const slider = this.panelEl?.querySelector("#bh-mass") as HTMLInputElement | null;
        if (slider) {
          slider.value = String(this.mass * 100);
          const valEl = this.panelEl?.querySelector("#bh-mass-val");
          if (valEl) valEl.innerHTML = `${this.mass.toFixed(1)} r<sub>s</sub>`;
        }
      },
    });

    // Disk toggle
    this.vrPanel.addButton({
      label: this.showDisk ? "Disk: ON" : "Disk: OFF",
      x: startX + btnW + gap,
      y: row1Y,
      w: btnW,
      h: btnH,
      onClick: () => {
        this.showDisk = !this.showDisk;
        this.bhMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
        this.vrMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
        this.vrPanel?.updateButton(1, this.showDisk ? "Disk: ON" : "Disk: OFF");
        const cb = this.panelEl?.querySelector("#bh-disk") as HTMLInputElement | null;
        if (cb) cb.checked = this.showDisk;
      },
    });

    // Row 2: Spin
    const row2Y = 0.70;
    const spinValues = [0, 0.3, 0.6, 0.9, 0.998];
    let spinIdx = 0;
    this.vrPanel.addButton({
      label: `Spin: ${this.spin.toFixed(2)}`,
      x: startX,
      y: row2Y,
      w: btnW * 2 + gap,
      h: btnH,
      onClick: () => {
        spinIdx = (spinIdx + 1) % spinValues.length;
        this.spin = spinValues[spinIdx];
        this.bhMaterial.uniforms.uSpin.value = this.spin;
        this.vrMaterial.uniforms.uSpin.value = this.spin;
        // Button index: 0=Mass, 1=Disk, 2=Spin
        this.vrPanel?.updateButton(2, `Spin: ${this.spin.toFixed(2)}`);
        // Sync desktop slider
        const slider = this.panelEl?.querySelector("#bh-spin") as HTMLInputElement | null;
        if (slider) {
          slider.value = String(this.spin * 1000);
          const valEl = this.panelEl?.querySelector("#bh-spin-val");
          if (valEl) valEl.innerHTML = `${this.spin.toFixed(2)} a/M`;
        }
        this.updateEquationValues();
      },
    });

    // Row 3: Mode toggle + Exit VR
    const row3Y = 1.00;

    // Mode toggle — only shown for AR sessions (passthrough capable)
    if (xr.supportsAR) {
      this.modeButtonIndex = 3; // buttons[0]=Mass, [1]=Disk, [2]=Spin, [3]=Mode
      this.vrPanel.addButton({
        label: "Mode: PT",
        x: startX,
        y: row3Y,
        w: btnW,
        h: btnH,
        onClick: () => {
          if (this.passthroughActive) {
            this.enterSkyboxMode();
          } else {
            this.enterPassthroughMode();
          }
        },
      });
    }

    // Exit VR
    this.vrPanel.addButton({
      label: "Exit VR",
      x: xr.supportsAR ? startX + btnW + gap : startX,
      y: row3Y,
      w: btnW,
      h: btnH,
      onClick: () => {
        xr.endSession();
      },
    });

    // Row 4: Reset Pos (only for AR sessions — repositions BH in passthrough mode)
    if (xr.supportsAR) {
      const row4Y = 1.30;
      this.vrPanel.addButton({
        label: "Reset Pos",
        x: startX,
        y: row4Y,
        w: btnW,
        h: btnH,
        onClick: () => {
          if (!this.passthroughActive) return;
          const headPos = xr.cameraWorldPosition;
          this.bhWorldPosition.set(headPos.x, headPos.y, headPos.z - 2);
          this.vrSphere.position.copy(this.bhWorldPosition);
          this.vrMaterial.uniforms.uBHCenter.value.copy(this.bhWorldPosition);
        },
      });
    }

    xr.registerPanel(this.vrPanel);

    // Grab & drag black hole with controller/hand
    const grabRaycaster = new THREE.Raycaster();
    xr.onControllerSelectStart = (origin, direction, _controllerIndex) => {
      if (!this.passthroughActive) return false;

      grabRaycaster.set(origin, direction);
      const intersects = grabRaycaster.intersectObject(this.vrSphere);
      if (intersects.length > 0) {
        this.grabbing = true;
        this.grabControllerIndex = _controllerIndex;
        // Store offset from ray hit to BH center for smooth dragging
        this.grabOffset.copy(this.bhWorldPosition).sub(intersects[0].point);
        xr.pulseHaptics(0.3, 50);
        return true; // consume event (skip teleport)
      }
      return false;
    };

    xr.onControllerSelectEnd = () => {
      if (this.grabbing) {
        this.grabbing = false;
        this.grabControllerIndex = -1;
      }
    };

    this.vrTutorial = new VRTutorial();

    xr.onMenuPress = () => {
      if (this.vrTutorial?.dismiss()) return;
      if (!this.vrPanel) return;
      this.vrPanel.toggle();
      if (this.vrPanel.visible) {
        this.ctx.camera.updateWorldMatrix(true, false);
        this.vrPanel.positionInFront(this.ctx.camera, 2, 0);
      }
    };

    xr.onSessionStart = () => {
      if (this.vrPanel) {
        this.vrPanel.positionInFront(ctx.camera, 2, 0);
        ctx.scene.add(this.vrPanel.mesh);
      }
      setTimeout(() => this.vrTutorial?.show(ctx.camera, ctx.scene), 200);
    };

    xr.onSessionEnd = () => {
      if (this.vrPanel) {
        ctx.scene.remove(this.vrPanel.mesh);
      }
      this.vrTutorial?.hide(ctx.scene);
    };

    // If already in VR (scene switch mid-session), show panel immediately
    if (xr.isPresenting && this.vrPanel) {
      this.vrPanel.positionInFront(ctx.camera, 2, 0);
      ctx.scene.add(this.vrPanel.mesh);
    }
  }

  // ─── Desktop / VR mode switching ──────────────────────────────────

  private switchToVR() {
    this.quad.visible = false;
    this.vrSphere.visible = true;

    // Sync VR material uniforms
    this.vrMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
    this.vrMaterial.uniforms.uUseStarfield.value = this.useStarfield ? 1.0 : 0.0;

    // BH at eye level 5m ahead — reduced mass for manageable VR scale
    this.vrMaterial.uniforms.uMass.value = 0.2;
    this.vrMaterial.uniforms.uBHCenter.value.set(0, 1.6, -5);

    // Solid background to block AR passthrough
    this.ctx.scene.background = new THREE.Color(0x000005);
    this.ctx.renderer.setClearColor(0x000005, 1);

    this.passthroughActive = false;
  }

  /** Switch VR sphere to passthrough mode: localized 2m sphere, transparent, grab enabled */
  private enterPassthroughMode() {
    // Replace large skybox sphere with localized sphere (non-inverted — camera is outside)
    if (!this.vrSphereOriginalGeo) {
      this.vrSphereOriginalGeo = this.vrSphere.geometry;
    } else {
      this.vrSphere.geometry.dispose();
    }
    const localGeo = new THREE.IcosahedronGeometry(2.0, 5);
    // Do NOT invert — camera is outside the sphere, we want front-facing triangles
    this.vrSphere.geometry = localGeo;

    // Position BH in front of user
    const xr = this.ctx.xrManager;
    if (xr) {
      const headPos = xr.cameraWorldPosition;
      this.bhWorldPosition.set(headPos.x, headPos.y, headPos.z - 2);
    }
    this.vrSphere.position.copy(this.bhWorldPosition);

    // Configure material for passthrough: double-side so sphere is visible from inside and outside
    this.vrMaterial.side = THREE.DoubleSide;
    this.vrMaterial.transparent = true;
    this.vrMaterial.blending = THREE.NormalBlending;
    this.vrMaterial.uniforms.uPassthrough.value = 1.0;
    this.vrMaterial.uniforms.uHasCameraFeed.value = this.hasCameraAccess ? 1.0 : 0.0;
    this.vrMaterial.uniforms.uBHCenter.value.copy(this.bhWorldPosition);
    this.vrMaterial.uniforms.uSphereRadius.value = 2.0;
    // Restore full mass for passthrough localized sphere
    this.vrMaterial.uniforms.uMass.value = this.mass;
    this.vrMaterial.needsUpdate = true;

    // Transparent background for passthrough
    this.ctx.scene.background = null;
    this.ctx.renderer.setClearColor(0x000000, 0);

    this.passthroughActive = true;

    // Update VR panel button
    this.vrPanel?.updateButton(this.modeButtonIndex, "Mode: PT");
  }

  /** Switch VR sphere to opaque skybox mode: large inverted sphere with star background */
  private enterSkyboxMode() {
    // Restore large inverted sphere geometry
    if (this.vrSphereOriginalGeo) {
      this.vrSphere.geometry.dispose();
      this.vrSphere.geometry = this.vrSphereOriginalGeo;
      this.vrSphereOriginalGeo = null;
    }
    this.vrSphere.position.set(0, 0, 0);

    // Configure material for skybox: double-side to ensure visibility from inside
    this.vrMaterial.side = THREE.DoubleSide;
    this.vrMaterial.transparent = false;
    this.vrMaterial.blending = THREE.NormalBlending;
    this.vrMaterial.uniforms.uPassthrough.value = 0.0;
    this.vrMaterial.uniforms.uHasCameraFeed.value = 0.0;
    // BH at eye level 5m ahead — reduced mass for manageable VR scale
    this.vrMaterial.uniforms.uMass.value = 0.2;
    this.vrMaterial.uniforms.uBHCenter.value.set(0, 1.6, -5);
    this.vrMaterial.needsUpdate = true;

    // Opaque background — force solid color to block AR camera passthrough
    this.ctx.scene.background = new THREE.Color(0x000005);
    this.ctx.renderer.setClearColor(0x000005, 1);

    this.passthroughActive = false;
    this.grabbing = false;

    // Update VR panel button
    this.vrPanel?.updateButton(this.modeButtonIndex, "Mode: Sky");
  }

  private switchToDesktop() {
    this.vrSphere.visible = false;
    this.quad.visible = true;

    // Restore scene background and clear color
    this.ctx.scene.background = this.savedBackground ?? new THREE.Color(0x000005);
    this.savedBackground = null;
    this.ctx.renderer.setClearColor(0x000005, 1);

    // Restore large sphere geometry if in passthrough mode
    if (this.vrSphereOriginalGeo) {
      this.vrSphere.geometry.dispose();
      this.vrSphere.geometry = this.vrSphereOriginalGeo;
      this.vrSphereOriginalGeo = null;
    }
    this.vrSphere.position.set(0, 0, 0);

    // Reset material to opaque skybox mode
    this.vrMaterial.side = THREE.BackSide;
    this.vrMaterial.transparent = false;
    this.vrMaterial.blending = THREE.NormalBlending;
    this.vrMaterial.uniforms.uPassthrough.value = 0.0;
    this.vrMaterial.uniforms.uHasCameraFeed.value = 0.0;
    this.vrMaterial.uniforms.uMass.value = this.mass;
    this.vrMaterial.uniforms.uBHCenter.value.set(0, 0, 0);

    this.passthroughActive = false;
    this.hasCameraAccess = false;
    this.grabbing = false;
  }

  private createWireframeRing(radius: number, color: number): THREE.Line {
    const segments = 64;
    const ringPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }));
  }

  private setGeodesicMode(active: boolean) {
    this.geodesicMode = active;
    // Toggle visibility
    this.quad.visible = !active;
    this.geodesicGroup.visible = active;

    // Update geodesic BH representation radii for current mass
    if (active) {
      this.updateGeodesicRadii();
      // Use a dark background for geodesic mode
      this.ctx.scene.background = new THREE.Color(0x050510);
    } else {
      this.ctx.scene.background = null;
      // Clear active animation
      this.activeTrail = null;
      // Remove launch indicator
      if (this.launchIndicator) {
        this.geodesicGroup.remove(this.launchIndicator);
        this.launchIndicator.dispose();
        this.launchIndicator = null;
      }
    }

    // Update panel buttons
    const lensingBtn = this.panelEl?.querySelector("#bh-mode-lensing") as HTMLElement | null;
    const geodesicBtn = this.panelEl?.querySelector("#bh-mode-geodesic") as HTMLElement | null;
    if (lensingBtn) lensingBtn.classList.toggle("active", !active);
    if (geodesicBtn) geodesicBtn.classList.toggle("active", active);

    // Update hint
    const hint = this.panelEl?.querySelector(".bh-hint");
    if (hint) {
      hint.textContent = active
        ? "Click to place photon. Drag to aim."
        : "Drag to orbit. Scroll to zoom.";
    }

    // Show/hide lensing-only controls
    const lensingControls = this.panelEl?.querySelectorAll(".bh-lensing-only");
    lensingControls?.forEach((el) => {
      (el as HTMLElement).style.display = active ? "none" : "";
    });
  }

  private updateGeodesicRadii() {
    const rs = this.mass;

    // Update horizon sphere
    this.bhHorizonMesh.geometry.dispose();
    this.bhHorizonMesh.geometry = new THREE.SphereGeometry(rs, 32, 24);

    // Update photon sphere ring
    this.geodesicGroup.remove(this.photonSphereRing);
    this.photonSphereRing.geometry.dispose();
    this.photonSphereRing = this.createWireframeRing(1.5 * rs, 0x6366f1);
    this.geodesicGroup.add(this.photonSphereRing);

    // Update ISCO ring
    this.geodesicGroup.remove(this.iscoRing);
    this.iscoRing.geometry.dispose();
    this.iscoRing = this.createWireframeRing(3 * rs, 0x22d3ee);
    this.geodesicGroup.add(this.iscoRing);

    // Update click sphere
    this.geodesicClickSphere.geometry.dispose();
    this.geodesicClickSphere.geometry = new THREE.SphereGeometry(rs * 20, 16, 12);
  }

  private clearGeodesicTrails() {
    for (const trail of this.geodesicTrails) {
      this.geodesicGroup.remove(trail);
      trail.geometry.dispose();
      (trail.material as THREE.Material).dispose();
    }
    this.geodesicTrails = [];
    this.activeTrail = null;
  }

  private launchPhoton(hitPoint: THREE.Vector3, direction: THREE.Vector3) {
    const rs = this.mass;
    const result = integrateGeodesic(hitPoint, direction, rs);

    // Color by outcome
    const color = result.outcome === "captured" ? 0x6366f1 : 0x22d3ee; // indigo : cyan

    // Create line with full geometry but only show first point initially
    const geo = new THREE.BufferGeometry().setFromPoints(result.points);
    geo.setDrawRange(0, 2);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    this.geodesicGroup.add(line);
    this.geodesicTrails.push(line);

    // Animate
    this.activeTrail = { line, points: result.points, index: 2, result };

    // Limit total trails to 20
    while (this.geodesicTrails.length > 20) {
      const old = this.geodesicTrails.shift()!;
      this.geodesicGroup.remove(old);
      old.geometry.dispose();
      (old.material as THREE.Material).dispose();
    }

    // Update info display
    const info = this.panelEl?.querySelector(".bh-geodesic-info");
    if (info) {
      info.textContent = result.outcome === "captured"
        ? "Captured by black hole"
        : result.outcome === "scattered"
          ? "Scattered to infinity"
          : "Unstable orbit";
    }
  }

  private buildPanel() {
    this.panelEl = document.createElement("div");
    this.panelEl.id = "blackhole-panel";
    this.panelEl.className = "glass";
    this.panelEl.innerHTML = `
      <h3 class="bh-title">Black Hole</h3>
      <div class="bh-mode-toggle">
        <button class="bh-mode-btn active" id="bh-mode-lensing">Lensing</button>
        <button class="bh-mode-btn" id="bh-mode-geodesic">Geodesic</button>
      </div>
      <div class="bh-params">
        <div class="bh-row">
          <label>Mass</label>
          <input type="range" class="bh-slider" id="bh-mass" min="50" max="500" value="150" />
          <span class="bh-val" id="bh-mass-val">1.5 r<sub>s</sub></span>
        </div>
        <div class="bh-row bh-lensing-only">
          <label>Spin</label>
          <input type="range" class="bh-slider" id="bh-spin" min="0" max="998" value="0" />
          <span class="bh-val" id="bh-spin-val">0.00 a/M</span>
        </div>
        <div class="bh-row bh-lensing-only">
          <label class="bh-toggle-label">
            <input type="checkbox" id="bh-disk" checked />
            Accretion Disk
          </label>
        </div>
        <div class="bh-row bh-lensing-only">
          <label class="bh-toggle-label">
            <input type="checkbox" id="bh-starfield" />
            Starfield
          </label>
        </div>
        <div class="bh-row bh-lensing-only">
          <label class="bh-toggle-label">
            <input type="checkbox" id="bh-ar" />
            AR Mode
          </label>
        </div>
      </div>
      <div class="bh-geodesic-info"></div>
      <div class="bh-hint">Drag to orbit. Scroll to zoom.</div>
    `;
    document.body.appendChild(this.panelEl);

    // Slider
    const massSlider = this.panelEl.querySelector("#bh-mass") as HTMLInputElement;
    const massVal = this.panelEl.querySelector("#bh-mass-val")!;
    massSlider.addEventListener("input", () => {
      this.mass = parseInt(massSlider.value) / 100;
      massVal.innerHTML = `${this.mass.toFixed(1)} r<sub>s</sub>`;
      this.bhMaterial.uniforms.uMass.value = this.mass;
      this.vrMaterial.uniforms.uMass.value = this.mass;
      // Update equation computed values live
      this.updateEquationValues();
    });

    // Spin slider
    const spinSlider = this.panelEl.querySelector("#bh-spin") as HTMLInputElement;
    const spinVal = this.panelEl.querySelector("#bh-spin-val")!;
    spinSlider.addEventListener("input", () => {
      this.spin = parseInt(spinSlider.value) / 1000;
      spinVal.innerHTML = `${this.spin.toFixed(2)} a/M`;
      this.bhMaterial.uniforms.uSpin.value = this.spin;
      this.vrMaterial.uniforms.uSpin.value = this.spin;
      // Update equation computed values live when spin changes
      this.updateEquationValues();
    });

    // Disk toggle
    const diskCheckbox = this.panelEl.querySelector("#bh-disk") as HTMLInputElement;
    diskCheckbox.addEventListener("change", () => {
      this.showDisk = diskCheckbox.checked;
      this.bhMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
      this.vrMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
    });

    // Starfield toggle
    const starfieldCheckbox = this.panelEl.querySelector("#bh-starfield") as HTMLInputElement;
    starfieldCheckbox.addEventListener("change", () => {
      this.useStarfield = starfieldCheckbox.checked;
      const val = this.useStarfield ? 1.0 : 0.0;
      this.bhMaterial.uniforms.uUseStarfield.value = val;
      this.vrMaterial.uniforms.uUseStarfield.value = val;
    });

    // AR mode toggle
    this.arCheckbox = this.panelEl.querySelector("#bh-ar") as HTMLInputElement;
    this.arCheckbox.addEventListener("change", () => {
      if (this.arCheckbox!.checked) {
        this.startCameraFeed();
      } else {
        this.stopCameraFeed();
      }
    });

    // Mode toggle: Lensing / Geodesic
    const lensingBtn = this.panelEl.querySelector("#bh-mode-lensing") as HTMLButtonElement;
    const geodesicBtn = this.panelEl.querySelector("#bh-mode-geodesic") as HTMLButtonElement;
    lensingBtn.addEventListener("click", () => this.setGeodesicMode(false));
    geodesicBtn.addEventListener("click", () => this.setGeodesicMode(true));
  }

  private async startCameraFeed() {
    const hint = this.panelEl?.querySelector(".bh-hint");

    // Check for camera API availability (requires HTTPS or localhost)
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn("AR: getUserMedia not available (requires HTTPS)");
      if (this.arCheckbox) this.arCheckbox.checked = false;
      if (hint) {
        hint.textContent = "Camera requires HTTPS connection";
        setTimeout(() => { hint.textContent = "Drag to orbit. Scroll to zoom."; }, 4000);
      }
      return;
    }

    try {
      // Try rear camera first (mobile), fall back to any camera (laptop)
      try {
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      this.videoElement = document.createElement("video");
      this.videoElement.srcObject = this.cameraStream;
      this.videoElement.setAttribute("playsinline", "");
      this.videoElement.muted = true;
      await this.videoElement.play();

      // Wait for the video to actually have a decoded frame
      await new Promise<void>((resolve) => {
        if (this.videoElement!.videoWidth > 0) {
          resolve();
        } else {
          this.videoElement!.addEventListener("loadeddata", () => resolve(), { once: true });
        }
      });

      // Use CanvasTexture instead of VideoTexture — manually blit video frames
      // to a canvas each frame. VideoTexture doesn't reliably upload to GPU
      // when used with ShaderMaterial.
      this.arCanvas = document.createElement("canvas");
      this.arCanvas.width = this.videoElement.videoWidth;
      this.arCanvas.height = this.videoElement.videoHeight;
      this.arCtx = this.arCanvas.getContext("2d")!;
      // Draw first frame immediately
      this.arCtx.drawImage(this.videoElement, 0, 0);

      this.videoTexture = new THREE.CanvasTexture(this.arCanvas);
      this.videoTexture.minFilter = THREE.LinearFilter;
      this.videoTexture.magFilter = THREE.LinearFilter;

      // Detect if front-facing camera — only mirror X for selfie cameras
      const track = this.cameraStream.getVideoTracks()[0];
      const settings = track?.getSettings?.();
      const isFront = settings?.facingMode === "user";
      this.bhMaterial.uniforms.uMirrorX.value = isFront ? 1.0 : 0.0;

      this.bhMaterial.uniforms.uBackground.value = this.videoTexture;
      this.bhMaterial.uniforms.uUseCamera.value = 1.0;
      // Disable starfield in AR mode
      this.bhMaterial.uniforms.uUseStarfield.value = 0.0;
      this.arModeActive = true;
      // Hide starfield toggle
      const sfRow = this.panelEl?.querySelector("#bh-starfield")?.closest(".bh-row") as HTMLElement | null;
      if (sfRow) sfRow.style.display = "none";
    } catch (err) {
      console.warn("AR camera failed:", err);
      if (this.arCheckbox) this.arCheckbox.checked = false;
      this.arModeActive = false;

      if (hint) {
        const msg = (err as Error)?.name === "NotAllowedError"
          ? "Camera permission denied — check browser settings"
          : "Camera not available on this device";
        hint.textContent = msg;
        setTimeout(() => { hint.textContent = "Drag to orbit. Scroll to zoom."; }, 4000);
      }
    }
  }

  private stopCameraFeed() {
    if (this.cameraStream) {
      for (const track of this.cameraStream.getTracks()) {
        track.stop();
      }
      this.cameraStream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    if (this.videoTexture) {
      this.videoTexture.dispose();
      this.videoTexture = null;
    }
    this.arCanvas = null;
    this.arCtx = null;
    this.bhMaterial.uniforms.uUseCamera.value = 0.0;
    this.bhMaterial.uniforms.uBackground.value = new THREE.Texture();
    // Restore starfield state
    this.bhMaterial.uniforms.uUseStarfield.value = this.useStarfield ? 1.0 : 0.0;
    this.arModeActive = false;
    // Show starfield toggle again
    const sfRow = this.panelEl?.querySelector("#bh-starfield")?.closest(".bh-row") as HTMLElement | null;
    if (sfRow) sfRow.style.display = "";
  }

  private addHandler(el: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions) {
    el.addEventListener(type, fn, options);
    this.boundHandlers.push({ el, type, fn });
  }

  private getNDC(clientX: number, clientY: number): THREE.Vector2 {
    return new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
  }

  private tryGeodesicHit(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.geodesicRaycaster.setFromCamera(ndc, this.orbitCamera);
    const hits = this.geodesicRaycaster.intersectObject(this.geodesicClickSphere);
    return hits.length > 0 ? hits[0].point.clone() : null;
  }

  private setupInteraction(ctx: SceneContext) {
    const canvas = ctx.renderer.domElement;

    // Mouse drag to orbit / geodesic click-to-launch
    this.addHandler(canvas, "mousedown", ((e: MouseEvent) => {
      if (this.geodesicMode) {
        const ndc = this.getNDC(e.clientX, e.clientY);
        const hit = this.tryGeodesicHit(ndc);
        if (hit) {
          this.isAiming = true;
          this.aimStart.set(e.clientX, e.clientY);
          this.aimHitPoint.copy(hit);
          // Show arrow indicator
          const dir = hit.clone().normalize().negate(); // default: toward BH
          if (this.launchIndicator) {
            this.geodesicGroup.remove(this.launchIndicator);
            this.launchIndicator.dispose();
          }
          this.launchIndicator = new THREE.ArrowHelper(dir, hit, 1.5, 0xffffff, 0.3, 0.15);
          this.geodesicGroup.add(this.launchIndicator);
          return;
        }
      }
      this.isDragging = true;
      this.prevMouse.set(e.clientX, e.clientY);
    }) as EventListener);

    this.addHandler(window, "mousemove", ((e: MouseEvent) => {
      if (this.isAiming && this.launchIndicator) {
        // Update aim direction based on drag
        const dx = e.clientX - this.aimStart.x;
        const dy = e.clientY - this.aimStart.y;
        // Compute direction in camera space and transform to world
        const camRight = new THREE.Vector3();
        const camUp = new THREE.Vector3();
        this.orbitCamera.matrixWorld.extractBasis(camRight, camUp, new THREE.Vector3());
        const dir = this.aimHitPoint.clone().normalize().negate();
        dir.addScaledVector(camRight, dx * 0.003);
        dir.addScaledVector(camUp, -dy * 0.003);
        dir.normalize();
        this.launchIndicator.setDirection(dir);
        return;
      }
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.prevMouse.set(e.clientX, e.clientY);

      this.targetSpherical.theta -= dx * 0.012;
      this.targetSpherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
        this.targetSpherical.phi - dy * 0.012));
    }) as EventListener);

    this.addHandler(window, "mouseup", ((e: MouseEvent) => {
      if (this.isAiming) {
        this.isAiming = false;
        // Compute final launch direction
        const dx = e.clientX - this.aimStart.x;
        const dy = e.clientY - this.aimStart.y;
        const camRight = new THREE.Vector3();
        const camUp = new THREE.Vector3();
        this.orbitCamera.matrixWorld.extractBasis(camRight, camUp, new THREE.Vector3());
        const dir = this.aimHitPoint.clone().normalize().negate();
        dir.addScaledVector(camRight, dx * 0.003);
        dir.addScaledVector(camUp, -dy * 0.003);
        dir.normalize();
        // Remove indicator
        if (this.launchIndicator) {
          this.geodesicGroup.remove(this.launchIndicator);
          this.launchIndicator.dispose();
          this.launchIndicator = null;
        }
        this.launchPhoton(this.aimHitPoint, dir);
        return;
      }
      this.isDragging = false;
    }) as EventListener);

    // Touch support — single finger orbit / geodesic tap+drag, two finger pinch zoom
    this.addHandler(canvas, "touchstart", ((e: TouchEvent) => {
      if (e.touches.length === 1) {
        if (this.geodesicMode) {
          const ndc = this.getNDC(e.touches[0].clientX, e.touches[0].clientY);
          const hit = this.tryGeodesicHit(ndc);
          if (hit) {
            this.isAiming = true;
            this.aimStart.set(e.touches[0].clientX, e.touches[0].clientY);
            this.aimHitPoint.copy(hit);
            if (this.launchIndicator) {
              this.geodesicGroup.remove(this.launchIndicator);
              this.launchIndicator.dispose();
            }
            const dir = hit.clone().normalize().negate();
            this.launchIndicator = new THREE.ArrowHelper(dir, hit, 1.5, 0xffffff, 0.3, 0.15);
            this.geodesicGroup.add(this.launchIndicator);
            return;
          }
        }
        this.isDragging = true;
        this.prevMouse.set(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        this.isAiming = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.pinchStartDist = Math.sqrt(dx * dx + dy * dy);
      }
    }) as EventListener);

    this.addHandler(canvas, "touchmove", ((e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        // Pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const delta = this.pinchStartDist - dist;
        this.targetSpherical.radius = Math.max(3, Math.min(80,
          this.targetSpherical.radius + delta * 0.05));
        this.pinchStartDist = dist;
        return;
      }
      if (this.isAiming && this.launchIndicator && e.touches.length === 1) {
        const dx = e.touches[0].clientX - this.aimStart.x;
        const dy = e.touches[0].clientY - this.aimStart.y;
        const camRight = new THREE.Vector3();
        const camUp = new THREE.Vector3();
        this.orbitCamera.matrixWorld.extractBasis(camRight, camUp, new THREE.Vector3());
        const dir = this.aimHitPoint.clone().normalize().negate();
        dir.addScaledVector(camRight, dx * 0.003);
        dir.addScaledVector(camUp, -dy * 0.003);
        dir.normalize();
        this.launchIndicator.setDirection(dir);
        return;
      }
      if (!this.isDragging || e.touches.length !== 1) return;
      const tdx = e.touches[0].clientX - this.prevMouse.x;
      const tdy = e.touches[0].clientY - this.prevMouse.y;
      this.prevMouse.set(e.touches[0].clientX, e.touches[0].clientY);

      this.targetSpherical.theta -= tdx * 0.012;
      this.targetSpherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
        this.targetSpherical.phi - tdy * 0.012));
    }) as EventListener, { passive: false });

    this.addHandler(canvas, "touchend", ((e: TouchEvent) => {
      if (this.isAiming) {
        this.isAiming = false;
        // Use last touch position or aim start for final direction
        const touch = e.changedTouches[0];
        const dx = touch.clientX - this.aimStart.x;
        const dy = touch.clientY - this.aimStart.y;
        const camRight = new THREE.Vector3();
        const camUp = new THREE.Vector3();
        this.orbitCamera.matrixWorld.extractBasis(camRight, camUp, new THREE.Vector3());
        const dir = this.aimHitPoint.clone().normalize().negate();
        dir.addScaledVector(camRight, dx * 0.003);
        dir.addScaledVector(camUp, -dy * 0.003);
        dir.normalize();
        if (this.launchIndicator) {
          this.geodesicGroup.remove(this.launchIndicator);
          this.launchIndicator.dispose();
          this.launchIndicator = null;
        }
        this.launchPhoton(this.aimHitPoint, dir);
        return;
      }
      this.isDragging = false;
    }) as EventListener);

    // Scroll to zoom
    this.addHandler(canvas, "wheel", ((e: WheelEvent) => {
      e.preventDefault();
      this.targetSpherical.radius = Math.max(3, Math.min(80,
        this.targetSpherical.radius + e.deltaY * 0.05));
    }) as EventListener, { passive: false });
  }

  update(dt: number, _elapsed: number): void {
    this.elapsed += dt;
    this.bhMaterial.uniforms.uTime.value = this.elapsed;
    this.vrMaterial.uniforms.uTime.value = this.elapsed;

    // Blit video frame to canvas and flag texture for GPU upload
    if (this.arCtx && this.videoElement && this.videoElement.readyState >= this.videoElement.HAVE_CURRENT_DATA) {
      this.arCtx.drawImage(this.videoElement, 0, 0);
      this.videoTexture!.needsUpdate = true;
    }

    // ─── VR / Desktop mode switching ───
    const isPresenting = this.ctx.renderer.xr.isPresenting;
    if (isPresenting !== this.wasPresenting) {
      if (isPresenting) {
        this.switchToVR();
      } else {
        this.switchToDesktop();
      }
      this.wasPresenting = isPresenting;
    }

    // In VR, pass the XR camera position for proper stereo parallax
    if (isPresenting) {
      // Use world position (not rig-local) so it matches world-space vWorldPos/uBHCenter
      const xrCamera = this.ctx.renderer.xr.getCamera();
      xrCamera.updateMatrixWorld(true);
      xrCamera.getWorldPosition(this.vrMaterial.uniforms.uCameraPosVR.value);

      // Update BH center uniform and grab logic
      if (this.passthroughActive) {
        // Grab-drag: move BH to follow controller ray
        if (this.grabbing) {
          // Use the XR camera's current controller position
          // The controller provides ray origin; place BH at fixed distance along ray
          const session = this.ctx.renderer.xr.getSession();
          if (session) {
            for (const source of session.inputSources) {
              if (!source.gripSpace) continue;
              const frame = this.ctx.renderer.xr.getFrame() as XRFrame | null;
              const refSpace = this.ctx.renderer.xr.getReferenceSpace();
              if (frame && refSpace) {
                const pose = frame.getPose(source.gripSpace, refSpace);
                if (pose) {
                  const p = pose.transform.position;
                  // Place BH at grip position + offset
                  this.bhWorldPosition.set(p.x + this.grabOffset.x, p.y + this.grabOffset.y, p.z + this.grabOffset.z);
                  this.vrSphere.position.copy(this.bhWorldPosition);
                  break;
                }
              }
            }
          }
        }

        this.vrMaterial.uniforms.uBHCenter.value.copy(this.bhWorldPosition);
      }
    }

    // Animate geodesic trail
    if (this.activeTrail) {
      const trail = this.activeTrail;
      // Advance ~10 points per frame for smooth animation
      const advance = Math.min(10, trail.points.length - trail.index);
      if (advance > 0) {
        trail.index += advance;
        trail.line.geometry.setDrawRange(0, trail.index);
      } else {
        this.activeTrail = null; // animation complete
      }
    }

    // Smooth camera interpolation (desktop only)
    if (!isPresenting) {
      this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * 0.08;
      this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * 0.08;
      this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * 0.08;

      // Slow auto-rotation when not dragging (disabled in AR and geodesic modes)
      if (!this.isDragging && !this.arModeActive && !this.geodesicMode) {
        this.targetSpherical.theta += dt * 0.03;
      }

      this.updateOrbitCamera();
      this.bhMaterial.uniforms.uCameraMatrix.value = this.orbitCamera.matrixWorld;

      // Update inverse camera matrix for AR mode
      this.invCameraMatrix.copy(this.orbitCamera.matrixWorld).invert();
      this.bhMaterial.uniforms.uInvCameraMatrix.value = this.invCameraMatrix;

      // Half-resolution on mobile for performance
      const isMobile = window.innerWidth < 768;
      const scale = isMobile ? 0.5 : 1.0;
      this.bhMaterial.uniforms.uResolution.value.set(
        window.innerWidth * scale,
        window.innerHeight * scale,
      );
    }
  }

  onResize(w: number, h: number): void {
    this.bhMaterial.uniforms.uResolution.value.set(w, h);
    this.orbitCamera.aspect = w / h;
    this.orbitCamera.updateProjectionMatrix();
  }

  getUI(): HTMLElement | null {
    return this.panelEl;
  }

  /** Convert slider mass (r_s scale) to solar masses for equation display */
  private getMassSolarMasses(): number {
    // The slider goes 50–500 mapped to 0.5–5.0 r_s.
    // For equation display, treat the slider value as solar masses (×10 for a reasonable BH).
    // mass field = r_s scale (0.5 to 5.0). Map to ~5–50 M☉ for realistic equations.
    return this.mass * 10;
  }

  /** Current parameter values for equation computation */
  private getEquationParams(): Record<string, number> {
    return { mass: this.getMassSolarMasses(), spin: this.spin };
  }

  private async ensureEquationsSection(mode: ViewMode): Promise<void> {
    if (!this.panelEl) return;
    removeEquationsSection(this.panelEl);

    if (mode === "explorer") return;

    const section = await buildEquationsSection(blackholeEquations, mode, this.getEquationParams());
    if (section) this.panelEl.appendChild(section);
  }

  private updateEquationValues(): void {
    if (!this.panelEl) return;
    const section = this.panelEl.querySelector<HTMLElement>(".info-equations");
    if (!section) return;
    updateEquationValues(section, blackholeEquations, this.getEquationParams());
  }

  dispose(): void {
    this.stopCameraFeed();

    if (this.starfieldTexture) {
      this.starfieldTexture.dispose();
      this.starfieldTexture = null;
    }

    if (this.unsubViewMode) {
      this.unsubViewMode();
      this.unsubViewMode = null;
    }

    for (const { el, type, fn } of this.boundHandlers) {
      el.removeEventListener(type, fn);
    }
    this.boundHandlers = [];

    this.ctx.scene.remove(this.quad);
    this.ctx.scene.remove(this.vrSphere);

    // Clean up geodesic mode objects
    this.clearGeodesicTrails();
    if (this.launchIndicator) {
      this.geodesicGroup.remove(this.launchIndicator);
      this.launchIndicator.dispose();
      this.launchIndicator = null;
    }
    this.ctx.scene.remove(this.geodesicGroup);
    this.geodesicMode = false;

    if (this.vrPanel) {
      this.ctx.xrManager?.unregisterPanel(this.vrPanel);
      this.ctx.scene.remove(this.vrPanel.mesh);
      this.vrPanel.dispose();
      this.vrPanel = null;
    }
    if (this.ctx.xrManager) {
      this.ctx.xrManager.onMenuPress = null;
      this.ctx.xrManager.onControllerSelectStart = null;
      this.ctx.xrManager.onControllerSelectEnd = null;
    }
    if (this.vrTutorial) {
      this.vrTutorial.dispose(this.ctx.scene);
      this.vrTutorial = null;
    }

    // Clean up passthrough state
    if (this.vrSphereOriginalGeo) {
      this.vrSphere.geometry.dispose();
      this.vrSphere.geometry = this.vrSphereOriginalGeo;
      this.vrSphereOriginalGeo = null;
    }
    this.passthroughActive = false;
    this.grabbing = false;

    if (this.panelEl?.parentNode) {
      this.panelEl.parentNode.removeChild(this.panelEl);
    }

    // Re-enable OrbitControls
    this.ctx.controls.enabled = true;
  }
}
