import * as THREE from "three";
import type { Scene, SceneContext } from "../types";
import { NBodySystem, type Body } from "./NBodySystem";
import { presets } from "./presets";
import { NBodyPanel, type BodyType } from "./NBodyPanel";
import {
  makeBHMaterial,
  makeNSMaterial,
  makeAtmosphereMaterial,
  makeTrailMaterial,
} from "../../shaders/fresnel";
import { VRPanel } from "../../lib/VRPanel";

// ─── Collision particle system ─────────────────────────────────────
const PARTICLE_COUNT = 50;

interface CollisionParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  opacity: number;
}

interface CollisionEffect {
  particles: CollisionParticle[];
  mesh: THREE.Points;
  age: number;
  baseColor: THREE.Color;
  bloomDecay: number; // remaining bloom spike time
}

// Pre-allocated trail constants
const MAX_TRAIL = 300;

export class NBodyScene implements Scene {
  readonly id = "nbody";
  readonly label = "N-Body";
  readonly supportsXR = true;

  private ctx!: SceneContext;
  private group = new THREE.Group();
  private stars!: THREE.Points;
  private gridHelper!: THREE.GridHelper;
  private panel!: NBodyPanel;
  private vrPanel: VRPanel | null = null;
  private vrPlacing = false;
  private vrPlacingControllerIndex = -1;
  private vrPlacePosition: THREE.Vector3 | null = null;
  private vrVelocityArrow: THREE.ArrowHelper | null = null;
  private vrGhostSphere: THREE.Mesh | null = null;
  private currentPresetIndex = 0;

  private system = new NBodySystem();
  private bodyMeshes = new Map<string, THREE.Group>();
  private trailLines = new Map<string, THREE.Line>();
  private collisionEffects: CollisionEffect[] = [];

  private isPlaying = true;
  private speed = 1.0;
  private showTrails = true;
  private showGrid = false;
  private elapsed = 0;

  // Placement state
  private placing = false;
  private placeType: BodyType = "planet";
  private placeMass = 0.1;
  private ghostSphere: THREE.Mesh | null = null;
  private placePosition: THREE.Vector3 | null = null;
  private velocityArrow: THREE.ArrowHelper | null = null;
  private dragStart = new THREE.Vector2();
  private isDraggingVelocity = false;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Camera target smoothing
  private cameraTarget = new THREE.Vector3();

  private boundHandlers: { el: EventTarget; type: string; fn: EventListener }[] = [];
  private initialized = false;

  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;
    const { scene, camera, controls } = ctx;
    const firstInit = !this.initialized;

    scene.fog = new THREE.FogExp2(0x000005, 0.015);

    if (firstInit) {
      this.buildSceneObjects(scene);
      this.panel = new NBodyPanel({
        onPresetChange: (i) => this.loadPreset(i),
        onPlayPause: () => { this.isPlaying = !this.isPlaying; },
        onReset: () => this.loadPreset(0),
        onSpeedChange: (s) => { this.speed = s; },
        onPlaceBody: (type, mass) => this.enterPlacementMode(type, mass),
        onToggleTrails: (on) => { this.showTrails = on; this.updateTrailVisibility(); },
        onToggleGrid: (on) => {
          this.showGrid = on;
          this.gridHelper.visible = on;
        },
        onToggleCollisions: (on) => { this.system.collisionsEnabled = on; },
      });
    } else {
      scene.add(this.group);
      scene.add(this.stars);
    }
    document.body.appendChild(this.panel.element);

    // Camera
    camera.position.set(0, 12, 18);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.enabled = true;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.minDistance = 3;
    controls.maxDistance = 100;

    // Hide merger-specific UI but keep #ui bar visible (VR button, screenshot)
    for (const id of ["event-info", "event-list", "time-controls", "map-legend", "help-overlay", "map-toggle", "tour-toggle", "events-toggle"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    }
    const uiBar = document.getElementById("ui");
    if (uiBar) uiBar.style.display = "flex";
    const vrBtn = document.getElementById("vr-button");
    if (vrBtn) vrBtn.style.display = "";

    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.classList.add("fade-out");
      setTimeout(() => loadingScreen.remove(), 700);
    }

    this.setupInteraction(ctx);

    // VR Panel
    if (ctx.xrManager && !this.vrPanel) {
      this.setupVRPanel(ctx);
    }

