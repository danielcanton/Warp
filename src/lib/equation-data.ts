// ─── Physics Equation Definitions ──────────────────────────────────
// Pure data — no DOM or rendering logic. Each scene pulls its equations
// and the equations module renders them with KaTeX.

import type { ViewMode } from "./view-mode";

export interface EquationDef {
  id: string;
  latex: string;
  label: string;
  modes: Exclude<ViewMode, "explorer">[];
  /** Given current parameters, return a computed value string (e.g., "28.3 M☉") */
  compute?: (p: Record<string, number>) => string;
}

// ─── Merger / Sandbox ────────────────────────────────────────────────

export const mergerEquations: EquationDef[] = [
  {
    id: "chirp-mass",
    latex: String.raw`\mathcal{M}_c = \frac{(m_1 \cdot m_2)^{3/5}}{(m_1 + m_2)^{1/5}}`,
    label: "One number determines the entire waveform",
    modes: ["student", "researcher"],
    compute: (p) => {
      const mc = Math.pow(p.m1 * p.m2, 3 / 5) / Math.pow(p.m1 + p.m2, 1 / 5);
      return `${mc.toFixed(1)} M☉`;
    },
  },
  {
    id: "freq-evolution",
    latex: String.raw`\frac{df}{dt} \propto \mathcal{M}_c^{5/3}\, f^{11/3}`,
    label: "Why the chirp sweeps up",
    modes: ["student", "researcher"],
  },
  {
    id: "strain",
    latex: String.raw`h \propto \frac{\mathcal{M}_c^{5/3}\, f^{2/3}}{d}`,
    label: "Connects mass + distance to LIGO signal",
    modes: ["researcher"],
    compute: (p) => {
      if (!p.distance) return "";
      const mc = Math.pow(p.m1 * p.m2, 3 / 5) / Math.pow(p.m1 + p.m2, 1 / 5);
      return `M_c = ${mc.toFixed(1)} M☉, d = ${p.distance.toFixed(0)} Mpc`;
    },
  },
  {
    id: "energy",
    latex: String.raw`E_{\text{rad}} = (m_1 + m_2 - m_f)\,c^2`,
    label: "How much mass became waves",
    modes: ["researcher"],
    compute: (p) => {
      if (!p.finalMass) return "";
      const radiated = p.m1 + p.m2 - p.finalMass;
      return radiated > 0 ? `${radiated.toFixed(1)} M☉ radiated` : "";
    },
  },
  {
    id: "peak-luminosity",
    latex: String.raw`L_{\text{peak}} \sim \frac{c^5}{G} \approx 3.6 \times 10^{52}\;\text{W}`,
    label: "Briefly outshines the observable universe",
    modes: ["researcher"],
  },
];

// ─── Black Hole ──────────────────────────────────────────────────────

export const blackholeEquations: EquationDef[] = [
  {
    id: "schwarzschild",
    latex: String.raw`r_s = \frac{2GM}{c^2}`,
    label: "The event horizon you see",
    modes: ["student", "researcher"],
    compute: (p) => {
      // rs in km: 2 * G * M_sun * mass / c^2 ≈ 2.95 km per solar mass
      const rs_km = 2.95 * p.mass;
      return `r_s = ${rs_km.toFixed(1)} km`;
    },
  },
  {
    id: "photon-sphere",
    latex: String.raw`r_{\text{ph}} = \frac{3}{2}\,r_s`,
    label: "The bright ring of light",
    modes: ["student", "researcher"],
    compute: (p) => {
      const rph_km = 1.5 * 2.95 * p.mass;
      return `r_ph = ${rph_km.toFixed(1)} km`;
    },
  },
  {
    id: "isco",
    latex: String.raw`r_{\text{isco}} = 3\,r_s`,
    label: "Where the accretion disk truncates",
    modes: ["researcher"],
    compute: (p) => {
      const risco_km = 3 * 2.95 * p.mass;
      return `r_isco = ${risco_km.toFixed(0)} km`;
    },
  },
  {
    id: "lensing",
    latex: String.raw`\Delta\varphi = \frac{4GM}{c^2 b}`,
    label: "Why the background bends",
    modes: ["researcher"],
  },
];

// ─── Cosmology ──────────────────────────────────────────────────────

export const cosmologyEquations: EquationDef[] = [
  {
    id: "friedmann",
    latex: String.raw`H^2 = \frac{8\pi G}{3}\,\rho - \frac{k\,c^2}{a^2} + \frac{\Lambda\,c^2}{3}`,
    label: "How the universe expands",
    modes: ["student", "researcher"],
    compute: (p) => {
      const H0 = p.H0 ?? 67.4;
      return `H₀ = ${H0.toFixed(1)} km/s/Mpc`;
    },
  },
  {
    id: "critical-density",
    latex: String.raw`\rho_c = \frac{3\,H_0^2}{8\pi G}`,
    label: "The density that makes the universe flat",
    modes: ["student", "researcher"],
    compute: (p) => {
      const H0 = p.H0 ?? 67.4;
      // ρ_c ≈ 1.878 × 10^-29 × h^2 g/cm³, where h = H0/100
      const h = H0 / 100;
      const rho = 1.878e-29 * h * h;
      return `ρ_c ≈ ${rho.toExponential(2)} g/cm³`;
    },
  },
  {
    id: "deceleration",
    latex: String.raw`q_0 = \frac{\Omega_m}{2} - \Omega_\Lambda`,
    label: "Is expansion speeding up or slowing down?",
    modes: ["student", "researcher"],
    compute: (p) => {
      const Om = p.Omega_m ?? 0.315;
      const OL = p.Omega_Lambda ?? 0.685;
      const q = Om / 2 - OL;
      return `q₀ = ${q.toFixed(3)}${q < 0 ? " (accelerating)" : " (decelerating)"}`;
    },
  },
  {
    id: "fluid",
    latex: String.raw`\dot{\rho} + 3\,H\!\left(\rho + \frac{p}{c^2}\right) = 0`,
    label: "How energy density dilutes with expansion",
    modes: ["researcher"],
  },
  {
    id: "equation-of-state",
    latex: String.raw`p = w\,\rho\,c^2 \quad (w_m = 0,\; w_r = \tfrac{1}{3},\; w_\Lambda = -1)`,
    label: "Each component dilutes differently",
    modes: ["researcher"],
  },
];

// ─── N-Body ──────────────────────────────────────────────────────────

export const nbodyEquations: EquationDef[] = [
  {
    id: "gravity-pe",
    latex: String.raw`U = -\frac{G\,m_1\,m_2}{r}`,
    label: "The force pulling bodies together",
    modes: ["student", "researcher"],
  },
  {
    id: "virial",
    latex: String.raw`2K + U = 0`,
    label: "Why bound systems settle",
    modes: ["researcher"],
  },
  {
    id: "escape-velocity",
    latex: String.raw`v_{\text{esc}} = \sqrt{\frac{2GM}{r}}`,
    label: "Speed needed to leave",
    modes: ["researcher"],
  },
];
