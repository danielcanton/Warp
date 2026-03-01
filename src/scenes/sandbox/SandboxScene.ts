import * as THREE from "three";
import type { Scene, SceneContext } from "../types";
import { generateCustomWaveform, waveformToTexture, type BinaryParams } from "../../lib/waveform-generator";
import { GWAudioEngine } from "../../lib/audio";
import { BinarySystem } from "../../lib/binary";
import { VRPanel } from "../../lib/VRPanel";
import type { WaveformData, GWEvent } from "../../lib/waveform";
import { SandboxPanel } from "./SandboxPanel";
import vertexShader from "../../shaders/spacetime.vert.glsl?raw";
import fragmentShader from "../../shaders/spacetime.frag.glsl?raw";

export class SandboxScene implements Scene {
  readonly id = "sandbox";
  readonly label = "Sandbox";
  readonly supportsXR = true;

  private ctx!: SceneContext;
  private group = new THREE.Group();
  private spacetimeMaterial!: THREE.ShaderMaterial;
  private binary = new BinarySystem();
  private mergerGlow!: THREE.Mesh;
  private glowMaterial!: THREE.MeshBasicMaterial;
  private stars!: THREE.Points;
  private audio = new GWAudioEngine();
  private panel!: SandboxPanel;

  private currentParams: BinaryParams = {
    m1: 36, m2: 29, chi1: 0, chi2: 0, distance: 440, inclination: 0,
  };
  private currentWaveform: WaveformData | null = null;
  private playbackTime = 0;
  private isPlaying = false;
  private playbackSpeed = 1.0;

  // Orbit preview state (shows objects orbiting before merge)
  private previewPhase = 0;

  // UI elements
  private playBtn!: HTMLElement;
  private timeSlider!: HTMLInputElement;
  private timeLabel!: HTMLElement;
  private speedBtn!: HTMLElement;
  private speedLabel!: HTMLElement;
  private timeControlsEl!: HTMLElement;

  // Speed control
  private speeds = [0.25, 0.5, 1, 2, 4];
  private speedIndex = 2;

  // VR panel
  private vrPanel: VRPanel | null = null;

  private boundHandlers: { el: EventTarget; type: string; fn: EventListener }[] = [];
  private initialized = false;

  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;
    const { scene, camera, controls } = ctx;
    const firstInit = !this.initialized;

    // ─── Build 3D objects ───
    if (firstInit) {
      this.buildSceneObjects(scene);
    } else {
      scene.add(this.group);
      scene.add(this.stars);
    }

    // ─── Camera setup ───
    camera.position.set(3, 4, 7);
    camera.lookAt(0, 0.5, 0);
    controls.target.set(0, 0.5, 0);
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.minDistance = 2;
    controls.maxDistance = 25;
    controls.enabled = true;
    scene.fog = new THREE.FogExp2(0x000005, 0.04);

    // ─── UI panel ───
    if (firstInit) {
      this.panel = new SandboxPanel(
        (params) => this.onParamsChange(params),
        () => this.triggerMerge(),
      );
    }
    document.body.appendChild(this.panel.element);

    // ─── Cache time control elements (once) ───
    if (firstInit) {
      this.playBtn = document.getElementById("play-btn")!;
      this.timeSlider = document.getElementById("time-slider") as HTMLInputElement;
      this.timeLabel = document.getElementById("time-label")!;
      this.speedBtn = document.getElementById("speed-btn")!;
      this.speedLabel = document.getElementById("speed-label")!;
      this.timeControlsEl = document.getElementById("time-controls")!;
    }
    this.timeControlsEl.style.display = "flex";

    // Hide other scenes' UI
    for (const id of ["event-info", "event-list", "map-legend", "help-overlay", "ui"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    }

    // Remove loading screen if present
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.classList.add("fade-out");
      setTimeout(() => loadingScreen.remove(), 700);
    }

    this.setupHandlers();

    // ─── VR Panel ───
    if (ctx.xrManager && !this.vrPanel) {
      this.setupVRPanel(ctx);
    }