    if (firstInit) {
      this.loadPreset(0);
      this.initialized = true;
    }
  }

  private buildSceneObjects(scene: THREE.Scene) {
    // Lights
    this.group.add(new THREE.AmbientLight(0x404060, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight.position.set(5, 10, 5);
    this.group.add(dirLight);

    // Grid (hidden by default)
    this.gridHelper = new THREE.GridHelper(40, 40, 0x222244, 0x111133);
    this.gridHelper.visible = false;
    this.group.add(this.gridHelper);

    scene.add(this.group);

    // Ambient stars
    const starCount = 4000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 30 + Math.random() * 80;
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

  private loadPreset(index: number) {
    // Clear existing visuals
    this.clearVisuals();
    presets[index].load(this.system);
    this.syncMeshes();
  }

  private clearVisuals() {
    for (const [, meshGroup] of this.bodyMeshes) {
      this.group.remove(meshGroup);
    }
    this.bodyMeshes.clear();
    for (const [, line] of this.trailLines) {
      this.group.remove(line);
    }
    this.trailLines.clear();
    for (const effect of this.collisionEffects) {
      this.group.remove(effect.mesh);
    }
    this.collisionEffects = [];
  }

  private createBodyMesh(body: Body): THREE.Group {
    const bodyGroup = new THREE.Group();

    if (body.type === "blackhole") {
      // Fresnel shader: dark core + purple rim glow
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(body.radius, 32, 32),
        makeBHMaterial(0x8844cc),
      );
      sphere.userData.isShaderBody = true;
      bodyGroup.add(sphere);

      const glow = new THREE.PointLight(0x6633aa, 1, body.radius * 8);
      bodyGroup.add(glow);
    } else if (body.type === "star") {
      // Fresnel emissive shader with pulse
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(body.radius, 24, 24),
        makeNSMaterial(body.color.getHex()),
      );
      sphere.userData.isShaderBody = true;
      bodyGroup.add(sphere);

      const light = new THREE.PointLight(body.color.getHex(), 0.8, body.radius * 10);
      bodyGroup.add(light);
    } else {
      // Planet — MeshStandardMaterial + atmosphere shell
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(body.radius, 20, 20),
        new THREE.MeshStandardMaterial({
          color: body.color, roughness: 0.7, metalness: 0.2,
        }),
      );
      bodyGroup.add(sphere);

      // Atmosphere rim
      const atmo = new THREE.Mesh(
        new THREE.SphereGeometry(body.radius * 1.15, 20, 20),
        makeAtmosphereMaterial(body.color.getHex()),
      );
      bodyGroup.add(atmo);
    }

    bodyGroup.position.copy(body.position);
    this.group.add(bodyGroup);
    return bodyGroup;
  }

  private createTrailLine(body: Body): THREE.Line {
    const colorHex = body.type === "blackhole" ? 0x6633aa : body.color.getHex();
    const material = makeTrailMaterial(colorHex);

    // Pre-allocate fixed-size buffers
    const positions = new Float32Array(MAX_TRAIL * 3);
    const alphas = new Float32Array(MAX_TRAIL);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geometry.setDrawRange(0, 0); // nothing to draw yet

    const line = new THREE.Line(geometry, material);
    line.visible = this.showTrails;
    this.group.add(line);
    return line;
  }

  private syncMeshes() {
    const currentIds = new Set(this.system.bodies.map((b) => b.id));

    // Remove meshes for bodies that no longer exist
    for (const [id, meshGroup] of this.bodyMeshes) {
      if (!currentIds.has(id)) {
        this.group.remove(meshGroup);
        this.bodyMeshes.delete(id);
      }
    }
    for (const [id, line] of this.trailLines) {
      if (!currentIds.has(id)) {
        this.group.remove(line);
        this.trailLines.delete(id);
      }
    }

    // Create meshes for new bodies
    for (const body of this.system.bodies) {
      if (!this.bodyMeshes.has(body.id)) {
        this.bodyMeshes.set(body.id, this.createBodyMesh(body));
        this.trailLines.set(body.id, this.createTrailLine(body));
      }
    }
  }

  private spawnCollisionEffect(position: THREE.Vector3, color: THREE.Color) {
    const particles: CollisionParticle[] = [];
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Random direction
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize();
      const speed = 2 + Math.random() * 6;

      particles.push({
        position: position.clone(),
        velocity: dir.multiplyScalar(speed),
        opacity: 1.0,
      });

      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      // Per-particle color variation
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      const varied = new THREE.Color().setHSL(
        hsl.h + (Math.random() - 0.5) * 0.1,
        Math.min(1, hsl.s + (Math.random() - 0.5) * 0.2),
        Math.min(1, hsl.l + Math.random() * 0.3),
      );
      colors[i * 3] = varied.r;
      colors[i * 3 + 1] = varied.g;
      colors[i * 3 + 2] = varied.b;

      sizes[i] = 0.08 + Math.random() * 0.12;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const mesh = new THREE.Points(geometry, material);
    this.group.add(mesh);

    this.collisionEffects.push({
      particles,
      mesh,
      age: 0,
      baseColor: color.clone(),
      bloomDecay: 0.15, // 150ms bloom spike
    });
  }

  // ─── Placement mode ────────────────────────────────────────────

  private enterPlacementMode(type: BodyType, mass: number) {
    this.placing = true;
    this.placeType = type;
    this.placeMass = mass;
    this.placePosition = null;
    this.isDraggingVelocity = false;
    document.body.classList.add("nb-placing");
    this.panel.setPlacementMode(true);
  }

  private exitPlacementMode() {
    this.placing = false;
    document.body.classList.remove("nb-placing");
    this.panel.setPlacementMode(false);
    if (this.ghostSphere) {
      this.group.remove(this.ghostSphere);
      this.ghostSphere = null;
    }
    if (this.velocityArrow) {
      this.group.remove(this.velocityArrow);
      this.velocityArrow = null;
    }
    this.placePosition = null;
  }

  private getGroundIntersection(clientX: number, clientY: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.ctx.camera);
    const target = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
    return hit ? target : null;
  }

  private addHandler(el: EventTarget, type: string, fn: EventListener) {
    el.addEventListener(type, fn);
    this.boundHandlers.push({ el, type, fn });
  }

  private setupInteraction(ctx: SceneContext) {
    const canvas = ctx.renderer.domElement;

    // Mouse down — start placement or velocity drag
    this.addHandler(canvas, "mousedown", ((e: MouseEvent) => {
      if (!this.placing) return;

      const intersection = this.getGroundIntersection(e.clientX, e.clientY);
      if (!intersection) return;

      if (!this.placePosition) {
        // First click — set position
        this.placePosition = intersection.clone();
        this.dragStart.set(e.clientX, e.clientY);
        this.isDraggingVelocity = true;

        // Show ghost sphere
        const color = this.placeType === "blackhole" ? 0x6633aa :
          this.placeType === "star" ? 0xffdd33 : 0x4488ff;
        this.ghostSphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 16, 16),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
        );
        this.ghostSphere.position.copy(this.placePosition);
        this.group.add(this.ghostSphere);

        // Disable orbit controls during drag
        ctx.controls.enabled = false;
      }
    }) as EventListener);

    // Mouse move — show velocity arrow
    this.addHandler(canvas, "mousemove", ((e: MouseEvent) => {
      if (!this.placing || !this.isDraggingVelocity || !this.placePosition) return;

      const intersection = this.getGroundIntersection(e.clientX, e.clientY);
      if (!intersection) return;

      const dir = new THREE.Vector3().subVectors(intersection, this.placePosition);
      const length = dir.length();

      if (this.velocityArrow) {
        this.group.remove(this.velocityArrow);
      }

      if (length > 0.1) {
        this.velocityArrow = new THREE.ArrowHelper(
          dir.clone().normalize(), this.placePosition, length,
          0x00ff88, 0.2, 0.12,
        );
        this.group.add(this.velocityArrow);
      }
    }) as EventListener);

    // Mouse up — finish placement
    this.addHandler(canvas, "mouseup", ((e: MouseEvent) => {
      if (!this.placing || !this.isDraggingVelocity || !this.placePosition) return;

      const intersection = this.getGroundIntersection(e.clientX, e.clientY);
      const velocity = new THREE.Vector3();
      if (intersection) {
        velocity.subVectors(intersection, this.placePosition).multiplyScalar(0.5);
        velocity.y = 0; // Keep in plane
      }

      const body = this.system.addBody({
        mass: this.placeMass,
        position: this.placePosition,
        velocity,
        type: this.placeType,
      });

      if (body) {
        this.bodyMeshes.set(body.id, this.createBodyMesh(body));
        this.trailLines.set(body.id, this.createTrailLine(body));
      }

      ctx.controls.enabled = true;
      this.exitPlacementMode();
    }) as EventListener);

    // Touch support for placement
    this.addHandler(canvas, "touchstart", ((e: TouchEvent) => {
      if (!this.placing || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const intersection = this.getGroundIntersection(touch.clientX, touch.clientY);
      if (!intersection) return;

      if (!this.placePosition) {
        this.placePosition = intersection.clone();
        this.dragStart.set(touch.clientX, touch.clientY);
        this.isDraggingVelocity = true;

        const color = this.placeType === "blackhole" ? 0x6633aa :
          this.placeType === "star" ? 0xffdd33 : 0x4488ff;
        this.ghostSphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 16, 16),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
        );
        this.ghostSphere.position.copy(this.placePosition);
        this.group.add(this.ghostSphere);
        ctx.controls.enabled = false;
      }
    }) as EventListener);

    this.addHandler(canvas, "touchmove", ((e: TouchEvent) => {
      if (!this.placing || !this.isDraggingVelocity || !this.placePosition) return;
      e.preventDefault();
      const touch = e.touches[0];
      const intersection = this.getGroundIntersection(touch.clientX, touch.clientY);
      if (!intersection) return;

      const dir = new THREE.Vector3().subVectors(intersection, this.placePosition);
      const length = dir.length();

      if (this.velocityArrow) this.group.remove(this.velocityArrow);
      if (length > 0.1) {
        this.velocityArrow = new THREE.ArrowHelper(
          dir.clone().normalize(), this.placePosition, length,
          0x00ff88, 0.2, 0.12,
        );
        this.group.add(this.velocityArrow);
      }
    }) as EventListener);

    this.addHandler(canvas, "touchend", ((_e: TouchEvent) => {
      if (!this.placing || !this.isDraggingVelocity || !this.placePosition) return;

      // Use the last arrow direction as velocity
      const velocity = new THREE.Vector3();
      if (this.velocityArrow) {
        const dir = this.velocityArrow.getWorldDirection(new THREE.Vector3());
        velocity.copy(dir).multiplyScalar(
          (this.velocityArrow as unknown as { line: { scale: THREE.Vector3 } }).line?.scale?.z ?? 1
        ).multiplyScalar(0.5);
        velocity.y = 0;
      }

      const body = this.system.addBody({
        mass: this.placeMass,
        position: this.placePosition,
        velocity,
        type: this.placeType,
      });

      if (body) {
        this.bodyMeshes.set(body.id, this.createBodyMesh(body));
        this.trailLines.set(body.id, this.createTrailLine(body));
      }

      ctx.controls.enabled = true;
      this.exitPlacementMode();
    }) as EventListener);

    // Escape to cancel placement
    this.addHandler(window, "keydown", ((e: KeyboardEvent) => {
      if (e.code === "Escape" && this.placing) {
        this.ctx.controls.enabled = true;
        this.exitPlacementMode();
      }
      if (e.code === "Space") {
        e.preventDefault();
        this.isPlaying = !this.isPlaying;
        this.panel.setPlaying(this.isPlaying);
      }
    }) as EventListener);
  }

  private updateTrailVisibility() {
    for (const [, line] of this.trailLines) {
      line.visible = this.showTrails;
    }
  }

  // ─── VR Panel ─────────────────────────────────────────────────

  private setupVRPanel(ctx: SceneContext) {
    const xr = ctx.xrManager!;
    this.vrPanel = new VRPanel(1.4, 1.1);
    this.vrPanel.setTitle("N-Body Sandbox");

    const btnH = 0.16;
    const btnW = 0.175;
    const gap = 0.015;
    const startX = 0.03;

    // Row 1: Play/Pause, Speed, Preset cycle, Clear
    const btnY = 0.32;
    this.vrPanel.addButton({
      label: this.isPlaying ? "\u23F8" : "\u25B6",
      x: startX, y: btnY, w: btnW, h: btnH,
      onClick: () => {
        this.isPlaying = !this.isPlaying;
        this.panel.setPlaying(this.isPlaying);
        this.vrPanel?.updateButton(0, this.isPlaying ? "\u23F8" : "\u25B6");
      },
    });

    this.vrPanel.addButton({
      label: `${this.speed}x`,
      x: startX + (btnW + gap), y: btnY, w: btnW, h: btnH,
      onClick: () => {
        const speeds = [0.1, 0.25, 0.5, 1, 2, 5, 10];
        const idx = speeds.indexOf(this.speed);
        this.speed = speeds[(idx + 1) % speeds.length];
        this.vrPanel?.updateButton(1, `${this.speed}x`);
      },
    });

    this.vrPanel.addButton({
      label: presets[this.currentPresetIndex].name,
      x: startX + (btnW + gap) * 2, y: btnY, w: btnW * 1.6, h: btnH,
      onClick: () => {
        this.currentPresetIndex = (this.currentPresetIndex + 1) % presets.length;
        this.loadPreset(this.currentPresetIndex);
        this.vrPanel?.updateButton(2, presets[this.currentPresetIndex].name);
      },
    });

    this.vrPanel.addButton({
      label: "Clear",
      x: startX + (btnW + gap) * 2 + btnW * 1.6 + gap, y: btnY, w: btnW, h: btnH,
      onClick: () => {
        this.clearVisuals();
        this.system.clear();
      },
    });

    // Row 2: Body type placement buttons + collision toggle
    const row2Y = 0.52;

    this.vrPanel.addButton({
      label: "\u2729 Star",
      x: startX, y: row2Y, w: btnW, h: btnH,
      onClick: () => this.enterVRPlacementMode("star", 1.0),
    });

    this.vrPanel.addButton({
      label: "\u25CF Planet",
      x: startX + (btnW + gap), y: row2Y, w: btnW, h: btnH,
      onClick: () => this.enterVRPlacementMode("planet", 0.1),
    });

    this.vrPanel.addButton({
      label: "\u26AB BH",
      x: startX + (btnW + gap) * 2, y: row2Y, w: btnW, h: btnH,
      onClick: () => this.enterVRPlacementMode("blackhole", 5.0),
    });

    this.vrPanel.addButton({
      label: this.system.collisionsEnabled ? "Coll: ON" : "Coll: OFF",
      x: startX + (btnW + gap) * 3, y: row2Y, w: btnW * 1.2, h: btnH,
      onClick: () => {
        this.system.collisionsEnabled = !this.system.collisionsEnabled;
        this.vrPanel?.updateButton(7, this.system.collisionsEnabled ? "Coll: ON" : "Coll: OFF");
      },
    });

    // Row 3: Trails, Grid toggles, Exit VR
    const row3Y = 0.72;

    this.vrPanel.addButton({
      label: this.showTrails ? "Trails: ON" : "Trails: OFF",
      x: startX, y: row3Y, w: btnW * 1.2, h: btnH,
      onClick: () => {
        this.showTrails = !this.showTrails;
        this.updateTrailVisibility();
        this.vrPanel?.updateButton(8, this.showTrails ? "Trails: ON" : "Trails: OFF");
      },
    });

    this.vrPanel.addButton({
      label: this.showGrid ? "Grid: ON" : "Grid: OFF",
      x: startX + btnW * 1.2 + gap, y: row3Y, w: btnW * 1.2, h: btnH,
      onClick: () => {
        this.showGrid = !this.showGrid;
        this.gridHelper.visible = this.showGrid;
        this.vrPanel?.updateButton(9, this.showGrid ? "Grid: ON" : "Grid: OFF");
      },
    });

    this.vrPanel.addButton({
      label: "Exit VR",
      x: startX + (btnW * 1.2 + gap) * 2, y: row3Y, w: btnW * 1.2, h: btnH,
      onClick: () => {
        this.ctx.renderer.xr.getSession()?.end();
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
      if (this.vrPanel) ctx.scene.remove(this.vrPanel.mesh);
      this.exitVRPlacementMode();
    };

    // If already in VR (scene switch mid-session)
    if (xr.isPresenting && this.vrPanel) {
      this.vrPanel.positionInFront(ctx.camera, 2, -0.3);
      ctx.scene.add(this.vrPanel.mesh);
    }

    // Controller placement hooks
    xr.onControllerSelectStart = (origin, direction, controllerIndex) => {
      if (!this.vrPlacing) return false;

      // Raycast against ground plane
      const ray = new THREE.Ray(origin, direction);
      const hit = new THREE.Vector3();
      if (!ray.intersectPlane(this.groundPlane, hit)) return true;

      this.vrPlacePosition = hit.clone();
      this.vrPlacingControllerIndex = controllerIndex;

      // Show ghost sphere at placement point
      const color = this.placeType === "blackhole" ? 0x6633aa :
        this.placeType === "star" ? 0xffdd33 : 0x4488ff;
      this.vrGhostSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
      );
      this.vrGhostSphere.position.copy(hit);
      this.group.add(this.vrGhostSphere);

      return true; // consume — don't teleport
    };

    xr.onControllerSelectEnd = (origin, direction, _controllerIndex) => {
      if (!this.vrPlacing || !this.vrPlacePosition) return;

      // Raycast to get release position for velocity
      const ray = new THREE.Ray(origin, direction);
      const hit = new THREE.Vector3();
      const velocity = new THREE.Vector3();

      if (ray.intersectPlane(this.groundPlane, hit)) {
        velocity.subVectors(hit, this.vrPlacePosition).multiplyScalar(0.5);
        velocity.y = 0;
      }

      const body = this.system.addBody({
        mass: this.placeMass,
        position: this.vrPlacePosition,
        velocity,
        type: this.placeType,
      });

      if (body) {
        this.bodyMeshes.set(body.id, this.createBodyMesh(body));
        this.trailLines.set(body.id, this.createTrailLine(body));
      }

      // Clean up ghost + arrow
      if (this.vrGhostSphere) {
        this.group.remove(this.vrGhostSphere);
        this.vrGhostSphere = null;
      }
      if (this.vrVelocityArrow) {
        this.group.remove(this.vrVelocityArrow);
        this.vrVelocityArrow = null;
      }
      this.vrPlacePosition = null;
      this.vrPlacingControllerIndex = -1;
      // Stay in placement mode for rapid placement
    };
  }

  private enterVRPlacementMode(type: BodyType, mass: number) {
    this.vrPlacing = true;
    this.placeType = type;
    this.placeMass = mass;
    this.vrPanel?.setLines(["Point at ground + pull trigger to place", `Placing: ${type} (mass ${mass})`]);
  }

  private exitVRPlacementMode() {
    this.vrPlacing = false;
    if (this.vrGhostSphere) {
      this.group.remove(this.vrGhostSphere);
      this.vrGhostSphere = null;
    }
    if (this.vrVelocityArrow) {
      this.group.remove(this.vrVelocityArrow);
      this.vrVelocityArrow = null;
    }
    this.vrPlacePosition = null;
    this.vrPanel?.setLines([]);
  }

  update(dt: number, _elapsed: number): void {
    this.elapsed += dt;

    // Track body count before step to detect collisions
    const prevCount = this.system.bodies.length;
    const prevPositions = new Map<string, THREE.Vector3>();
    for (const body of this.system.bodies) {
      prevPositions.set(body.id, body.position.clone());
    }

    // Physics step
    if (this.isPlaying) {
      this.system.step(dt * this.speed);
    }

    // Detect collisions (body count decreased)
    if (this.system.bodies.length < prevCount) {
      // Find merged bodies (new IDs not in previous set)
      for (const body of this.system.bodies) {
        if (!prevPositions.has(body.id)) {
          this.spawnCollisionEffect(body.position, body.color);
        }
      }
    }

    // Sync meshes (handles additions/removals from collisions)
    this.syncMeshes();

    // Update mesh positions and shader uniforms
    for (const body of this.system.bodies) {
      const meshGroup = this.bodyMeshes.get(body.id);
      if (meshGroup) {
        meshGroup.position.copy(body.position);

        // Update shader uniforms for Fresnel bodies
        const mainMesh = meshGroup.children[0] as THREE.Mesh;
        if (mainMesh?.userData.isShaderBody) {
          const mat = mainMesh.material as THREE.ShaderMaterial;
          if (mat.uniforms.uTime) {
            mat.uniforms.uTime.value = this.elapsed;
          }
          // Mass-based glow intensity
          const glowIntensity = Math.min(body.mass * 0.5, 2.0);
          if (mat.uniforms.uGlowIntensity) {
            mat.uniforms.uGlowIntensity.value = glowIntensity;
          }
        }
      }

      // Update trail line (zero-allocation path)
      if (this.showTrails) {
        const line = this.trailLines.get(body.id);
        if (line && body.trail.length >= 2) {
          const geom = line.geometry;
          const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
          const alphaAttr = geom.getAttribute("aAlpha") as THREE.BufferAttribute;
          const posArray = posAttr.array as Float32Array;
          const alphaArray = alphaAttr.array as Float32Array;

          const len = body.trail.length;
          let writeIdx = 0;

          if (len < MAX_TRAIL) {
            // Buffer not full — sequential
            for (let i = 0; i < len; i++) {
              const p = body.trail[i];
              posArray[writeIdx * 3] = p.x;
              posArray[writeIdx * 3 + 1] = p.y;
              posArray[writeIdx * 3 + 2] = p.z;
              alphaArray[writeIdx] = (i / len) * 0.6; // 0 at tail → 0.6 at head
              writeIdx++;
            }
          } else {
            // Ring buffer — read from trailIndex (oldest) forward
            for (let i = 0; i < len; i++) {
              const p = body.trail[(body.trailIndex + i) % len];
              posArray[writeIdx * 3] = p.x;
              posArray[writeIdx * 3 + 1] = p.y;
              posArray[writeIdx * 3 + 2] = p.z;
              alphaArray[writeIdx] = (i / len) * 0.6;
              writeIdx++;
            }
          }

          posAttr.needsUpdate = true;
          alphaAttr.needsUpdate = true;
          geom.setDrawRange(0, writeIdx);
        }
      }
    }

    // Update collision particle effects
    for (let i = this.collisionEffects.length - 1; i >= 0; i--) {
      const effect = this.collisionEffects[i];
      effect.age += dt;
      effect.bloomDecay = Math.max(0, effect.bloomDecay - dt);

      const progress = effect.age / 1.0; // 1s duration
      if (progress >= 1) {
        this.group.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        (effect.mesh.material as THREE.PointsMaterial).dispose();
        this.collisionEffects.splice(i, 1);
      } else {
        const posAttr = effect.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
        const posArray = posAttr.array as Float32Array;

        for (let j = 0; j < PARTICLE_COUNT; j++) {
          const p = effect.particles[j];
          // Decelerate
          p.velocity.multiplyScalar(0.96);
          p.position.addScaledVector(p.velocity, dt);

          posArray[j * 3] = p.position.x;
          posArray[j * 3 + 1] = p.position.y;
          posArray[j * 3 + 2] = p.position.z;
        }

        posAttr.needsUpdate = true;

        // Fade opacity
        const mat = effect.mesh.material as THREE.PointsMaterial;
        const bloomBoost = effect.bloomDecay > 0 ? 1.5 : 0;
        mat.opacity = (1 - progress) * (1.0 + bloomBoost);
      }
    }

    // Update VR velocity arrow during drag — track from the controller that started placement
    if (this.vrPlacing && this.vrPlacePosition && this.vrPlacingControllerIndex >= 0 && this.ctx.xrManager?.isPresenting) {
      const controller = this.ctx.renderer.xr.getController(this.vrPlacingControllerIndex);
      if (controller) {
        const tempMatrix = new THREE.Matrix4().identity().extractRotation(controller.matrixWorld);
        const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
        const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
        const ray = new THREE.Ray(origin, direction);
        const hit = new THREE.Vector3();
        if (ray.intersectPlane(this.groundPlane, hit)) {
          const dir = new THREE.Vector3().subVectors(hit, this.vrPlacePosition);
          const length = dir.length();

          if (this.vrVelocityArrow) {
            this.group.remove(this.vrVelocityArrow);
            this.vrVelocityArrow = null;
          }

          if (length > 0.1) {
            this.vrVelocityArrow = new THREE.ArrowHelper(
              dir.clone().normalize(), this.vrPlacePosition, length,
              0x00ff88, 0.2, 0.12,
            );
            this.group.add(this.vrVelocityArrow);
          }
        }
      }
    }

    // Smooth camera target toward center of mass
    const com = this.system.getCenterOfMass();
    this.cameraTarget.lerp(com, 0.02);
    this.ctx.controls.target.copy(this.cameraTarget);
    this.ctx.controls.update();

    // Update panel info
    this.panel.updateInfo(
      this.system.bodies.length,
      this.system.getTotalEnergy(),
    );
  }

  onResize(_w: number, _h: number): void {}

  getUI(): HTMLElement | null {
    return this.panel?.element ?? null;
  }

  dispose(): void {
    this.exitPlacementMode();
    this.exitVRPlacementMode();

    // Clean up VR panel
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

    for (const { el, type, fn } of this.boundHandlers) {
      el.removeEventListener(type, fn);
    }
    this.boundHandlers = [];

    this.clearVisuals();
    this.ctx.scene.remove(this.group);
    this.ctx.scene.remove(this.stars);
    this.panel?.dispose();

    this.ctx.controls.enabled = true;
  }
}
