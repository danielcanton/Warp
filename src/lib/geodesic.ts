/**
 * RK4 integrator for null geodesics in Schwarzschild spacetime.
 *
 * Uses the effective-potential formulation in the equatorial plane:
 *   d²u/dφ² = -u + (3/2) rs u²     (where u = 1/r)
 *
 * But for 3D trajectories we integrate the full geodesic equation
 * in Cartesian coordinates with the Schwarzschild acceleration:
 *   a = -(3/2) * rs * L² / r⁵ * pos
 */

import * as THREE from "three";

export type GeodesicOutcome = "captured" | "scattered" | "orbiting";

export interface GeodesicResult {
  points: THREE.Vector3[];
  outcome: GeodesicOutcome;
  L: number; // conserved angular momentum magnitude
}

const MAX_STEPS = 5000;
const MAX_DIST = 200;

/**
 * Integrate a null geodesic in Schwarzschild spacetime using RK4.
 *
 * @param startPos  Initial position (3D)
 * @param startVel  Initial velocity direction (will be normalized to c=1)
 * @param rs        Schwarzschild radius (2GM/c²)
 * @param stepSize  Integration step size (default 0.04)
 */
export function integrateGeodesic(
  startPos: THREE.Vector3,
  startVel: THREE.Vector3,
  rs: number,
  stepSize = 0.04,
): GeodesicResult {
  const points: THREE.Vector3[] = [];

  // Normalize velocity to unit speed (null geodesic, c=1)
  const vel = startVel.clone().normalize();
  const pos = startPos.clone();

  // Compute conserved angular momentum L = |r × v|
  const Lvec = new THREE.Vector3().crossVectors(pos, vel);
  const L2 = Lvec.lengthSq();

  const rHorizon = rs;
  const halfRs = 1.5 * rs; // coefficient for geodesic acceleration

  points.push(pos.clone());

  let outcome: GeodesicOutcome = "orbiting";

  // Temporary vectors for RK4 to avoid per-step allocations
  const tmpPos = new THREE.Vector3();
  const tmpVel = new THREE.Vector3();
  const k1v = new THREE.Vector3();
  const k2v = new THREE.Vector3();
  const k3v = new THREE.Vector3();
  const k4v = new THREE.Vector3();

  for (let i = 0; i < MAX_STEPS; i++) {
    const r = pos.length();

    // Check termination conditions
    if (r <= rHorizon * 1.01) {
      outcome = "captured";
      break;
    }
    if (r > MAX_DIST) {
      outcome = "scattered";
      break;
    }

    // Schwarzschild geodesic acceleration: a = -(3/2) * rs * L² / r⁵ * pos
    const accel = (r5: number, p: THREE.Vector3, out: THREE.Vector3) => {
      const factor = -halfRs * L2 / r5;
      out.copy(p).multiplyScalar(factor);
    };

    const dt = stepSize;

    // k1
    const r1 = pos.length();
    const r1_5 = r1 * r1 * r1 * r1 * r1;
    accel(r1_5, pos, k1v);

    // k2
    tmpPos.copy(pos).addScaledVector(vel, dt * 0.5);
    tmpVel.copy(vel).addScaledVector(k1v, dt * 0.5);
    const r2 = tmpPos.length();
    const r2_5 = r2 * r2 * r2 * r2 * r2;
    accel(r2_5, tmpPos, k2v);

    // k3
    tmpPos.copy(pos).addScaledVector(vel, dt * 0.5).addScaledVector(k1v, dt * dt * 0.25);
    tmpVel.copy(vel).addScaledVector(k2v, dt * 0.5);
    const r3 = tmpPos.length();
    const r3_5 = r3 * r3 * r3 * r3 * r3;
    accel(r3_5, tmpPos, k3v);

    // k4
    tmpPos.copy(pos).addScaledVector(vel, dt).addScaledVector(k2v, dt * dt * 0.5);
    tmpVel.copy(vel).addScaledVector(k3v, dt);
    const r4 = tmpPos.length();
    const r4_5 = r4 * r4 * r4 * r4 * r4;
    accel(r4_5, tmpPos, k4v);

    // Update position: pos += dt * vel + (dt²/6) * (k1 + k2 + k3)
    pos.addScaledVector(vel, dt);

    // Update velocity: vel += (dt/6) * (k1 + 2*k2 + 2*k3 + k4)
    vel.addScaledVector(k1v, dt / 6);
    vel.addScaledVector(k2v, dt / 3);
    vel.addScaledVector(k3v, dt / 3);
    vel.addScaledVector(k4v, dt / 6);

    points.push(pos.clone());
  }

  return { points, outcome, L: Math.sqrt(L2) };
}
