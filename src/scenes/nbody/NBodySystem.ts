import { Vector3, Color } from "three";

export interface Body {
  id: string;
  mass: number;           // normalized (1 = solar mass equiv)
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  radius: number;         // visual radius
  color: Color;
  type: "star" | "planet" | "blackhole";
  trail: Vector3[];       // ring buffer
  trailIndex: number;
  fixed: boolean;
}

const G = 1.0;               // gravitational constant (normalized)
const SOFTENING = 0.1;       // prevents singularities
const MAX_TRAIL = 300;
const SUBSTEPS = 10;
const MAX_BODIES = 50;

let nextId = 0;

export class NBodySystem {
  bodies: Body[] = [];
  collisionsEnabled = true;

  addBody(opts: {
    mass: number;
    position: Vector3;
    velocity?: Vector3;
    type?: "star" | "planet" | "blackhole";
    color?: Color;
    fixed?: boolean;
  }): Body | null {
    if (this.bodies.length >= MAX_BODIES) return null;

    const type = opts.type ?? "planet";
    const radius = this.radiusFromMass(opts.mass, type);
    const color = opts.color ?? this.defaultColor(type);

    const body: Body = {
      id: `body-${nextId++}`,
      mass: opts.mass,
      position: opts.position.clone(),
      velocity: opts.velocity?.clone() ?? new Vector3(),
      acceleration: new Vector3(),
      radius,
      color,
      type,
      trail: [],
      trailIndex: 0,
      fixed: opts.fixed ?? false,
    };

    this.bodies.push(body);
    return body;
  }

  removeBody(id: string) {
    this.bodies = this.bodies.filter((b) => b.id !== id);
  }

  clear() {
    this.bodies = [];
  }

