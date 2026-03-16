// ─── Geodesic Integration in Schwarzschild Spacetime ────────────────────
// RK4 integrator for null and timelike geodesics.
// Uses lightweight Vec3 instead of THREE.Vector3.

import { Vec3 } from "./vec3";
import type { GeodesicOutcome, GeodesicResult } from "./types";

const MAX_STEPS = 5000;
const MAX_STEPS_MASSIVE = 20000;
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
 * Find the ISCO radius for a given rs.
 * For Schwarzschild: r_isco = 3 * rs (= 6M since rs = 2M)
 */
export function iscoRadius(rs: number): number {
  return 3 * rs;
}

/**
 * Compute the energy of a circular orbit at radius r.
 */
export function circularOrbitEnergy(r: number, rs: number, L: number): number {
  return timelikeVeff(r, rs, L);
}

/**
 * Integrate a null geodesic (photon) in Schwarzschild spacetime using RK4.
 */
export function integrateGeodesic(
  startPos: Vec3,
  startVel: Vec3,
  rs: number,
  stepSize = 0.04,
): GeodesicResult {
  const points: { x: number; y: number; z: number }[] = [];

  const vel = startVel.clone().normalize();
  const pos = startPos.clone();

  const Lvec = new Vec3().crossVectors(pos, vel);
  const L2 = Lvec.lengthSq;

  const rHorizon = rs;
  const halfRs = 1.5 * rs;

  points.push({ x: pos.x, y: pos.y, z: pos.z });

  let outcome: GeodesicOutcome = "orbiting";

  const tmpPos = new Vec3();
  const k1v = new Vec3();
  const k2v = new Vec3();
  const k3v = new Vec3();
  const k4v = new Vec3();

  for (let i = 0; i < MAX_STEPS; i++) {
    const r = pos.length;

    if (r <= rHorizon * 1.01) {
      outcome = "captured";
      break;
    }
    if (r > MAX_DIST) {
      outcome = "scattered";
      break;
    }

    const accel = (r5: number, p: Vec3, out: Vec3) => {
      const factor = -halfRs * L2 / r5;
      out.copy(p).multiplyScalar(factor);
    };

    const dt = stepSize;

    const r1 = pos.length;
    const r1_5 = r1 * r1 * r1 * r1 * r1;
    accel(r1_5, pos, k1v);

    tmpPos.copy(pos).addScaledVector(vel, dt * 0.5);
    const r2 = tmpPos.length;
    const r2_5 = r2 * r2 * r2 * r2 * r2;
    accel(r2_5, tmpPos, k2v);

    tmpPos.copy(pos).addScaledVector(vel, dt * 0.5).addScaledVector(k1v, dt * dt * 0.25);
    const r3 = tmpPos.length;
    const r3_5 = r3 * r3 * r3 * r3 * r3;
    accel(r3_5, tmpPos, k3v);

    tmpPos.copy(pos).addScaledVector(vel, dt).addScaledVector(k2v, dt * dt * 0.5);
    const r4 = tmpPos.length;
    const r4_5 = r4 * r4 * r4 * r4 * r4;
    accel(r4_5, tmpPos, k4v);

    pos.addScaledVector(vel, dt);

    vel.addScaledVector(k1v, dt / 6);
    vel.addScaledVector(k2v, dt / 3);
    vel.addScaledVector(k3v, dt / 3);
    vel.addScaledVector(k4v, dt / 6);

    points.push({ x: pos.x, y: pos.y, z: pos.z });
  }

  return { points, outcome, L: Math.sqrt(L2), particleType: "photon" };
}

/**
 * Integrate a timelike (massive particle) geodesic in Schwarzschild spacetime.
 */
export function integrateTimelikeGeodesic(
  startPos: Vec3,
  startVel: Vec3,
  rs: number,
  energy: number,
  stepSize = 0.03,
): GeodesicResult {
  const points: { x: number; y: number; z: number }[] = [];

  const pos = startPos.clone();
  const r0 = pos.length;

  const velDir = startVel.clone().normalize();
  const Lvec = new Vec3().crossVectors(pos, velDir);
  const L = Lvec.length;
  const L2 = L * L;

  const veff0 = timelikeVeff(r0, rs, L);
  const drdt2 = energy - veff0;

  const vTangential = L / r0;
  const vRadial = Math.sqrt(Math.max(0, drdt2));

  const rHat = pos.clone().normalize();
  const tangentDir = new Vec3().crossVectors(Lvec.clone().normalize(), rHat);

  const radialSign = velDir.dot(rHat) < 0 ? -1 : 1;

  const vel = tangentDir.multiplyScalar(vTangential)
    .addScaledVector(rHat, radialSign * vRadial);

  const rHorizon = rs;
  const halfRs = 0.5 * rs;
  const threeHalfRs = 1.5 * rs;

  points.push({ x: pos.x, y: pos.y, z: pos.z });

  let outcome: GeodesicOutcome = "orbiting";
  let prevR = r0;
  let radialTurns = 0;
  let increasing = vel.dot(pos.clone().normalize()) > 0;

  const tmpPos = new Vec3();
  const k1v = new Vec3();
  const k2v = new Vec3();
  const k3v = new Vec3();
  const k4v = new Vec3();

  const accel = (p: Vec3, out: Vec3) => {
    const r = p.length;
    const r3 = r * r * r;
    const r5 = r3 * r * r;
    const factor = -halfRs / r3 - threeHalfRs * L2 / r5;
    out.copy(p).multiplyScalar(factor);
  };

  for (let i = 0; i < MAX_STEPS_MASSIVE; i++) {
    const r = pos.length;

    if (r <= rHorizon * 1.01) {
      outcome = "captured";
      break;
    }
    if (r > MAX_DIST) {
      outcome = "scattered";
      break;
    }

    const nowIncreasing = r > prevR;
    if (i > 5 && nowIncreasing !== increasing) {
      radialTurns++;
      increasing = nowIncreasing;
      if (radialTurns >= 6) {
        outcome = "bound";
        break;
      }
    }
    prevR = r;

    const dt = stepSize;

    accel(pos, k1v);

    tmpPos.copy(pos).addScaledVector(vel, dt * 0.5);
    accel(tmpPos, k2v);

    tmpPos.copy(pos).addScaledVector(vel, dt * 0.5).addScaledVector(k1v, dt * dt * 0.25);
    accel(tmpPos, k3v);

    tmpPos.copy(pos).addScaledVector(vel, dt).addScaledVector(k2v, dt * dt * 0.5);
    accel(tmpPos, k4v);

    pos.addScaledVector(vel, dt);

    vel.addScaledVector(k1v, dt / 6);
    vel.addScaledVector(k2v, dt / 3);
    vel.addScaledVector(k3v, dt / 3);
    vel.addScaledVector(k4v, dt / 6);

    points.push({ x: pos.x, y: pos.y, z: pos.z });
  }

  return { points, outcome, L, particleType: "particle" };
}
