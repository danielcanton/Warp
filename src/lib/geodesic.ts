/**
 * RK4 integrator for geodesics in Schwarzschild spacetime.
 *
 * Null geodesics (photons):
 *   a = -(3/2) * rs * L² / r⁵ * pos
 *
 * Timelike geodesics (massive particles):
 *   Uses the Schwarzschild effective potential with mass term:
 *   V_eff = (1 - rs/r)(1 + L²/r²)
 *   Acceleration includes both the photon term and the Newtonian term.
 */

import * as THREE from "three";

export type GeodesicOutcome = "captured" | "scattered" | "orbiting" | "bound";

export type ParticleType = "photon" | "particle";

export interface GeodesicResult {
  points: THREE.Vector3[];
  outcome: GeodesicOutcome;
  L: number; // conserved angular momentum magnitude
  particleType: ParticleType;
}

const MAX_STEPS = 5000;
const MAX_STEPS_MASSIVE = 20000; // bound orbits need more steps
const MAX_DIST = 200;

/**
 * Compute the timelike effective potential V_eff(r) for massive particles.
 * V_eff = (1 - rs/r)(1 + L²/r²)
 */
export function timelikeVeff(r: number, rs: number, L: number): number {
  if (r <= rs) return 0;
  return (1 - rs / r) * (1 + (L * L) / (r * r));
}

/**
 * Find the ISCO (innermost stable circular orbit) radius for a given rs.
 * For Schwarzschild: r_isco = 3 * rs (= 6M since rs = 2M)
 */
export function iscoRadius(rs: number): number {
  return 3 * rs;
}

/**
 * Compute the energy of a circular orbit at radius r.
 * E² = V_eff(r) for circular orbits.
 */
export function circularOrbitEnergy(r: number, rs: number, L: number): number {
  return timelikeVeff(r, rs, L);
}

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

  return { points, outcome, L: Math.sqrt(L2), particleType: "photon" };
}

/**
 * Integrate a timelike (massive particle) geodesic in Schwarzschild spacetime.
 *
 * The acceleration for a massive particle has two terms:
 *   a = -(rs/2) / r³ * pos  (Newtonian gravity)
 *     + -(3/2) * rs * L² / r⁵ * pos  (GR correction, same as photon)
 *
 * @param startPos   Initial position (3D)
 * @param startVel   Initial velocity direction (speed set by energy)
 * @param rs         Schwarzschild radius
 * @param energy     E²/m²c⁴ — the squared specific energy
 * @param stepSize   Integration step size
 */
export function integrateTimelikeGeodesic(
  startPos: THREE.Vector3,
  startVel: THREE.Vector3,
  rs: number,
  energy: number,
  stepSize = 0.03,
): GeodesicResult {
  const points: THREE.Vector3[] = [];

  const pos = startPos.clone();
  const r0 = pos.length();

  // Compute angular momentum from position and velocity direction
  const velDir = startVel.clone().normalize();
  const Lvec = new THREE.Vector3().crossVectors(pos, velDir);
  const L = Lvec.length();
  const L2 = L * L;

  // Compute initial radial velocity from energy equation:
  // E² = (dr/dτ)² + V_eff(r)
  // (dr/dτ)² = E² - V_eff(r)
  const veff0 = timelikeVeff(r0, rs, L);
  const drdt2 = energy - veff0;

  // Set velocity magnitude from energy
  // The velocity has radial and tangential components
  // v_tangential = L/r, v_radial = sqrt(max(0, drdt2))
  const vTangential = L / r0;
  const vRadial = Math.sqrt(Math.max(0, drdt2));

  // Construct velocity: tangential component (perpendicular to r in the orbital plane)
  // plus radial component
  const rHat = pos.clone().normalize();
  const tangentDir = new THREE.Vector3().crossVectors(Lvec.normalize(), rHat);

  // Determine if the initial velocity is inward or outward
  const radialSign = velDir.dot(rHat) < 0 ? -1 : 1;

  const vel = tangentDir.multiplyScalar(vTangential)
    .addScaledVector(rHat, radialSign * vRadial);

  const rHorizon = rs;
  const halfRs = 0.5 * rs;
  const threeHalfRs = 1.5 * rs;

  points.push(pos.clone());

  let outcome: GeodesicOutcome = "orbiting";

  // Track radial oscillation to detect bound orbits
  let prevR = r0;
  let radialTurns = 0;
  let increasing = vel.dot(pos.clone().normalize()) > 0;

  // Temporary vectors for RK4
  const tmpPos = new THREE.Vector3();
  const k1v = new THREE.Vector3();
  const k2v = new THREE.Vector3();
  const k3v = new THREE.Vector3();
  const k4v = new THREE.Vector3();

  // Massive particle acceleration: Newtonian + GR correction
  const accel = (p: THREE.Vector3, out: THREE.Vector3) => {
    const r = p.length();
    const r3 = r * r * r;
    const r5 = r3 * r * r;
    // Newtonian: -rs/(2r³) * pos
    // GR correction: -(3/2) * rs * L²/r⁵ * pos
    const factor = -halfRs / r3 - threeHalfRs * L2 / r5;
    out.copy(p).multiplyScalar(factor);
  };

  for (let i = 0; i < MAX_STEPS_MASSIVE; i++) {
    const r = pos.length();

    if (r <= rHorizon * 1.01) {
      outcome = "captured";
      break;
    }
    if (r > MAX_DIST) {
      outcome = "scattered";
      break;
    }

    // Detect radial direction changes (turning points)
    const nowIncreasing = r > prevR;
    if (i > 5 && nowIncreasing !== increasing) {
      radialTurns++;
      increasing = nowIncreasing;
      // After 6 turning points, classify as bound orbit
      if (radialTurns >= 6) {
        outcome = "bound";
        break;
      }
    }
    prevR = r;

    const dt = stepSize;

    // k1
    accel(pos, k1v);

    // k2
    tmpPos.copy(pos).addScaledVector(vel, dt * 0.5);
    accel(tmpPos, k2v);

    // k3
    tmpPos.copy(pos).addScaledVector(vel, dt * 0.5).addScaledVector(k1v, dt * dt * 0.25);
    accel(tmpPos, k3v);

    // k4
    tmpPos.copy(pos).addScaledVector(vel, dt).addScaledVector(k2v, dt * dt * 0.5);
    accel(tmpPos, k4v);

    // Update position
    pos.addScaledVector(vel, dt);

    // Update velocity
    vel.addScaledVector(k1v, dt / 6);
    vel.addScaledVector(k2v, dt / 3);
    vel.addScaledVector(k3v, dt / 3);
    vel.addScaledVector(k4v, dt / 6);

    points.push(pos.clone());
  }

  return { points, outcome, L, particleType: "particle" };
}
