import { Vector3 } from "three";
import type { CosmologySystem } from "./CosmologySystem";

export interface CosmologyPreset {
  name: string;
  description: string;
  galaxyCount: number;
  clusterRadius: number;
  load: (system: CosmologySystem) => void;
}

/**
 * Generate a spherical cluster of galaxies with the given parameters.
 * Omega values influence mass distribution and velocity scaling to give
 * each preset a visually distinct character.
 */
function loadCluster(
  system: CosmologySystem,
  count: number,
  radius: number,
  opts: { omegaM: number; omegaL: number },
) {
  system.clear();

  // Higher matter density → more massive galaxies, more ellipticals
  const ellipticalFraction = 0.15 + opts.omegaM * 0.2;
  const massScale = 0.5 + opts.omegaM * 1.5;

  // Dark energy influences initial velocity dispersion (expansion-like)
  const velocityScale = 0.2 + opts.omegaL * 0.5;

  for (let i = 0; i < count; i++) {
    const r = radius * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    const z = r * Math.cos(phi);

    const isElliptical = Math.random() < ellipticalFraction;
    const mass = isElliptical
      ? (1.5 + Math.random() * 3.5) * massScale
      : (0.5 + Math.random() * 2.0) * massScale;

    // Velocity: tangential orbital component + radial component from dark energy
    const speed = velocityScale * (0.3 + Math.random() * 0.4);
    const vTheta = Math.random() * Math.PI * 2;
    const vx = speed * Math.cos(vTheta);
    const vz = speed * Math.sin(vTheta);

    // Add outward radial component proportional to dark energy
    const radialSpeed = opts.omegaL * 0.15 * r;
    const rLen = Math.sqrt(x * x + y * y + z * z) || 1;
    const rx = (x / rLen) * radialSpeed;
    const ry = (y / rLen) * radialSpeed;
    const rz = (z / rLen) * radialSpeed;

    system.addGalaxy({
      mass,
      position: new Vector3(x, y, z),
      velocity: new Vector3(vx + rx, ry, vz + rz),
      type: isElliptical ? "elliptical" : "spiral",
    });
  }
}

export const cosmologyPresets: CosmologyPreset[] = [
  {
    name: "Our Universe",
    description: "Ωm=0.3, ΩΛ=0.7 — concordance cosmology",
    galaxyCount: 300,
    clusterRadius: 18,
    load(system) {
      loadCluster(system, this.galaxyCount, this.clusterRadius, {
        omegaM: 0.3,
        omegaL: 0.7,
      });
    },
  },
  {
    name: "No Dark Matter",
    description: "Ωm=0.05, ΩΛ=0.7 — baryons only, galaxies drift apart",
    galaxyCount: 300,
    clusterRadius: 20,
    load(system) {
      loadCluster(system, this.galaxyCount, this.clusterRadius, {
        omegaM: 0.05,
        omegaL: 0.7,
      });
    },
  },
  {
    name: "No Dark Energy",
    description: "Ωm=0.3, ΩΛ=0.0 — gravity dominates, clusters collapse",
    galaxyCount: 300,
    clusterRadius: 16,
    load(system) {
      loadCluster(system, this.galaxyCount, this.clusterRadius, {
        omegaM: 0.3,
        omegaL: 0.0,
      });
    },
  },
  {
    name: "Big Crunch",
    description: "Ωm=2.0, ΩΛ=0.0 — supercritical density, everything collapses",
    galaxyCount: 400,
    clusterRadius: 14,
    load(system) {
      loadCluster(system, this.galaxyCount, this.clusterRadius, {
        omegaM: 2.0,
        omegaL: 0.0,
      });
    },
  },
  {
    name: "Empty Universe",
    description: "Ωm=0.0, ΩΛ=0.0 — no gravity, no expansion, galaxies coast",
    galaxyCount: 200,
    clusterRadius: 22,
    load(system) {
      loadCluster(system, this.galaxyCount, this.clusterRadius, {
        omegaM: 0.0,
        omegaL: 0.0,
      });
    },
  },
];
