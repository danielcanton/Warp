import * as THREE from "three";
import type { WaveformData, GWEvent } from "./waveform";
import { classifyEvent } from "./waveform";

// ─── Fresnel shader for black holes ──────────────────────────────────
// Dark core with bright edge glow (event horizon silhouette)
const bhVertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

const bhFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uGlowIntensity;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
  float rim = pow(fresnel, 2.5);
  // Dark core, bright rim
  vec3 core = vec3(0.01, 0.01, 0.02);
  vec3 glow = uColor * rim * (1.5 + uGlowIntensity * 2.0);
  // Subtle inner gradient
  float inner = pow(fresnel, 0.8) * 0.08;
  vec3 finalColor = core + glow + uColor * inner;
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ─── Emissive shader for neutron stars ───────────────────────────────
// Hot glowing surface with pulsing subsurface scattering look
const nsVertexShader = bhVertexShader; // Same vertex shader

const nsFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uGlowIntensity;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
  float rim = pow(fresnel, 2.0);
  // Hot emissive core — bright center, hotter rim
  float core = 0.6 + 0.15 * sin(uTime * 8.0); // subtle pulse
  vec3 hotColor = uColor * core;
  vec3 rimColor = vec3(0.9, 0.95, 1.0) * rim * (1.0 + uGlowIntensity);
  vec3 finalColor = hotColor + rimColor;
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

function makeBHMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: bhVertexShader,
    fragmentShader: bhFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uGlowIntensity: { value: 0.0 },
    },
    transparent: false,
  });
}

function makeNSMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: nsVertexShader,
    fragmentShader: nsFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uGlowIntensity: { value: 0.0 },
      uTime: { value: 0.0 },
    },
    transparent: false,
  });
}

// Color palette per object type
const COLORS = {
  bh1: 0x818cf8,  // indigo (black hole primary)
  bh2: 0xf472b6,  // pink (black hole secondary)
  ns1: 0x22d3ee,  // cyan (neutron star primary)
  ns2: 0x38bdf8,  // sky blue (neutron star secondary)
};

/**
 * Visual representation of a binary system (two objects orbiting and merging).
 *
 * Uses a simplified inspiral trajectory:
 * - Orbital separation shrinks as r(t) ~ (t_merger - t)^(1/4)
 * - Orbital frequency increases as f(t) ~ (t_merger - t)^(-3/8)
 * - At merger: objects combine into one, ringdown oscillation
 */
export class BinarySystem {
  readonly group = new THREE.Group();

  private obj1: THREE.Mesh;
  private obj2: THREE.Mesh;
  private trail1: THREE.Line;
  private trail2: THREE.Line;
  private mergedObj: THREE.Mesh;
  private mergerFlash: THREE.Mesh;

  private trailPositions1: THREE.Vector3[] = [];
  private trailPositions2: THREE.Vector3[] = [];
  private readonly maxTrailLength = 120;

  private obj1Glow: THREE.PointLight;
  private obj2Glow: THREE.PointLight;

  private elapsed = 0;
  private currentType = "BBH";

