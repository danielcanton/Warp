import * as THREE from "three";
import type { GWEvent } from "./waveform";
import { classifyEvent } from "./waveform";

/**
 * Universe Map — 3D scatter plot of all gravitational wave events
 * positioned at their cosmological distances.
 *
 * Events are rendered as glowing points. Size encodes total mass,
 * color encodes event type (BBH = indigo, BNS = cyan, NSBH = amber).
 * Earth sits at the origin.
 *
 * Scale: 1 unit = 100 Mpc. Max event distance ~6000 Mpc → 60 units.
 */

const SCALE = 1 / 100; // 1 unit = 100 Mpc

const TYPE_COLORS: Record<string, THREE.Color> = {
  BBH: new THREE.Color(0x818cf8),  // indigo
  BNS: new THREE.Color(0x22d3ee),  // cyan
  NSBH: new THREE.Color(0xfbbf24), // amber
};

export class UniverseMap {
  readonly group = new THREE.Group();

  private points: THREE.Points | null = null;
  private labels: THREE.Group = new THREE.Group();
  private earthMarker: THREE.Mesh;
  private distanceRings: THREE.Group = new THREE.Group();
  private events: GWEvent[] = [];
  private raycaster = new THREE.Raycaster();
  private hoveredIndex = -1;

  /** Callback when user clicks an event dot */
  onSelectEvent: ((event: GWEvent) => void) | null = null;

  constructor() {
    // Earth at origin
    const earthGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const earthMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.9,
    });
    this.earthMarker = new THREE.Mesh(earthGeo, earthMat);
    this.group.add(this.earthMarker);

    // "You are here" label would go in HTML overlay
    this.group.add(this.labels);
    this.group.add(this.distanceRings);

    // Distance reference rings (concentric shells at 500, 1000, 2000, 4000 Mpc)
    const ringDistances = [500, 1000, 2000, 4000];
    for (const d of ringDistances) {
      const r = d * SCALE;
      const ringGeo = new THREE.RingGeometry(r - 0.02, r + 0.02, 96);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      this.distanceRings.add(ring);

      // Also add vertical ring for depth perception
      const ringV = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
      this.distanceRings.add(ringV);
    }

    this.group.visible = false;
  }

  /**
   * Populate the map with event data.
   */
  populate(events: GWEvent[]) {
    this.events = events;

    // Remove old points
    if (this.points) {
      this.group.remove(this.points);
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
    }

    const count = events.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const e = events[i];
      const pos = e.mapPosition!;

      positions[i * 3] = pos.x * SCALE;
      positions[i * 3 + 1] = pos.y * SCALE;
      positions[i * 3 + 2] = pos.z * SCALE;

      const type = classifyEvent(e);
      const color = TYPE_COLORS[type] ?? TYPE_COLORS.BBH;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      // Size based on total mass (bigger = more massive merger)
      const totalMass = e.mass_1_source + e.mass_2_source;
      sizes[i] = 3 + Math.min(totalMass / 20, 8);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = size * uPixelRatio * (200.0 / -mvPos.z);
          gl_PointSize = clamp(gl_PointSize, 2.0, 30.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.15, d);
          // Bright center, soft glow
          float core = smoothstep(0.2, 0.0, d);
          vec3 color = vColor + vec3(core * 0.5);
          gl_FragColor = vec4(color, alpha * 0.9);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.group.add(this.points);
  }

  /**
   * Check for hover/click interaction with event dots.
   */
  raycast(
    mouse: THREE.Vector2,
    camera: THREE.Camera,
  ): GWEvent | null {
    if (!this.points || !this.group.visible) return null;

    this.raycaster.setFromCamera(mouse, camera);
    this.raycaster.params.Points = { threshold: 0.5 };

    const intersects = this.raycaster.intersectObject(this.points);
    if (intersects.length > 0 && intersects[0].index !== undefined) {
      return this.events[intersects[0].index];
    }
    return null;
  }

  show() {
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  get isVisible() {
    return this.group.visible;
  }
}
