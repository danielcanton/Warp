import * as THREE from "three";
import type { Scene, SceneContext } from "../types";
import { CosmologySystem } from "./CosmologySystem";
import { CosmologyPanel } from "./CosmologyPanel";

const GALAXY_COUNT = 50;
const CLUSTER_RADIUS = 12;

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

  // Snapshot for reset
  private initialPositions: THREE.Vector3[] = [];
  private initialVelocities: THREE.Vector3[] = [];
  private initialMasses: number[] = [];
  private initialTypes: ("spiral" | "elliptical")[] = [];
  private initialColors: THREE.Color[] = [];

  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;
    const { scene, camera, controls } = ctx;
    const firstInit = !this.initialized;

    scene.fog = new THREE.FogExp2(0x000005, 0.005);

    if (firstInit) {
      this.buildSceneObjects(scene);
      this.panel = new CosmologyPanel({
        onPlayPause: () => { this.isPlaying = !this.isPlaying; },
        onReset: () => this.reset(),
        onSpeedChange: (s) => { this.speed = s; },
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
      this.loadOurUniverse();
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
    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.8,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(pointsGeometry, pointsMaterial);
    this.group.add(this.points);
  }

  private loadOurUniverse() {
    this.system.clear();

    for (let i = 0; i < GALAXY_COUNT; i++) {
      // Distribute in a roughly spherical cluster
      const r = CLUSTER_RADIUS * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.6; // slightly flattened
      const z = r * Math.cos(phi);

      const isElliptical = Math.random() < 0.3;
      const mass = isElliptical
        ? 1.5 + Math.random() * 3.5 // ellipticals are more massive
        : 0.5 + Math.random() * 2.0;

      // Small random initial velocity for some orbital motion
      const speed = 0.3 + Math.random() * 0.4;
      const vTheta = Math.random() * Math.PI * 2;
      const vx = speed * Math.cos(vTheta);
      const vz = speed * Math.sin(vTheta);

      this.system.addGalaxy({
        mass,
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(vx, 0, vz),
        type: isElliptical ? "elliptical" : "spiral",
      });
    }

    this.saveSnapshot();
    this.syncPoints();
  }

  private saveSnapshot() {
    this.initialPositions = this.system.galaxies.map(g => g.position.clone());
    this.initialVelocities = this.system.galaxies.map(g => g.velocity.clone());
    this.initialMasses = this.system.galaxies.map(g => g.mass);
    this.initialTypes = this.system.galaxies.map(g => g.type);
    this.initialColors = this.system.galaxies.map(g => g.color.clone());
  }

  private reset() {
    this.system.clear();
    for (let i = 0; i < this.initialPositions.length; i++) {
      this.system.addGalaxy({
        mass: this.initialMasses[i],
        position: this.initialPositions[i].clone(),
        velocity: this.initialVelocities[i].clone(),
        type: this.initialTypes[i],
        color: this.initialColors[i].clone(),
      });
    }
    this.syncPoints();
  }

  private syncPoints() {
    const galaxies = this.system.galaxies;
    const n = galaxies.length;

    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const g = galaxies[i];
      positions[i * 3] = g.position.x;
      positions[i * 3 + 1] = g.position.y;
      positions[i * 3 + 2] = g.position.z;

      colors[i * 3] = g.color.r;
      colors[i * 3 + 1] = g.color.g;
      colors[i * 3 + 2] = g.color.b;

      sizes[i] = 0.4 + g.mass * 0.3;
    }

    const geom = this.points.geometry;
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geom.computeBoundingSphere();

    // Encode mass in point size via material
    (this.points.material as THREE.PointsMaterial).size = 0.8;
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

    this.ctx.scene.remove(this.group);
    this.ctx.scene.remove(this.stars);
    this.panel?.dispose();
    this.ctx.controls.enabled = true;
  }
}