  step(dt: number) {
    const subDt = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.velocityVerletStep(subDt);
      if (this.collisionsEnabled) {
        this.handleCollisions();
      }
    }
    // Update trails
    for (const body of this.bodies) {
      if (body.trail.length < MAX_TRAIL) {
        body.trail.push(body.position.clone());
      } else {
        body.trail[body.trailIndex] = body.position.clone();
      }
      body.trailIndex = (body.trailIndex + 1) % MAX_TRAIL;
    }
  }

  private velocityVerletStep(dt: number) {
    const n = this.bodies.length;

    // Compute accelerations
    this.computeAccelerations();

    // Update positions: x += v*dt + 0.5*a*dt^2
    for (const body of this.bodies) {
      if (body.fixed) continue;
      body.position.addScaledVector(body.velocity, dt);
      body.position.addScaledVector(body.acceleration, 0.5 * dt * dt);
    }

    // Store old accelerations
    const oldAccels: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      oldAccels.push(this.bodies[i].acceleration.clone());
    }

    // Compute new accelerations
    this.computeAccelerations();

    // Update velocities: v += 0.5*(a_old + a_new)*dt
    for (let i = 0; i < n; i++) {
      if (this.bodies[i].fixed) continue;
      const avgAccel = oldAccels[i].add(this.bodies[i].acceleration).multiplyScalar(0.5);
      this.bodies[i].velocity.addScaledVector(avgAccel, dt);
    }
  }

  private computeAccelerations() {
    const n = this.bodies.length;
    const eps2 = SOFTENING * SOFTENING;
    const diff = new Vector3();

    for (let i = 0; i < n; i++) {
      this.bodies[i].acceleration.set(0, 0, 0);
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        diff.subVectors(this.bodies[j].position, this.bodies[i].position);
        const dist2 = diff.lengthSq() + eps2;
        const dist = Math.sqrt(dist2);
        const force = G / (dist2 * dist); // G / |r|^3

        if (!this.bodies[i].fixed) {
          this.bodies[i].acceleration.addScaledVector(diff, force * this.bodies[j].mass);
        }
        if (!this.bodies[j].fixed) {
          this.bodies[j].acceleration.addScaledVector(diff, -force * this.bodies[i].mass);
        }
      }
    }
  }

  private handleCollisions() {
    const toRemove = new Set<string>();
    const toAdd: Body[] = [];

    for (let i = 0; i < this.bodies.length; i++) {
      if (toRemove.has(this.bodies[i].id)) continue;
      for (let j = i + 1; j < this.bodies.length; j++) {
        if (toRemove.has(this.bodies[j].id)) continue;

        const a = this.bodies[i];
        const b = this.bodies[j];
        const dist = a.position.distanceTo(b.position);

        if (dist < a.radius + b.radius) {
          // Merge: heavier body absorbs lighter
          const totalMass = a.mass + b.mass;

          // Center of mass position
          const pos = new Vector3()
            .addScaledVector(a.position, a.mass)
            .addScaledVector(b.position, b.mass)
            .divideScalar(totalMass);

          // Momentum-conserving velocity
          const vel = new Vector3()
            .addScaledVector(a.velocity, a.mass)
            .addScaledVector(b.velocity, b.mass)
            .divideScalar(totalMass);

          // Volume-conserving radius
          const r3 = Math.pow(a.radius, 3) + Math.pow(b.radius, 3);
          const newRadius = Math.cbrt(r3);

          // Determine type: heavier body's type wins, blackhole dominates
          let type: "star" | "planet" | "blackhole" = a.mass >= b.mass ? a.type : b.type;
          if (a.type === "blackhole" || b.type === "blackhole") type = "blackhole";

          const color = a.mass >= b.mass ? a.color.clone() : b.color.clone();
          const fixed = a.fixed || b.fixed;

          toRemove.add(a.id);
          toRemove.add(b.id);

          toAdd.push({
            id: `body-${nextId++}`,
            mass: totalMass,
            position: pos,
            velocity: fixed ? new Vector3() : vel,
            acceleration: new Vector3(),
            radius: newRadius,
            color,
            type,
            trail: [],
            trailIndex: 0,
            fixed,
          });
        }
      }
    }

    if (toRemove.size > 0) {
      this.bodies = this.bodies.filter((b) => !toRemove.has(b.id));
      this.bodies.push(...toAdd);
    }
  }

  getCenterOfMass(): Vector3 {
    const com = new Vector3();
    let totalMass = 0;
    for (const body of this.bodies) {
      com.addScaledVector(body.position, body.mass);
      totalMass += body.mass;
    }
    return totalMass > 0 ? com.divideScalar(totalMass) : com;
  }

  getSystemExtent(): number {
    if (this.bodies.length === 0) return 10;
    const com = this.getCenterOfMass();
    let maxDist = 0;
    for (const body of this.bodies) {
      const d = body.position.distanceTo(com);
      if (d > maxDist) maxDist = d;
    }
    return Math.max(maxDist * 1.5, 5);
  }

  getTotalEnergy(): number {
    let kinetic = 0;
    let potential = 0;
    const eps2 = SOFTENING * SOFTENING;

    for (const body of this.bodies) {
      kinetic += 0.5 * body.mass * body.velocity.lengthSq();
    }

    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const dist = Math.sqrt(
          this.bodies[i].position.distanceToSquared(this.bodies[j].position) + eps2
        );
        potential -= G * this.bodies[i].mass * this.bodies[j].mass / dist;
      }
    }

    return kinetic + potential;
  }

  private radiusFromMass(mass: number, type: string): number {
    if (type === "blackhole") return 0.15 + mass * 0.02;
    if (type === "star") return 0.12 + Math.pow(mass, 0.3) * 0.08;
    return 0.06 + Math.pow(mass, 0.3) * 0.04; // planet
  }

  private defaultColor(type: string): Color {
    if (type === "blackhole") return new Color(0x1a1a2e);
    if (type === "star") return new Color(0xffd700);
    return new Color(0x4488ff); // planet
  }
}
