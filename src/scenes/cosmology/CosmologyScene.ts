import * as THREE from "three";
import type { Scene, SceneContext } from "../types";
import { CosmologySystem } from "./CosmologySystem";
import { CosmologyPanel } from "./CosmologyPanel";
import { cosmologyPresets } from "./presets";
import { makeTrailMaterial } from "../../shaders/fresnel";

const MAX_TRAIL = 300;

export class CosmologyScene implements Scene {
  readonly id = "cosmology";
  readonly label = "Cosmology";
  readonly supportsXR = false;

  private ctx!: SceneContext;
  private group = new THREE.Group();
  private stars!: THREE.Points;
  private points!: THREE.Points;
  private panel!: CosmologyPanel;

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

    // Camera
    camera.position.set(0, 20, 35);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.enabled = true;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.minDistance = 5;
    controls.maxDistance = 150;

    // Hide merger-specific UI and VR button (Cosmology doesn't support XR)
    for (const id of ["event-info", "event-list", "time-controls", "map-legend", "help-overlay", "map-toggle", "tour-toggle", "events-toggle"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    }
    const uiBar = document.getElementById("ui");
    if (uiBar) uiBar.style.display = "flex";
    // Hide VR button — this scene doesn't support XR
    const vrBtn = document.getElementById("vr-button");
    if (vrBtn) vrBtn.style.display = "none";

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

    (this.points.material as THREE.PointsMaterial).size = 0.6;
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

    // Smooth camera toward center of mass
    const com = this.system.getCenterOfMass();
    this.cameraTarget.lerp(com, 0.02);
    this.ctx.controls.target.copy(this.cameraTarget);
    this.ctx.controls.update();

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
