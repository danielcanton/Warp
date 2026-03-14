import * as THREE from "three";
import type { Scene, SceneContext } from "../types";
import { CosmologySystem } from "./CosmologySystem";
import { CosmologyPanel } from "./CosmologyPanel";
import { cosmologyPresets } from "./presets";
import { makeTrailMaterial } from "../../shaders/fresnel";
import { VRPanel } from "../../lib/VRPanel";
import { VRTutorial } from "../../lib/vr-tutorial";

const MAX_TRAIL = 300;

export class CosmologyScene implements Scene {
  readonly id = "cosmology";
  readonly label = "Cosmology";
  readonly supportsXR = true;

  private ctx!: SceneContext;
  private group = new THREE.Group();
  private stars!: THREE.Points;
  private points!: THREE.Points;
  private panel!: CosmologyPanel;
  private vrPanel: VRPanel | null = null;
  private vrTutorial: VRTutorial | null = null;
  private passthroughActive = false;
  private currentPresetIndex = 0;

  private system = new CosmologySystem();
  private isPlaying = true;
  private speed = 1.0;

  private cameraTarget = new THREE.Vector3();
  private boundHandlers: { el: EventTarget; type: string; fn: EventListener }[] = [];
  private initialized = false;
  private trailLines = new Map<string, THREE.Line>();
  private glowTexture!: THREE.Texture;

  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;
    const { scene, camera, controls } = ctx;
    const firstInit = !this.initialized;

    scene.fog = new THREE.FogExp2(0x000005, 0.005);

    if (firstInit) {
      this.glowTexture = this.createGlowTexture();
      this.buildSceneObjects(scene);
      this.panel = new CosmologyPanel({
        onPresetChange: (i) => this.loadPreset(i),
        onPlayPause: () => { this.isPlaying = !this.isPlaying; },
        onReset: () => this.loadPreset(0),
        onSpeedChange: (s) => { this.speed = s; },
        onDarkMatterChange: (f) => { this.system.darkMatterFraction = f; },
        onDarkEnergyChange: (f) => { this.system.darkEnergyFraction = f; },
      });
    } else {
      scene.add(this.group);
      scene.add(this.stars);
    }
    document.body.appendChild(this.panel.element);

    // Camera — position inside the cluster so galaxies surround the user
    camera.position.set(0, 2, 8);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.enabled = true;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.minDistance = 1;
    controls.maxDistance = 150;

    // Hide merger-specific UI
    for (const id of ["event-info", "event-list", "time-controls", "map-legend", "help-overlay", "map-toggle", "tour-toggle", "events-toggle"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    }
    const uiBar = document.getElementById("ui");
    if (uiBar) uiBar.style.display = "flex";

    // Set up VR panel if XR manager is available
    if (ctx.xrManager && !this.vrPanel) {
      this.setupVRPanel(ctx);
    }

    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.classList.add("fade-out");
      setTimeout(() => loadingScreen.remove(), 700);
    }

    this.setupInteraction(ctx);

