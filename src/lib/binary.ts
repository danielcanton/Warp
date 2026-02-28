import * as THREE from "three";
import type { WaveformData, GWEvent } from "./waveform";

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

  constructor() {
    // Object materials — compact objects as glowing spheres
    const mat1 = new THREE.MeshBasicMaterial({
      color: 0x818cf8, // indigo
      transparent: true,
    });
    const mat2 = new THREE.MeshBasicMaterial({
      color: 0xf472b6, // pink
      transparent: true,
    });

    this.obj1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 24), mat1);
    this.obj2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 24), mat2);

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
   * Update the binary system for the current playback time.
   * @param t - normalized time [0, 1]
   * @param waveform - current waveform data
   * @param event - current GW event (for mass ratio)
   */
  update(t: number, waveform: WaveformData, event: GWEvent) {
    const mergerNorm = waveform.peakIndex / waveform.hPlus.length;
    const massRatio = event.mass_1_source / event.mass_2_source;

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