  constructor() {
    // Default to black hole materials (updated per event via setEventType)
    const mat1 = makeBHMaterial(COLORS.bh1);
    const mat2 = makeBHMaterial(COLORS.bh2);

    this.obj1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 32), mat1);
    this.obj2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 32), mat2);

    // Orbital trails
    const trailMat1 = new THREE.LineBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.4,
    });
    const trailMat2 = new THREE.LineBasicMaterial({
      color: 0xf472b6,
      transparent: true,
      opacity: 0.4,
    });
    const emptyGeom = new THREE.BufferGeometry();
    this.trail1 = new THREE.Line(emptyGeom.clone(), trailMat1);
    this.trail2 = new THREE.Line(emptyGeom.clone(), trailMat2);

    // Merged object (appears after merger)
    const mergedMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
    });
    this.mergedObj = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 32, 32),
      mergedMat
    );

    // Merger flash — expanding ring
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.mergerFlash = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.3, 64),
      flashMat
    );
    this.mergerFlash.rotation.x = -Math.PI / 2;

    // Point lights for glow
    this.obj1Glow = new THREE.PointLight(0x818cf8, 0, 3);
    this.obj2Glow = new THREE.PointLight(0xf472b6, 0, 3);
    this.obj1.add(this.obj1Glow);
    this.obj2.add(this.obj2Glow);

    this.group.add(
      this.obj1,
      this.obj2,
      this.trail1,
      this.trail2,
      this.mergedObj,
      this.mergerFlash
    );

    // Position above the spacetime mesh
    this.group.position.y = 0.6;
  }

  /**
   * Update materials to match the event type (BBH, BNS, NSBH).
   */
  setEventType(event: GWEvent) {
    const type = classifyEvent(event);
    if (type === this.currentType) return;
    this.currentType = type;

    const oldMat1 = this.obj1.material as THREE.ShaderMaterial;
    const oldMat2 = this.obj2.material as THREE.ShaderMaterial;
    oldMat1.dispose();
    oldMat2.dispose();

    const trailMat1 = this.trail1.material as THREE.LineBasicMaterial;
    const trailMat2 = this.trail2.material as THREE.LineBasicMaterial;

    if (type === "BBH") {
      this.obj1.material = makeBHMaterial(COLORS.bh1);
      this.obj2.material = makeBHMaterial(COLORS.bh2);
      trailMat1.color.set(COLORS.bh1);
      trailMat2.color.set(COLORS.bh2);
      this.obj1Glow.color.set(COLORS.bh1);
      this.obj2Glow.color.set(COLORS.bh2);
    } else if (type === "BNS") {
      this.obj1.material = makeNSMaterial(COLORS.ns1);
      this.obj2.material = makeNSMaterial(COLORS.ns2);
      trailMat1.color.set(COLORS.ns1);
      trailMat2.color.set(COLORS.ns2);
      this.obj1Glow.color.set(COLORS.ns1);
      this.obj2Glow.color.set(COLORS.ns2);
    } else {
      // NSBH: obj1 (heavier) is BH, obj2 (lighter) is NS
      this.obj1.material = makeBHMaterial(COLORS.bh1);
      this.obj2.material = makeNSMaterial(COLORS.ns2);
      trailMat1.color.set(COLORS.bh1);
      trailMat2.color.set(COLORS.ns2);
      this.obj1Glow.color.set(COLORS.bh1);
      this.obj2Glow.color.set(COLORS.ns2);
    }
  }

  /**
   * Update the binary system for the current playback time.
   * @param t - normalized time [0, 1]
   * @param waveform - current waveform data
   * @param event - current GW event (for mass ratio)
   */
  update(t: number, waveform: WaveformData, event: GWEvent) {
    const mergerNorm = waveform.peakIndex / waveform.hPlus.length;
    const massRatio = event.mass_1_source / event.mass_2_source;

    // Track elapsed time for NS pulse animation
    this.elapsed += 1 / 60; // approximate dt

    // Size objects proportional to mass
    const scale1 = 0.8 + (massRatio / (1 + massRatio)) * 0.4;
    const scale2 = 0.8 + (1 / (1 + massRatio)) * 0.4;
    this.obj1.scale.setScalar(scale1);
    this.obj2.scale.setScalar(scale2);

    if (t < mergerNorm) {
      // ─── INSPIRAL ───
      const progress = t / mergerNorm; // 0 → 1 during inspiral

      // Orbital separation shrinks
      const initialSep = 2.0;
      const separation = initialSep * Math.pow(1 - progress * 0.95, 0.25);

      // Orbital frequency increases (chirp)
      const tau = Math.max(1 - progress, 0.01);
      const orbitalPhase = 40 * Math.pow(tau, 5 / 8) * -1;

      // Positions
      const r1 = separation / (1 + massRatio);
      const r2 = separation * massRatio / (1 + massRatio);

      const x1 = r1 * Math.cos(orbitalPhase);
      const z1 = r1 * Math.sin(orbitalPhase);
      const x2 = -r2 * Math.cos(orbitalPhase);
      const z2 = -r2 * Math.sin(orbitalPhase);

      this.obj1.position.set(x1, 0, z1);
      this.obj2.position.set(x2, 0, z2);
      this.obj1.visible = true;
      this.obj2.visible = true;
      (this.mergedObj.material as THREE.MeshBasicMaterial).opacity = 0;

      // Glow intensifies as they get closer
      const glowIntensity = progress * progress * 2;
      this.obj1Glow.intensity = glowIntensity;
      this.obj2Glow.intensity = glowIntensity;

      // Update shader uniforms
      const mat1 = this.obj1.material as THREE.ShaderMaterial;
      const mat2 = this.obj2.material as THREE.ShaderMaterial;
      mat1.uniforms.uGlowIntensity.value = glowIntensity;
      mat2.uniforms.uGlowIntensity.value = glowIntensity;
      if (mat1.uniforms.uTime) mat1.uniforms.uTime.value = this.elapsed;
      if (mat2.uniforms.uTime) mat2.uniforms.uTime.value = this.elapsed;

      // Update trails
      this.trailPositions1.push(
        new THREE.Vector3(x1, this.group.position.y, z1)
      );
      this.trailPositions2.push(
        new THREE.Vector3(x2, this.group.position.y, z2)
      );
      if (this.trailPositions1.length > this.maxTrailLength) {
        this.trailPositions1.shift();
        this.trailPositions2.shift();
      }
      this.updateTrail(this.trail1, this.trailPositions1);
      this.updateTrail(this.trail2, this.trailPositions2);

      // Hide merger effects
      (this.mergerFlash.material as THREE.MeshBasicMaterial).opacity = 0;
    } else {
      // ─── MERGER + RINGDOWN ───
      const postMerger = (t - mergerNorm) / (1 - mergerNorm); // 0 → 1

      // Hide individual objects
      this.obj1.visible = false;
      this.obj2.visible = false;
      this.obj1Glow.intensity = 0;
      this.obj2Glow.intensity = 0;
      (this.obj1.material as THREE.ShaderMaterial).uniforms.uGlowIntensity.value = 0;
      (this.obj2.material as THREE.ShaderMaterial).uniforms.uGlowIntensity.value = 0;

      // Show merged object
      this.mergedObj.position.set(0, 0, 0);
      const mergedMat = this.mergedObj.material as THREE.MeshBasicMaterial;
      mergedMat.opacity = Math.max(0, 1 - postMerger * 2);
      mergedMat.color.setHSL(0.7, 0.5, 0.5 + (1 - postMerger) * 0.5);

      // Ringdown oscillation on merged object scale
      const ringdown = Math.exp(-postMerger * 5) * Math.cos(postMerger * 30);
      this.mergedObj.scale.setScalar(1.5 + ringdown * 0.3);

      // Merger flash — expanding ring
      const flashMat = this.mergerFlash.material as THREE.MeshBasicMaterial;
      if (postMerger < 0.3) {
        const flashProgress = postMerger / 0.3;
        flashMat.opacity = (1 - flashProgress) * 0.9;
        const flashScale = 1 + flashProgress * 15;
        this.mergerFlash.scale.setScalar(flashScale);
      } else {
        flashMat.opacity = 0;
      }

      // Fade trails
      (this.trail1.material as THREE.LineBasicMaterial).opacity =
        0.4 * (1 - postMerger);
      (this.trail2.material as THREE.LineBasicMaterial).opacity =
        0.4 * (1 - postMerger);
    }
  }

  private updateTrail(line: THREE.Line, positions: THREE.Vector3[]) {
    if (positions.length < 2) return;
    const geom = new THREE.BufferGeometry().setFromPoints(positions);
    line.geometry.dispose();
    line.geometry = geom;
  }

  /** Reset when switching events */
  reset() {
    this.trailPositions1 = [];
    this.trailPositions2 = [];
    this.obj1.visible = true;
    this.obj2.visible = true;
    (this.mergedObj.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.mergerFlash.material as THREE.MeshBasicMaterial).opacity = 0;
    this.updateTrail(this.trail1, []);
    this.updateTrail(this.trail2, []);
  }
}
