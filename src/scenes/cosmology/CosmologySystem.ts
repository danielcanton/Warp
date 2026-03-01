import { Vector3, Color } from "three";

export interface Galaxy {
  id: string;
  mass: number;
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  color: Color;
  type: "spiral" | "elliptical";
}

const G = 1.0;
const SOFTENING = 0.5;
const SUBSTEPS = 8;

let nextId = 0;

export class CosmologySystem {
  galaxies: Galaxy[] = [];

  addGalaxy(opts: {
    mass: number;
    position: Vector3;
    velocity?: Vector3;
    type?: "spiral" | "elliptical";
    color?: Color;
  }): Galaxy {
    const type = opts.type ?? "spiral";
    const color =
      opts.color ??
      (type === "spiral"
        ? new Color().setHSL(0.58 + Math.random() * 0.08, 0.6, 0.7) // blue-white
        : new Color().setHSL(0.08 + Math.random() * 0.05, 0.7, 0.6)); // yellow-red

    const galaxy: Galaxy = {
      id: `galaxy-${nextId++}`,
      mass: opts.mass,
      position: opts.position.clone(),
      velocity: opts.velocity?.clone() ?? new Vector3(),
      acceleration: new Vector3(),
      color,
      type,
    };

    this.galaxies.push(galaxy);
    return galaxy;
  }

  clear() {
    this.galaxies = [];
  }

  step(dt: number) {
    const subDt = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.velocityVerletStep(subDt);
    }
  }

  private velocityVerletStep(dt: number) {
    const n = this.galaxies.length;

    this.computeAccelerations();

    for (const g of this.galaxies) {
      g.position.addScaledVector(g.velocity, dt);
      g.position.addScaledVector(g.acceleration, 0.5 * dt * dt);
    }

    const oldAccels: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      oldAccels.push(this.galaxies[i].acceleration.clone());
    }

    this.computeAccelerations();

    for (let i = 0; i < n; i++) {
      const avgAccel = oldAccels[i]
        .add(this.galaxies[i].acceleration)
        .multiplyScalar(0.5);
      this.galaxies[i].velocity.addScaledVector(avgAccel, dt);
    }
  }

  private computeAccelerations() {
    const n = this.galaxies.length;
    const eps2 = SOFTENING * SOFTENING;
    const diff = new Vector3();

    for (let i = 0; i < n; i++) {
      this.galaxies[i].acceleration.set(0, 0, 0);
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        diff.subVectors(this.galaxies[j].position, this.galaxies[i].position);
        const dist2 = diff.lengthSq() + eps2;
        const dist = Math.sqrt(dist2);
        const force = G / (dist2 * dist);

        this.galaxies[i].acceleration.addScaledVector(
          diff,
          force * this.galaxies[j].mass,
        );
        this.galaxies[j].acceleration.addScaledVector(
          diff,
          -force * this.galaxies[i].mass,
        );
      }
    }
  }

  getCenterOfMass(): Vector3 {
    const com = new Vector3();
    let totalMass = 0;
    for (const g of this.galaxies) {
      com.addScaledVector(g.position, g.mass);
      totalMass += g.mass;
    }
    return totalMass > 0 ? com.divideScalar(totalMass) : com;
  }

  getSystemExtent(): number {
    if (this.galaxies.length === 0) return 20;
    const com = this.getCenterOfMass();
    let maxDist = 0;
    for (const g of this.galaxies) {
      const d = g.position.distanceTo(com);
      if (d > maxDist) maxDist = d;
    }
    return Math.max(maxDist * 1.5, 10);
  }
}
