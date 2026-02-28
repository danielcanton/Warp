import { Vector3, Color } from "three";
import type { NBodySystem } from "./NBodySystem";

export interface Preset {
  name: string;
  description: string;
  load: (system: NBodySystem) => void;
}

export const presets: Preset[] = [
  {
    name: "Binary Star",
    description: "Two equal-mass stars in mutual orbit",
    load(system) {
      system.clear();
      const sep = 3;
      // Circular orbit velocity: v = sqrt(G*M/(4*r)) for equal masses
      const v = Math.sqrt(1.0 / (4 * (sep / 2)));
      system.addBody({
        mass: 1, position: new Vector3(sep / 2, 0, 0),
        velocity: new Vector3(0, 0, v), type: "star",
        color: new Color(0xffcc44),
      });
      system.addBody({
        mass: 1, position: new Vector3(-sep / 2, 0, 0),
        velocity: new Vector3(0, 0, -v), type: "star",
        color: new Color(0xff6644),
      });
    },
  },
  {
    name: "Solar System",
    description: "Central star with 3 orbiting planets",
    load(system) {
      system.clear();
      // Fixed central star
      system.addBody({
        mass: 10, position: new Vector3(0, 0, 0),
        type: "star", color: new Color(0xffdd33), fixed: true,
      });
      // Planets at increasing distances with circular velocity v = sqrt(G*M/r)
      const planets = [
        { r: 3, mass: 0.01, color: 0x4488ff },
        { r: 5, mass: 0.05, color: 0x44cc88 },
        { r: 8, mass: 0.02, color: 0xcc8844 },
      ];
      for (const p of planets) {
        const v = Math.sqrt(10 / p.r); // v = sqrt(G*M_star/r)
        system.addBody({
          mass: p.mass, position: new Vector3(p.r, 0, 0),
          velocity: new Vector3(0, 0, v), type: "planet",
          color: new Color(p.color),
        });
      }
    },
  },
  {
    name: "Figure-8 Three-Body",
    description: "Chenciner-Montgomery stable solution",
    load(system) {
      system.clear();
      // Exact initial conditions for the figure-8 solution
      // Positions on the figure-8 at t=0
      const x1 = 0.97000436;
      const y1 = -0.24308753;
      // Velocity of body 3
      const vx3 = -0.93240737;
      const vy3 = -0.86473146;

      system.addBody({
        mass: 1, position: new Vector3(x1, 0, y1),
        velocity: new Vector3(-vx3 / 2, 0, -vy3 / 2), type: "star",
        color: new Color(0xff6666),
      });
      system.addBody({
        mass: 1, position: new Vector3(-x1, 0, -y1),
        velocity: new Vector3(-vx3 / 2, 0, -vy3 / 2), type: "star",
        color: new Color(0x6666ff),
      });
      system.addBody({
        mass: 1, position: new Vector3(0, 0, 0),
        velocity: new Vector3(vx3, 0, vy3), type: "star",
        color: new Color(0x66ff66),
      });
    },
  },
  {
    name: "Black Hole + Stars",
    description: "Massive black hole with orbiting stars",
    load(system) {
      system.clear();
      system.addBody({
        mass: 20, position: new Vector3(0, 0, 0),
        type: "blackhole", fixed: true,
      });
      const stars = [
        { r: 4, mass: 0.5, color: 0xffaa33, angle: 0 },
        { r: 6, mass: 0.3, color: 0x33aaff, angle: Math.PI * 0.6 },
        { r: 8, mass: 0.8, color: 0xff5577, angle: Math.PI * 1.2 },
      ];
      for (const s of stars) {
        const v = Math.sqrt(20 / s.r);
        const px = s.r * Math.cos(s.angle);
        const pz = s.r * Math.sin(s.angle);
        const vx = -v * Math.sin(s.angle);
        const vz = v * Math.cos(s.angle);
        system.addBody({
          mass: s.mass, position: new Vector3(px, 0, pz),
          velocity: new Vector3(vx, 0, vz), type: "star",
          color: new Color(s.color),
        });
      }
      // One planet
      const r = 3;
      const v = Math.sqrt(20 / r);
      system.addBody({
        mass: 0.01, position: new Vector3(0, 0, r),
        velocity: new Vector3(v, 0, 0), type: "planet",
        color: new Color(0x88ccee),
      });
    },
  },
  {
    name: "Random Cluster",
    description: "8-12 random bodies — chaos guaranteed",
    load(system) {
      system.clear();
      const count = 8 + Math.floor(Math.random() * 5);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 6;
        const mass = 0.1 + Math.random() * 2;
        const isBlackHole = Math.random() < 0.1;
        const isStar = !isBlackHole && mass > 0.8;
        const type = isBlackHole ? "blackhole" as const : isStar ? "star" as const : "planet" as const;

        // Give a tangential velocity for somewhat circular orbits
        const speed = 0.3 + Math.random() * 0.7;
        const px = r * Math.cos(angle);
        const pz = r * Math.sin(angle);

        system.addBody({
          mass: isBlackHole ? mass * 5 : mass,
          position: new Vector3(px, 0, pz),
          velocity: new Vector3(-speed * Math.sin(angle), 0, speed * Math.cos(angle)),
          type,
          color: new Color().setHSL(Math.random(), 0.7, 0.6),
        });
      }
    },
  },
];
