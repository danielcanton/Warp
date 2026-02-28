import * as THREE from "three";
import type { Scene, SceneContext } from "../types";
import { NBodySystem, type Body } from "./NBodySystem";
import { presets } from "./presets";
import { NBodyPanel, type BodyType } from "./NBodyPanel";

export class NBodyScene implements Scene {
  readonly id = "nbody";
  readonly label = "N-Body";
  readonly supportsXR = false;

  private ctx!: SceneContext;
  private group = new THREE.Group();
  private stars!: THREE.Points;
  private gridHelper!: THREE.GridHelper;
  private panel!: NBodyPanel;

  private system = new NBodySystem();
  private bodyMeshes = new Map<string, THREE.Group>();
  private trailLines = new Map<string, THREE.Line>();
  private flashEffects: { mesh: THREE.Mesh; age: number }[] = [];

  private isPlaying = true;
  private speed = 1.0;
  private showTrails = true;
  private showGrid = false;

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

    // Hide other UI
    for (const id of ["event-info", "event-list", "time-controls", "map-legend", "help-overlay", "ui"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
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
    for (const flash of this.flashEffects) {
      this.group.remove(flash.mesh);
    }
    this.flashEffects = [];
  }

  private createBodyMesh(body: Body): THREE.Group {
    const bodyGroup = new THREE.Group();

    if (body.type === "blackhole") {
      // Dark sphere + purple glow ring
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(body.radius, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0x0a0a1a }),
      );
      bodyGroup.add(sphere);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(body.radius * 1.3, body.radius * 1.8, 64),
        new THREE.MeshBasicMaterial({
          color: 0x8844cc, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      bodyGroup.add(ring);

      const glow = new THREE.PointLight(0x6633aa, 1, body.radius * 8);
      bodyGroup.add(glow);
    } else if (body.type === "star") {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(body.radius, 24, 24),
        new THREE.MeshBasicMaterial({ color: body.color }),
      );
      bodyGroup.add(sphere);
      const light = new THREE.PointLight(body.color.getHex(), 0.8, body.radius * 10);
      bodyGroup.add(light);
    } else {
      // Planet — lit material
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(body.radius, 20, 20),
        new THREE.MeshStandardMaterial({
          color: body.color, roughness: 0.7, metalness: 0.2,
        }),
      );
      bodyGroup.add(sphere);
    }

    bodyGroup.position.copy(body.position);
    this.group.add(bodyGroup);
    return bodyGroup;
  }

  private createTrailLine(body: Body): THREE.Line {
    const material = new THREE.LineBasicMaterial({
      color: body.type === "blackhole" ? 0x6633aa : body.color,
      transparent: true,
      opacity: 0.35,
    });
    const geometry = new THREE.BufferGeometry();
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

  private spawnCollisionFlash(position: THREE.Vector3) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.4, 64),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      }),
    );
    ring.position.copy(position);
    ring.rotation.x = -Math.PI / 2;
    this.group.add(ring);
    this.flashEffects.push({ mesh: ring, age: 0 });
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

  update(dt: number, _elapsed: number): void {
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
          this.spawnCollisionFlash(body.position);
        }
      }
    }

    // Sync meshes (handles additions/removals from collisions)
    this.syncMeshes();

    // Update mesh positions
    for (const body of this.system.bodies) {
      const meshGroup = this.bodyMeshes.get(body.id);
      if (meshGroup) {
        meshGroup.position.copy(body.position);
      }

      // Update trail line
      if (this.showTrails) {
        const line = this.trailLines.get(body.id);
        if (line && body.trail.length >= 2) {
          // Read trail in order from ring buffer
          const ordered: THREE.Vector3[] = [];
          const len = body.trail.length;
          if (len < 300) {
            // Buffer not full yet — just use sequential
            for (let i = 0; i < len; i++) ordered.push(body.trail[i]);
          } else {
            // Ring buffer — read from trailIndex (oldest) forward
            for (let i = 0; i < len; i++) {
              ordered.push(body.trail[(body.trailIndex + i) % len]);
            }
          }
          const geom = new THREE.BufferGeometry().setFromPoints(ordered);
          line.geometry.dispose();
          line.geometry = geom;
        }
      }
    }

    // Update flash effects
    for (let i = this.flashEffects.length - 1; i >= 0; i--) {
      const flash = this.flashEffects[i];
      flash.age += dt;
      const progress = flash.age / 0.5; // 0.5s duration
      if (progress >= 1) {
        this.group.remove(flash.mesh);
        this.flashEffects.splice(i, 1);
      } else {
        const scale = 1 + progress * 15;
        flash.mesh.scale.setScalar(scale);
        (flash.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.9;
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
