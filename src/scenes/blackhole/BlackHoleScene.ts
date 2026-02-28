import * as THREE from "three";
import type { Scene, SceneContext } from "../types";
import vertexShader from "../../shaders/blackhole.vert.glsl?raw";
import fragmentShader from "../../shaders/blackhole.frag.glsl?raw";

export class BlackHoleScene implements Scene {
  readonly id = "blackhole";
  readonly label = "Black Hole";
  readonly supportsXR = false; // Fullscreen quad doesn't work in VR yet

  private ctx!: SceneContext;
  private quad!: THREE.Mesh;
  private bhMaterial!: THREE.ShaderMaterial;
  private orbitCamera!: THREE.PerspectiveCamera; // Independent camera for orbiting
  private panelEl: HTMLElement | null = null;

  // Interaction state
  private isDragging = false;
  private prevMouse = new THREE.Vector2();
  private spherical = new THREE.Spherical(15, Math.PI / 2.2, 0);
  private targetSpherical = new THREE.Spherical(15, Math.PI / 2.2, 0);
  private mass = 1.5; // Schwarzschild radius scale
  private showDisk = true;
  private elapsed = 0;

  // AR mode state
  private arModeActive = false;
  private cameraStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private videoTexture: THREE.VideoTexture | null = null;
  private arCheckbox: HTMLInputElement | null = null;
  private invCameraMatrix = new THREE.Matrix4();

  private boundHandlers: { el: EventTarget; type: string; fn: EventListener }[] = [];
  private initialized = false;

  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;
    const { scene } = ctx;
    const firstInit = !this.initialized;

    // Clear fog — black hole scene manages its own background
    scene.fog = null;

    if (firstInit) {
      // ─── Fullscreen quad ───
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
          uInvCameraMatrix: { value: new THREE.Matrix4() },
        },
        depthWrite: false,
        depthTest: false,
      });

      this.quad = new THREE.Mesh(geometry, this.bhMaterial);
      this.quad.frustumCulled = false;
      scene.add(this.quad);
    } else {
      // Re-add quad to scene on re-entry
      scene.add(this.quad);
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
    document.getElementById("event-info")!.style.display = "none";
    document.getElementById("event-list")!.style.display = "none";
    document.getElementById("time-controls")!.style.display = "none";
    document.getElementById("map-legend")!.style.display = "none";
    document.getElementById("help-overlay")!.style.display = "none";
    document.getElementById("ui")!.style.display = "none";

    // Remove loading screen if present
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.classList.add("fade-out");
      setTimeout(() => loadingScreen.remove(), 700);
    }

    this.setupInteraction(ctx);

    if (firstInit) {
      this.initialized = true;
    }
  }

  private updateOrbitCamera() {
    this.orbitCamera.position.setFromSpherical(this.spherical);
    this.orbitCamera.lookAt(0, 0, 0);
    this.orbitCamera.updateMatrixWorld();
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
    });

    // Disk toggle
    const diskCheckbox = this.panelEl.querySelector("#bh-disk") as HTMLInputElement;
    diskCheckbox.addEventListener("change", () => {
      this.showDisk = diskCheckbox.checked;
      this.bhMaterial.uniforms.uShowDisk.value = this.showDisk ? 1.0 : 0.0;
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
    try {
      // Try rear camera first (mobile), fall back to any camera (laptop)
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));

      this.videoElement = document.createElement("video");
      this.videoElement.srcObject = this.cameraStream;
      this.videoElement.setAttribute("playsinline", "");
      this.videoElement.muted = true;
      await this.videoElement.play();

      this.videoTexture = new THREE.VideoTexture(this.videoElement);
      this.videoTexture.minFilter = THREE.LinearFilter;
      this.videoTexture.magFilter = THREE.LinearFilter;

      this.bhMaterial.uniforms.uBackground.value = this.videoTexture;
      this.bhMaterial.uniforms.uUseCamera.value = 1.0;
      this.arModeActive = true;
    } catch (err) {
      console.warn("AR camera failed:", err);
      if (this.arCheckbox) this.arCheckbox.checked = false;
      this.arModeActive = false;

      // Show brief hint so user knows why it failed
      const hint = this.panelEl?.querySelector(".bh-hint");
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
    this.bhMaterial.uniforms.uUseCamera.value = 0.0;
    this.bhMaterial.uniforms.uBackground.value = new THREE.Texture();
    this.arModeActive = false;
  }

  private addHandler(el: EventTarget, type: string, fn: EventListener) {
    el.addEventListener(type, fn);
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

      this.targetSpherical.theta -= dx * 0.005;
      this.targetSpherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
        this.targetSpherical.phi - dy * 0.005));
    }) as EventListener);

    this.addHandler(window, "mouseup", (() => {
      this.isDragging = false;
    }) as EventListener);

    // Touch support
    this.addHandler(canvas, "touchstart", ((e: TouchEvent) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.prevMouse.set(e.touches[0].clientX, e.touches[0].clientY);
      }
    }) as EventListener);

    this.addHandler(canvas, "touchmove", ((e: TouchEvent) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - this.prevMouse.x;
      const dy = e.touches[0].clientY - this.prevMouse.y;
      this.prevMouse.set(e.touches[0].clientX, e.touches[0].clientY);

      this.targetSpherical.theta -= dx * 0.005;
      this.targetSpherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
        this.targetSpherical.phi - dy * 0.005));
    }) as EventListener);

    this.addHandler(canvas, "touchend", (() => {
      this.isDragging = false;
    }) as EventListener);

    // Scroll to zoom
    this.addHandler(canvas, "wheel", ((e: WheelEvent) => {
      e.preventDefault();
      this.targetSpherical.radius = Math.max(3, Math.min(80,
        this.targetSpherical.radius + e.deltaY * 0.02));
    }) as EventListener);
  }

  update(dt: number, _elapsed: number): void {
    this.elapsed += dt;
    this.bhMaterial.uniforms.uTime.value = this.elapsed;

    // Smooth camera interpolation
    this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * 0.08;
    this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * 0.08;
    this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * 0.08;

    // Slow auto-rotation when not dragging (disabled in AR mode)
    if (!this.isDragging && !this.arModeActive) {
      this.targetSpherical.theta += dt * 0.03;
    }

    if (this.arModeActive) {
      // Lock camera to fixed position in AR mode so projection aligns with physical camera
      this.orbitCamera.position.set(0, 0, 15);
      this.orbitCamera.lookAt(0, 0, 0);
      this.orbitCamera.updateMatrixWorld();
    } else {
      this.updateOrbitCamera();
    }
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

  onResize(w: number, h: number): void {
    this.bhMaterial.uniforms.uResolution.value.set(w, h);
    this.orbitCamera.aspect = w / h;
    this.orbitCamera.updateProjectionMatrix();
  }

  getUI(): HTMLElement | null {
    return this.panelEl;
  }

  dispose(): void {
    this.stopCameraFeed();

    for (const { el, type, fn } of this.boundHandlers) {
      el.removeEventListener(type, fn);
    }
    this.boundHandlers = [];

    this.ctx.scene.remove(this.quad);

    if (this.panelEl?.parentNode) {
      this.panelEl.parentNode.removeChild(this.panelEl);
    }

    // Re-enable OrbitControls
    this.ctx.controls.enabled = true;
  }
}
