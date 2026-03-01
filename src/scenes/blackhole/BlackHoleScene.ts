import * as THREE from "three";
import type { Scene, SceneContext } from "../types";
import { getViewMode, onViewModeChange, type ViewMode } from "../../lib/view-mode";
import { blackholeEquations } from "../../lib/equation-data";
import { buildEquationsSection, updateEquationValues, removeEquationsSection } from "../../lib/equations";
import { VRPanel } from "../../lib/VRPanel";
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
  private wasPresenting = false;

  // Interaction state
  private isDragging = false;
  private prevMouse = new THREE.Vector2();
  private spherical = new THREE.Spherical(15, Math.PI / 2.2, 0);
  private targetSpherical = new THREE.Spherical(15, Math.PI / 2.2, 0);
  private mass = 1.5; // Schwarzschild radius scale
  private showDisk = true;
  private elapsed = 0;
  private pinchStartDist = 0; // for pinch-zoom

  // AR mode state
  private arModeActive = false;
  private cameraStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private videoTexture: THREE.CanvasTexture | null = null;
  private arCanvas: HTMLCanvasElement | null = null;
  private arCtx: CanvasRenderingContext2D | null = null;
  private arCheckbox: HTMLInputElement | null = null;
  private invCameraMatrix = new THREE.Matrix4();

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
          uShowDisk: { value: 1.0 },
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
          uCameraMatrix: { value: this.orbitCamera.matrixWorld },
          uFov: { value: THREE.MathUtils.degToRad(60) },
          uBackground: { value: new THREE.Texture() },
          uUseCamera: { value: 0.0 },
          uMirrorX: { value: 1.0 },
          uInvCameraMatrix: { value: new THREE.Matrix4() },
        },
        depthWrite: false,
        depthTest: false,
      });

      this.quad = new THREE.Mesh(geometry, this.bhMaterial);
      this.quad.frustumCulled = false;
      scene.add(this.quad);

      // ─── Inverted sphere (VR skybox) ───
      const sphereGeo = new THREE.IcosahedronGeometry(50, 5);
      // Invert normals so the shader renders on inside faces
      sphereGeo.scale(-1, 1, 1);

      this.vrMaterial = new THREE.ShaderMaterial({
        vertexShader: vrVertexShader,
        fragmentShader: vrFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uMass: { value: this.mass },
          uShowDisk: { value: 1.0 },
          uCameraPosVR: { value: new THREE.Vector3() },
        },
        side: THREE.BackSide,
        depthWrite: false,
      });

      this.vrSphere = new THREE.Mesh(sphereGeo, this.vrMaterial);
      this.vrSphere.frustumCulled = false;
      this.vrSphere.visible = false;
      scene.add(this.vrSphere);
    } else {
      // Re-add meshes to scene on re-entry
      scene.add(this.quad);
      scene.add(this.vrSphere);
    }

    // ─── Disable OrbitControls — we handle camera ourselves ───
    ctx.controls.enabled = false;

    // ─── UI panel ───
    if (firstInit) {
      this.buildPanel();
    } else {
      document.body.appendChild(this.panelEl!);
    }

    // ─── Hide irrelevant UI ───
    for (const id of ["event-info", "event-list", "time-controls", "map-legend", "help-overlay", "ui"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    }

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
    this.vrPanel = new VRPanel(1.4, 0.5);
    this.vrPanel.setTitle("Black Hole");

    // 3 buttons in a row
    const btnY = 0.55;
    const btnH = 0.35;
    const btnW = 0.30;
    const gap = 0.03;
    const startX = 0.04;

    // Mass button — cycles through preset values
    const massValues = [0.5, 1.0, 1.5, 2.5, 4.0];
    let massIdx = 2; // start at 1.5
    this.vrPanel.addButton({
      label: `Mass: ${this.mass}`,
      x: startX,
      y: btnY,
      w: btnW,
      h: btnH,
      onClick: () => {
        massIdx = (massIdx + 1) % massValues.length;
        this.mass = massValues[massIdx];
        this.bhMaterial.uniforms.uMass.value = this.mass;
        this.vrMaterial.uniforms.uMass.value = this.mass;
        this.vrPanel?.updateButton(0, `Mass: ${this.mass}`);
        this.updateEquationValuesForMass();
        // Sync DOM slider if present
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
      y: btnY,
      w: btnW,
      h: btnH,
      onClick: () => {
        this.showDisk = !this.showDisk;
        this.bhMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
        this.vrMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
        this.vrPanel?.updateButton(1, this.showDisk ? "Disk: ON" : "Disk: OFF");
        // Sync DOM checkbox
        const cb = this.panelEl?.querySelector("#bh-disk") as HTMLInputElement | null;
        if (cb) cb.checked = this.showDisk;
      },
    });

    // AR toggle (disabled in VR — label only)
    this.vrPanel.addButton({
      label: "AR: N/A",
      x: startX + (btnW + gap) * 2,
      y: btnY,
      w: btnW,
      h: btnH,
      onClick: () => {
        // AR not available in VR mode — no-op
      },
    });

    xr.registerPanel(this.vrPanel);

    xr.onSessionStart = () => {
      if (this.vrPanel) {
        this.vrPanel.positionInFront(ctx.camera, 2, -0.3);
        ctx.scene.add(this.vrPanel.mesh);
      }
    };

    xr.onSessionEnd = () => {
      if (this.vrPanel) {
        ctx.scene.remove(this.vrPanel.mesh);
      }
    };

    // If already in VR (scene switch mid-session), show panel immediately
    if (xr.isPresenting && this.vrPanel) {
      this.vrPanel.positionInFront(ctx.camera, 2, -0.3);
      ctx.scene.add(this.vrPanel.mesh);
    }
  }

  // ─── Desktop / VR mode switching ──────────────────────────────────

  private switchToVR() {
    this.quad.visible = false;
    this.vrSphere.visible = true;
    // Sync VR material uniforms
    this.vrMaterial.uniforms.uMass.value = this.mass;
    this.vrMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
  }

  private switchToDesktop() {
    this.vrSphere.visible = false;
    this.quad.visible = true;
  }

  private buildPanel() {
    this.panelEl = document.createElement("div");
    this.panelEl.id = "blackhole-panel";
    this.panelEl.className = "glass";
    this.panelEl.innerHTML = `
      <h3 class="bh-title">Black Hole</h3>
      <div class="bh-params">
        <div class="bh-row">
          <label>Mass</label>
          <input type="range" class="bh-slider" id="bh-mass" min="50" max="500" value="150" />
          <span class="bh-val" id="bh-mass-val">1.5 r<sub>s</sub></span>
        </div>
        <div class="bh-row">
          <label class="bh-toggle-label">
            <input type="checkbox" id="bh-disk" checked />
            Accretion Disk
          </label>
        </div>
        <div class="bh-row">
          <label class="bh-toggle-label">
            <input type="checkbox" id="bh-ar" />
            AR Mode
          </label>
        </div>
      </div>
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
      this.updateEquationValuesForMass();
    });

    // Disk toggle
    const diskCheckbox = this.panelEl.querySelector("#bh-disk") as HTMLInputElement;
    diskCheckbox.addEventListener("change", () => {
      this.showDisk = diskCheckbox.checked;
      this.bhMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
      this.vrMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
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
      this.arModeActive = true;
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
    this.arModeActive = false;
  }

  private addHandler(el: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions) {
    el.addEventListener(type, fn, options);
    this.boundHandlers.push({ el, type, fn });
  }

  private setupInteraction(ctx: SceneContext) {
    const canvas = ctx.renderer.domElement;

    // Mouse drag to orbit
    this.addHandler(canvas, "mousedown", ((e: MouseEvent) => {
      this.isDragging = true;
      this.prevMouse.set(e.clientX, e.clientY);
    }) as EventListener);

    this.addHandler(window, "mousemove", ((e: MouseEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.prevMouse.set(e.clientX, e.clientY);

      this.targetSpherical.theta -= dx * 0.012;
      this.targetSpherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
        this.targetSpherical.phi - dy * 0.012));
    }) as EventListener);

    this.addHandler(window, "mouseup", (() => {
      this.isDragging = false;
    }) as EventListener);

    // Touch support — single finger orbit, two finger pinch zoom
    this.addHandler(canvas, "touchstart", ((e: TouchEvent) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.prevMouse.set(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        this.isDragging = false;
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
      if (!this.isDragging || e.touches.length !== 1) return;
      const tdx = e.touches[0].clientX - this.prevMouse.x;
      const tdy = e.touches[0].clientY - this.prevMouse.y;
      this.prevMouse.set(e.touches[0].clientX, e.touches[0].clientY);

      this.targetSpherical.theta -= tdx * 0.012;
      this.targetSpherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
        this.targetSpherical.phi - tdy * 0.012));
    }) as EventListener, { passive: false });

    this.addHandler(canvas, "touchend", (() => {
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
      const xrCamera = this.ctx.renderer.xr.getCamera();
      this.vrMaterial.uniforms.uCameraPosVR.value.copy(xrCamera.position);
    }

    // Smooth camera interpolation (desktop only)
    if (!isPresenting) {
      this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * 0.08;
      this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * 0.08;
      this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * 0.08;

      // Slow auto-rotation when not dragging (disabled in AR mode)
      if (!this.isDragging && !this.arModeActive) {
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

  private async ensureEquationsSection(mode: ViewMode): Promise<void> {
    if (!this.panelEl) return;
    removeEquationsSection(this.panelEl);

    if (mode === "explorer") return;

    const values = { mass: this.getMassSolarMasses() };
    const section = await buildEquationsSection(blackholeEquations, mode, values);
    if (section) this.panelEl.appendChild(section);
  }

  private updateEquationValuesForMass(): void {
    if (!this.panelEl) return;
    const section = this.panelEl.querySelector<HTMLElement>(".info-equations");
    if (!section) return;
    updateEquationValues(section, blackholeEquations, { mass: this.getMassSolarMasses() });
  }

  dispose(): void {
    this.stopCameraFeed();

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

    if (this.vrPanel) {
      this.ctx.xrManager?.unregisterPanel(this.vrPanel);
      this.ctx.scene.remove(this.vrPanel.mesh);
      this.vrPanel.dispose();
      this.vrPanel = null;
    }

    if (this.panelEl?.parentNode) {
      this.panelEl.parentNode.removeChild(this.panelEl);
    }

    // Re-enable OrbitControls
    this.ctx.controls.enabled = true;
  }
}