    // Generate initial waveform
    if (firstInit) {
      this.currentWaveform = generateCustomWaveform(this.currentParams);
      this.audio.prepare(this.currentWaveform);
      this.updateTexture();
      this.initialized = true;
    }
  }

  private buildSceneObjects(scene: THREE.Scene) {
    // Spacetime mesh
    const defaultWaveformData = new Float32Array(512 * 4);
    for (let i = 0; i < 512; i++) {
      defaultWaveformData[i * 4] = 0.5;
      defaultWaveformData[i * 4 + 1] = 0.5;
      defaultWaveformData[i * 4 + 2] = 0;
      defaultWaveformData[i * 4 + 3] = 1;
    }
    const defaultTexture = new THREE.DataTexture(
      defaultWaveformData, 512, 1, THREE.RGBAFormat, THREE.FloatType
    );
    defaultTexture.needsUpdate = true;
    defaultTexture.minFilter = THREE.LinearFilter;
    defaultTexture.magFilter = THREE.LinearFilter;

    this.spacetimeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: 1.8 },
        uWaveform: { value: defaultTexture },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    const spacetimeGeometry = new THREE.PlaneGeometry(16, 16, 200, 200);
    spacetimeGeometry.rotateX(-Math.PI / 2);
    this.group.add(new THREE.Mesh(spacetimeGeometry, this.spacetimeMaterial));

    // Binary system
    this.group.add(this.binary.group);

    // Merger glow
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x6366f1, transparent: true, opacity: 0,
    });
    this.mergerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 32, 32), this.glowMaterial
    );
    this.mergerGlow.position.set(0, 0.6, 0);
    this.group.add(this.mergerGlow);

    this.group.add(new THREE.AmbientLight(0x404060, 0.4));
    scene.add(this.group);

    // Ambient stars
    const starCount = 4000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 25 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xccccff, size: 0.06, sizeAttenuation: true,
      transparent: true, opacity: 0.7,
    });
    this.stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(this.stars);
  }

  private addHandler(el: EventTarget, type: string, fn: EventListener) {
    el.addEventListener(type, fn);
    this.boundHandlers.push({ el, type, fn });
  }

  private setupHandlers() {
    this.addHandler(this.playBtn, "click", () => {
      if (!this.currentWaveform) return;
      if (this.isPlaying) {
        this.isPlaying = false;
        this.audio.stop();
        this.playBtn.innerHTML = "&#9654;";
        this.vrPanel?.updateButton(0, "\u25B6");
      } else {
        this.isPlaying = true;
        if (this.playbackTime >= 0.99) {
          this.playbackTime = 0;
          this.binary.reset();
        }
        this.audio.play(this.playbackTime, this.playbackSpeed);
        this.playBtn.innerHTML = "&#9646;&#9646;";
        this.vrPanel?.updateButton(0, "\u23F8");
      }
    });

    this.addHandler(this.timeSlider, "input", () => {
      this.playbackTime = parseInt(this.timeSlider.value) / 1000;
      this.binary.reset();
      if (this.isPlaying) {
        this.audio.play(this.playbackTime, this.playbackSpeed);
      }
    });

    this.addHandler(this.speedBtn, "click", () => {
      this.speedIndex = (this.speedIndex + 1) % this.speeds.length;
      this.playbackSpeed = this.speeds[this.speedIndex];
      this.speedLabel.textContent = `${this.playbackSpeed}x`;
      this.audio.setSpeed(this.playbackSpeed);
      this.vrPanel?.updateButton(1, `${this.playbackSpeed}x`);
    });

    // Keyboard
    this.addHandler(window, "keydown", ((e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); this.playBtn.click(); }
      if (e.code === "KeyS") this.speedBtn.click();
    }) as EventListener);
  }

  private onParamsChange(params: BinaryParams) {
    this.currentParams = params;
    // Regenerate waveform preview on parameter change
    this.currentWaveform = generateCustomWaveform(params);
    this.audio.prepare(this.currentWaveform);
    this.updateTexture();
    this.binary.setEventType(this.toFakeEvent());
  }

  private triggerMerge() {
    if (!this.currentWaveform) return;
    this.playbackTime = 0;
    this.isPlaying = true;
    this.binary.reset();
    this.audio.play(0, this.playbackSpeed);
    this.playBtn.innerHTML = "&#9646;&#9646;";
    this.vrPanel?.updateButton(0, "\u23F8");
  }

  private updateTexture() {
    if (!this.currentWaveform) return;
    const texture = waveformToTexture(this.currentWaveform);
    this.spacetimeMaterial.uniforms.uWaveform.value = texture;

    const totalMass = this.currentParams.m1 + this.currentParams.m2;
    const snrScale = Math.min(totalMass / 50, 3);
    this.spacetimeMaterial.uniforms.uAmplitude.value = 1.2 + snrScale * 0.6;
  }

  private setupVRPanel(ctx: SceneContext) {
    const xr = ctx.xrManager!;
    this.vrPanel = new VRPanel(1.2, 0.5);
    this.vrPanel.setTitle("Binary Sandbox");

    const btnY = 0.55;
    const btnH = 0.35;
    const btnW = 0.28;
    const gap = 0.03;
    const startX = 0.05;

    this.vrPanel.addButton({
      label: this.isPlaying ? "\u23F8" : "\u25B6",
      x: startX,
      y: btnY,
      w: btnW,
      h: btnH,
      onClick: () => {
        this.playBtn.click();
      },
    });

    this.vrPanel.addButton({
      label: `${this.playbackSpeed}x`,
      x: startX + btnW + gap,
      y: btnY,
      w: btnW,
      h: btnH,
      onClick: () => {
        this.speedBtn.click();
      },
    });

    this.vrPanel.addButton({
      label: "Merge",
      x: startX + (btnW + gap) * 2,
      y: btnY,
      w: btnW,
      h: btnH,
      onClick: () => {
        this.triggerMerge();
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

  // Create a fake GWEvent for the binary system update
  private toFakeEvent(): GWEvent {
    return {
      commonName: "Custom",
      GPS: 0,
      mass_1_source: this.currentParams.m1,
      mass_1_source_lower: 0,
      mass_1_source_upper: 0,
      mass_2_source: this.currentParams.m2,
      mass_2_source_lower: 0,
      mass_2_source_upper: 0,
      luminosity_distance: this.currentParams.distance,
      luminosity_distance_lower: 0,
      luminosity_distance_upper: 0,
      redshift: 0,
      chi_eff: (this.currentParams.m1 * this.currentParams.chi1 + this.currentParams.m2 * this.currentParams.chi2) / (this.currentParams.m1 + this.currentParams.m2),
      network_matched_filter_snr: 0,
      far: 0,
      catalog_shortName: "",
      total_mass_source: this.currentParams.m1 + this.currentParams.m2,
      chirp_mass_source: 0,
      chirp_mass_source_lower: 0,
      chirp_mass_source_upper: 0,
      final_mass_source: 0,
      final_mass_source_lower: 0,
      final_mass_source_upper: 0,
      p_astro: 0,
    };
  }

  update(dt: number, elapsed: number): void {
    if (this.isPlaying && this.currentWaveform) {
      this.playbackTime += (dt * this.playbackSpeed) / this.currentWaveform.duration;
      if (this.playbackTime >= 1.0) {
        this.playbackTime = 1.0;
        this.isPlaying = false;
        this.audio.stop();
        this.playBtn.innerHTML = "&#9654;";
        this.vrPanel?.updateButton(0, "\u25B6");
      }
    }

    this.spacetimeMaterial.uniforms.uTime.value = this.playbackTime;

    if (this.currentWaveform) {
      const fakeEvent = this.toFakeEvent();
      this.binary.update(this.playbackTime, this.currentWaveform, fakeEvent);

      // Merger glow
      const mergerNorm = this.currentWaveform.peakIndex / this.currentWaveform.hPlus.length;
      const distFromMerger = Math.abs(this.playbackTime - mergerNorm);
      const glowIntensity = Math.max(0, 1 - distFromMerger * 8);
      this.glowMaterial.opacity = glowIntensity * 0.9;
      this.mergerGlow.scale.setScalar(1 + glowIntensity * 3);
      this.ctx.bloom.intensity = 1.2 + glowIntensity * 3;
    }

    // Subtle camera drift
    if (!this.isPlaying) {
      this.ctx.camera.position.x += Math.sin(elapsed * 0.1) * 0.002;
      this.ctx.camera.position.y += Math.cos(elapsed * 0.07) * 0.001;
    }

    // Time controls
    this.timeSlider.value = String(Math.floor(this.playbackTime * 1000));
    if (this.currentWaveform) {
      this.timeLabel.textContent = `${(this.playbackTime * this.currentWaveform.duration).toFixed(2)}s`;
    }

    this.ctx.controls.update();
  }

  onResize(_w: number, _h: number): void {}

  getUI(): HTMLElement | null {
    return this.panel?.element ?? null;
  }

  dispose(): void {
    for (const { el, type, fn } of this.boundHandlers) {
      el.removeEventListener(type, fn);
    }
    this.boundHandlers = [];

    // Clean up VR panel
    if (this.vrPanel) {
      this.ctx.xrManager?.unregisterPanel(this.vrPanel);
      this.ctx.scene.remove(this.vrPanel.mesh);
      this.vrPanel.dispose();
      this.vrPanel = null;
    }

    this.ctx.scene.remove(this.group);
    this.ctx.scene.remove(this.stars);
    this.audio.stop();
    this.panel?.dispose();
    this.timeControlsEl.style.display = "none";
  }
}
