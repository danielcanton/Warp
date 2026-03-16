// ─── Geodesic Integration (Browser wrapper) ────────────────────────────
// Wraps core geodesic functions to use THREE.Vector3 for the 3D scene.

import * as THREE from "three";
import { Vec3 } from "../core/vec3";
import {
  integrateGeodesic as coreIntegrateGeodesic,
  integrateTimelikeGeodesic as coreIntegrateTimelikeGeodesic,
} from "../core/geodesic";

// Re-export types and pure functions
export type { GeodesicOutcome, ParticleType } from "../core/types";
export { timelikeVeff, iscoRadius, circularOrbitEnergy } from "../core/geodesic";

export interface GeodesicResult {
  points: THREE.Vector3[];
  outcome: import("../core/types").GeodesicOutcome;
  L: number;
  particleType: import("../core/types").ParticleType;
}

function toVec3(v: THREE.Vector3): Vec3 {
  return new Vec3(v.x, v.y, v.z);
}

function toTHREEPoints(pts: { x: number; y: number; z: number }[]): THREE.Vector3[] {
  return pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
}

/**
 * Integrate a null geodesic in Schwarzschild spacetime using RK4.
 */
export function integrateGeodesic(
  startPos: THREE.Vector3,
  startVel: THREE.Vector3,
  rs: number,
  stepSize = 0.04,
): GeodesicResult {
  const result = coreIntegrateGeodesic(toVec3(startPos), toVec3(startVel), rs, stepSize);
  return {
    ...result,
    points: toTHREEPoints(result.points),
  };
}

/**
 * Integrate a timelike (massive particle) geodesic in Schwarzschild spacetime.
 */
export function integrateTimelikeGeodesic(
  startPos: THREE.Vector3,
  startVel: THREE.Vector3,
  rs: number,
  energy: number,
  stepSize = 0.03,
): GeodesicResult {
  const result = coreIntegrateTimelikeGeodesic(toVec3(startPos), toVec3(startVel), rs, energy, stepSize);
  return {
    ...result,
    points: toTHREEPoints(result.points),
  };
}
