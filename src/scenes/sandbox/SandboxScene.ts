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

  // Haptic feedback
  private static readonly WAVE_SPEED = 4; // m/s
  private readonly mergerCenter = new THREE.Vector3(0, 0.6, 0);

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

    // Hide merger-specific UI but keep #ui bar visible (VR button, screenshot)
    for (const id of ["event-info", "event-list", "map-legend", "help-overlay", "map-toggle", "tour-toggle", "events-toggle"]) {
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
        this.vrPanel?.updateButton(10, "\u25B6");
      } else {
        this.isPlaying = true;
        if (this.playbackTime >= 0.99) {
          this.playbackTime = 0;
          this.binary.reset();
        }
        this.audio.play(this.playbackTime, this.playbackSpeed);
        this.playBtn.innerHTML = "&#9646;&#9646;";
        this.vrPanel?.updateButton(10, "\u23F8");
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
      this.vrPanel?.updateButton(11, `${this.playbackSpeed}x`);
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
    this.vrPanel?.updateButton(10, "\u23F8");
  }

  private updateTexture() {
    if (!this.currentWaveform) return;
    const texture = waveformToTexture(this.currentWaveform);
    this.spacetimeMaterial.uniforms.uWaveform.value = texture;

    const totalMass = this.currentParams.m1 + this.currentParams.m2;
    const snrScale = Math.min(totalMass / 50, 3);
    this.spacetimeMaterial.uniforms.uAmplitude.value = 1.2 + snrScale * 0.6;
  }

  private updateVRPanelTitle() {
    if (!this.vrPanel) return;
    const p = this.currentParams;
    const chi = ((p.m1 * p.chi1 + p.m2 * p.chi2) / (p.m1 + p.m2)).toFixed(2);
    this.vrPanel.setTitle(`${p.m1} + ${p.m2} M\u2609  \u03C7: ${chi}`);
  }

  private setupVRPanel(ctx: SceneContext) {
    const xr = ctx.xrManager!;
    this.vrPanel = new VRPanel(1.4, 1.0);
    this.updateVRPanelTitle();

    const btnH = 0.16;
    const btnW = 0.21;
    const gap = 0.015;
    const startX = 0.03;

    // ── Row 1: Presets ──
    const row1Y = 0.30;
    const presets: { label: string; m1: number; m2: number; chi1: number; chi2: number }[] = [
      { label: "Light BBH", m1: 10, m2: 10, chi1: 0, chi2: 0 },
      { label: "Heavy BBH", m1: 50, m2: 40, chi1: 0, chi2: 0 },
      { label: "BNS", m1: 1.4, m2: 1.4, chi1: 0, chi2: 0 },
      { label: "NSBH", m1: 1.4, m2: 10, chi1: 0, chi2: 0 },
    ];

    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i];
      this.vrPanel.addButton({
        label: preset.label,
        x: startX + i * (btnW + gap), y: row1Y, w: btnW, h: btnH,
        onClick: () => {
          this.currentParams = { ...this.currentParams, m1: preset.m1, m2: preset.m2, chi1: preset.chi1, chi2: preset.chi2 };
          this.onParamsChange(this.currentParams);
          this.updateVRPanelTitle();
        },
      });
    }

    // ── Row 2: Mass adjustment ──
    const row2Y = 0.50;
    const massStep = 5;

    // Button indices: 4=M1-, 5=M1+, 6=M2-, 7=M2+
    this.vrPanel.addButton({
      label: "M1 \u2212",
      x: startX, y: row2Y, w: btnW, h: btnH,
      onClick: () => {
        this.currentParams.m1 = Math.max(1, this.currentParams.m1 - massStep);
        this.onParamsChange(this.currentParams);
        this.updateVRPanelTitle();
      },
    });
    this.vrPanel.addButton({
      label: "M1 +",
      x: startX + (btnW + gap), y: row2Y, w: btnW, h: btnH,
      onClick: () => {
        this.currentParams.m1 = Math.min(150, this.currentParams.m1 + massStep);
        this.onParamsChange(this.currentParams);
        this.updateVRPanelTitle();
      },
    });
    this.vrPanel.addButton({
      label: "M2 \u2212",
      x: startX + (btnW + gap) * 2, y: row2Y, w: btnW, h: btnH,
      onClick: () => {
        this.currentParams.m2 = Math.max(1, this.currentParams.m2 - massStep);
        this.onParamsChange(this.currentParams);
        this.updateVRPanelTitle();
      },
    });
    this.vrPanel.addButton({
      label: "M2 +",
      x: startX + (btnW + gap) * 3, y: row2Y, w: btnW, h: btnH,
      onClick: () => {
        this.currentParams.m2 = Math.min(150, this.currentParams.m2 + massStep);
        this.onParamsChange(this.currentParams);
        this.updateVRPanelTitle();
      },
    });

    // ── Row 3: Spin & playback ──
    const row3Y = 0.70;
    const spinStep = 0.2;

    // Button indices: 8=Spin-, 9=Spin+, 10=Play/Pause, 11=Speed
    this.vrPanel.addButton({
      label: "Spin \u2212",
      x: startX, y: row3Y, w: btnW, h: btnH,
      onClick: () => {
        this.currentParams.chi1 = Math.max(-1, +(this.currentParams.chi1 - spinStep).toFixed(2));
        this.currentParams.chi2 = Math.max(-1, +(this.currentParams.chi2 - spinStep).toFixed(2));
        this.onParamsChange(this.currentParams);
        this.updateVRPanelTitle();
      },
    });
    this.vrPanel.addButton({
      label: "Spin +",
      x: startX + (btnW + gap), y: row3Y, w: btnW, h: btnH,
      onClick: () => {
        this.currentParams.chi1 = Math.min(1, +(this.currentParams.chi1 + spinStep).toFixed(2));
        this.currentParams.chi2 = Math.min(1, +(this.currentParams.chi2 + spinStep).toFixed(2));
        this.onParamsChange(this.currentParams);
        this.updateVRPanelTitle();
      },
    });
    this.vrPanel.addButton({
      label: this.isPlaying ? "\u23F8" : "\u25B6",
      x: startX + (btnW + gap) * 2, y: row3Y, w: btnW, h: btnH,
      onClick: () => {
        this.playBtn.click();
      },
    });
    this.vrPanel.addButton({
      label: `${this.playbackSpeed}x`,
      x: startX + (btnW + gap) * 3, y: row3Y, w: btnW, h: btnH,
      onClick: () => {
        this.speedBtn.click();
      },
    });

    // ── Row 4: Merge ──
    const row4Y = 0.88;

    // Button index: 12=Merge
    this.vrPanel.addButton({
      label: "Merge",
      x: startX, y: row4Y, w: btnW * 2 + gap, h: btnH,
      onClick: () => {
        this.triggerMerge();
      },
    });

    xr.registerPanel(this.vrPanel);

    xr.onMenuPress = () => {
      if (!this.vrPanel) return;
      this.vrPanel.toggle();
      if (this.vrPanel.visible) {
        this.ctx.camera.updateWorldMatrix(true, false);
        this.vrPanel.positionInFront(this.ctx.camera, 2, -0.3);
      }
    };

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
        this.vrPanel?.updateButton(10, "\u25B6");
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

    // VR haptic feedback — distance-aware wave propagation
    if (this.isPlaying && this.ctx.xrManager?.isPresenting && this.currentWaveform) {
      const hPlus = this.currentWaveform.hPlus;
      const peakAmplitude = Math.abs(hPlus[this.currentWaveform.peakIndex]);
      if (peakAmplitude > 0) {
        const distance = this.ctx.xrManager.cameraWorldPosition.distanceTo(this.mergerCenter);
        const delayNorm = (distance / SandboxScene.WAVE_SPEED) / this.currentWaveform.duration;
        const delayedTime = this.playbackTime - delayNorm;
        if (delayedTime >= 0) {
          const sampleIndex = Math.min(Math.floor(delayedTime * hPlus.length), hPlus.length - 1);
          const rawIntensity = Math.abs(hPlus[sampleIndex]) / peakAmplitude;
          const spatialFactor = Math.min(1, Math.max(0, 1 / (1 + distance * 0.3)));
          this.ctx.xrManager.pulseHaptics(rawIntensity * spatialFactor);
        }
      }
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
    if (this.ctx.xrManager) {
      this.ctx.xrManager.onMenuPress = null;
    }

    this.ctx.scene.remove(this.group);
    this.ctx.scene.remove(this.stars);
    this.audio.stop();
    this.panel?.dispose();
    this.timeControlsEl.style.display = "none";
  }
}