    if (firstInit) {
      this.loadPreset(0);
      this.initialized = true;
    }
  }

  private setupVRPanel(ctx: SceneContext) {
    const xr = ctx.xrManager!;
    this.vrPanel = new VRPanel(1.4, 1.1);
    this.vrPanel.setTitle("Cosmology");

    const btnH = 0.16;
    const btnW = 0.22;
    const gap = 0.02;
    const startX = 0.03;

    // Row 1: Play/Pause, Speed, Preset cycle
    const btnY = 0.32;

    // Button 0: Play/Pause
    this.vrPanel.addButton({
      label: this.isPlaying ? "\u23F8" : "\u25B6",
      x: startX, y: btnY, w: btnW * 0.7, h: btnH,
      onClick: () => {
        this.isPlaying = !this.isPlaying;
        this.panel.setPlaying(this.isPlaying);
        this.vrPanel?.updateButton(0, this.isPlaying ? "\u23F8" : "\u25B6");
      },
    });

    // Button 1: Speed cycle
    this.vrPanel.addButton({
      label: `${this.speed}x`,
      x: startX + (btnW * 0.7 + gap), y: btnY, w: btnW * 0.7, h: btnH,
      onClick: () => {
        const speeds = [0.1, 0.25, 0.5, 1, 2, 5, 10];
        const idx = speeds.indexOf(this.speed);
        this.speed = speeds[(idx + 1) % speeds.length];
        this.vrPanel?.updateButton(1, `${this.speed}x`);
      },
    });

    // Button 2: Preset cycle
    this.vrPanel.addButton({
      label: cosmologyPresets[this.currentPresetIndex].name,
      x: startX + (btnW * 0.7 + gap) * 2, y: btnY, w: btnW * 1.8, h: btnH,
      onClick: () => {
        this.currentPresetIndex = (this.currentPresetIndex + 1) % cosmologyPresets.length;
        this.loadPreset(this.currentPresetIndex);
        this.vrPanel?.updateButton(2, cosmologyPresets[this.currentPresetIndex].name);
      },
    });

    // Row 2: Dark Matter toggle, Dark Energy toggle
    const row2Y = 0.52;

    // Button 3: Dark Matter toggle (100%/0%)
    this.vrPanel.addButton({
      label: "DM: 100%",
      x: startX, y: row2Y, w: btnW * 1.2, h: btnH,
      onClick: () => {
        const current = this.system.darkMatterFraction;
        const next = current > 0.5 ? 0 : 1;
        this.system.darkMatterFraction = next;
        this.vrPanel?.updateButton(3, `DM: ${Math.round(next * 100)}%`);
      },
    });

    // Button 4: Dark Energy toggle (100%/0%)
    this.vrPanel.addButton({
      label: "DE: 100%",
      x: startX + (btnW * 1.2 + gap), y: row2Y, w: btnW * 1.2, h: btnH,
      onClick: () => {
        const current = this.system.darkEnergyFraction;
        const next = current > 0.5 ? 0 : 1;
        this.system.darkEnergyFraction = next;
        this.vrPanel?.updateButton(4, `DE: ${Math.round(next * 100)}%`);
      },
    });

    // Button 5: Reset
    this.vrPanel.addButton({
      label: "\u21BA Reset",
      x: startX + (btnW * 1.2 + gap) * 2, y: row2Y, w: btnW, h: btnH,
      onClick: () => {
        this.currentPresetIndex = 0;
        this.loadPreset(0);
        this.system.darkMatterFraction = 1;
        this.system.darkEnergyFraction = 1;
        this.vrPanel?.updateButton(2, cosmologyPresets[0].name);
        this.vrPanel?.updateButton(3, "DM: 100%");
        this.vrPanel?.updateButton(4, "DE: 100%");
      },
    });

    // Row 3: Exit VR, Passthrough (if AR)
    const row3Y = 0.72;

    // Button 6: Exit VR
    this.vrPanel.addButton({
      label: "Exit VR",
      x: startX, y: row3Y, w: btnW, h: btnH,
      onClick: () => {
        this.ctx.renderer.xr.getSession()?.end();
      },
    });

    // Passthrough toggle — only for AR sessions
    if (xr.supportsAR) {
      const ptBtnIdx = 7;
      this.vrPanel.addButton({
        label: "Passthrough: OFF",
        x: startX + (btnW + gap), y: row3Y, w: btnW * 2, h: btnH,
        onClick: () => {
          this.passthroughActive = !this.passthroughActive;
          if (this.passthroughActive) {
            this.ctx.scene.background = null;
            this.ctx.renderer.setClearColor(0x000000, 0);
          } else {
            this.ctx.scene.background = new THREE.Color(0x000005);
            this.ctx.renderer.setClearColor(0x000005, 1);
          }
          this.vrPanel?.updateButton(ptBtnIdx, `Passthrough: ${this.passthroughActive ? "ON" : "OFF"}`);
        },
      });
    }

    xr.registerPanel(this.vrPanel);

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
      // Scale galaxy sprites up for VR visibility
      (this.points.material as THREE.PointsMaterial).size = 1.2;

      if (this.vrPanel) {
        this.vrPanel.positionInFront(ctx.camera, 2, 0);
        ctx.scene.add(this.vrPanel.mesh);
      }
      // Block AR camera passthrough by default
      this.ctx.scene.background = new THREE.Color(0x000005);
      this.ctx.renderer.setClearColor(0x000005, 1);

      setTimeout(() => this.vrTutorial?.show(ctx.camera, ctx.scene), 200);
    };

    xr.onSessionEnd = () => {
      // Restore desktop sprite size
      (this.points.material as THREE.PointsMaterial).size = 0.6;

      if (this.vrPanel) ctx.scene.remove(this.vrPanel.mesh);
      this.vrTutorial?.hide(ctx.scene);
      // Restore opaque state if passthrough was active
      if (this.passthroughActive) {
        this.ctx.scene.background = new THREE.Color(0x000005);
        this.ctx.renderer.setClearColor(0x000005, 1);
        this.passthroughActive = false;
      }
    };

    // If already in VR (scene switch mid-session)
    if (xr.isPresenting && this.vrPanel) {
      this.vrPanel.positionInFront(ctx.camera, 2, 0);
      ctx.scene.add(this.vrPanel.mesh);
      (this.points.material as THREE.PointsMaterial).size = 1.2;
    }
  }

  private buildSceneObjects(scene: THREE.Scene) {
    // Ambient lighting
    this.group.add(new THREE.AmbientLight(0x303050, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight.position.set(10, 20, 10);
    this.group.add(dirLight);

    scene.add(this.group);

    // Background stars
    const starCount = 6000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 50 + Math.random() * 120;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xccccff, size: 0.05, sizeAttenuation: true,
      transparent: true, opacity: 0.6,
    });
    this.stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(this.stars);

    // Galaxy points (will be updated each frame)
    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    pointsGeometry.setAttribute("color", new THREE.Float32BufferAttribute([], 3));
    pointsGeometry.setAttribute("size", new THREE.Float32BufferAttribute([], 1));
    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.8,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: this.glowTexture,
    });
    this.points = new THREE.Points(pointsGeometry, pointsMaterial);
    this.group.add(this.points);
  }

  private loadPreset(index: number) {
    this.currentPresetIndex = index;

    // Clear trail visuals
    for (const [, line] of this.trailLines) {
      this.group.remove(line);
    }
    this.trailLines.clear();

    cosmologyPresets[index].load(this.system);
    this.system.assignTrails();

    // Create trail lines for galaxies that have trails
    for (const g of this.system.galaxies) {
      if (g.hasTrail) {
        this.trailLines.set(g.id, this.createTrailLine(g.color));
      }
    }

    this.syncPoints();
  }

  private syncPoints() {
    const galaxies = this.system.galaxies;
    const n = galaxies.length;

    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      const g = galaxies[i];
      positions[i * 3] = g.position.x;
      positions[i * 3 + 1] = g.position.y;
      positions[i * 3 + 2] = g.position.z;

      colors[i * 3] = g.color.r;
      colors[i * 3 + 1] = g.color.g;
      colors[i * 3 + 2] = g.color.b;
    }

    const geom = this.points.geometry;
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geom.computeBoundingSphere();

    const isVR = this.ctx?.renderer.xr.isPresenting;
    (this.points.material as THREE.PointsMaterial).size = isVR ? 1.2 : 0.6;
  }

  private createGlowTexture(): THREE.Texture {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.2, "rgba(255,255,255,0.8)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.3)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createTrailLine(color: THREE.Color): THREE.Line {
    const material = makeTrailMaterial(color.getHex());
    const positions = new Float32Array(MAX_TRAIL * 3);
    const alphas = new Float32Array(MAX_TRAIL);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geometry.setDrawRange(0, 0);
    const line = new THREE.Line(geometry, material);
    this.group.add(line);
    return line;
  }

  private addHandler(el: EventTarget, type: string, fn: EventListener) {
    el.addEventListener(type, fn);
    this.boundHandlers.push({ el, type, fn });
  }

  private setupInteraction(ctx: SceneContext) {
    this.addHandler(window, "keydown", ((e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        this.isPlaying = !this.isPlaying;
        this.panel.setPlaying(this.isPlaying);
      }
    }) as EventListener);
  }

  update(dt: number, _elapsed: number): void {
    if (this.isPlaying) {
      this.system.step(dt * this.speed);
    }

    // Update point positions
    const galaxies = this.system.galaxies;
    const posAttr = this.points.geometry.getAttribute("position");
    if (posAttr && posAttr.count === galaxies.length) {
      for (let i = 0; i < galaxies.length; i++) {
        const g = galaxies[i];
        (posAttr.array as Float32Array)[i * 3] = g.position.x;
        (posAttr.array as Float32Array)[i * 3 + 1] = g.position.y;
        (posAttr.array as Float32Array)[i * 3 + 2] = g.position.z;
      }
      posAttr.needsUpdate = true;
    } else {
      this.syncPoints();
    }

    // Update trail lines for tracked galaxies
    for (const g of galaxies) {
      if (!g.hasTrail) continue;
      const line = this.trailLines.get(g.id);
      if (!line || g.trail.length < 2) continue;

      const geom = line.geometry;
      const trailPosAttr = geom.getAttribute("position") as THREE.BufferAttribute;
      const alphaAttr = geom.getAttribute("aAlpha") as THREE.BufferAttribute;
      const posArray = trailPosAttr.array as Float32Array;
      const alphaArray = alphaAttr.array as Float32Array;

      const len = g.trail.length;
      let writeIdx = 0;

      if (len < MAX_TRAIL) {
        for (let i = 0; i < len; i++) {
          const p = g.trail[i];
          posArray[writeIdx * 3] = p.x;
          posArray[writeIdx * 3 + 1] = p.y;
          posArray[writeIdx * 3 + 2] = p.z;
          alphaArray[writeIdx] = (i / len) * 0.6;
          writeIdx++;
        }
      } else {
        for (let i = 0; i < len; i++) {
          const p = g.trail[(g.trailIndex + i) % len];
          posArray[writeIdx * 3] = p.x;
          posArray[writeIdx * 3 + 1] = p.y;
          posArray[writeIdx * 3 + 2] = p.z;
          alphaArray[writeIdx] = (i / len) * 0.6;
          writeIdx++;
        }
      }

      trailPosAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      geom.setDrawRange(0, writeIdx);
    }

    // Smooth camera toward center of mass (desktop only)
    if (!this.ctx.renderer.xr.isPresenting) {
      const com = this.system.getCenterOfMass();
      this.cameraTarget.lerp(com, 0.02);
      this.ctx.controls.target.copy(this.cameraTarget);
      this.ctx.controls.update();
    }

    // Update panel
    this.panel.updateInfo(galaxies.length);
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
      this.ctx.xrManager.onSessionStart = null;
      this.ctx.xrManager.onSessionEnd = null;
    }
    if (this.vrTutorial) {
      this.vrTutorial.dispose(this.ctx.scene);
      this.vrTutorial = null;
    }

    for (const [, line] of this.trailLines) {
      this.group.remove(line);
    }
    this.trailLines.clear();

    this.ctx.scene.remove(this.group);
    this.ctx.scene.remove(this.stars);
    this.panel?.dispose();
    this.ctx.controls.enabled = true;
  }
}
