// ─── Quasi-Normal Mode (QNM) Computation ────────────────────────────
// Berti fitting coefficients for Kerr QNM frequencies and damping times.
// Reference: Berti, Cardoso & Starinets, CQG 26, 163001 (2009), Table VIII.
//
// ω = f1 + f2 * (1 - a_f)^f3          (frequency in geometric units)
// τ⁻¹ = q1 + q2 * (1 - a_f)^q3        (inverse quality factor)
// Physical frequency: f = ω / (2π M_f)  in natural units → converted to Hz

/** A single QNM mode result */
export interface QNMMode {
  /** Mode indices (l, m, n) */
  l: number;
  m: number;
  n: number;
  /** Oscillation frequency in Hz */
  frequency: number;
  /** Damping time in seconds */
  dampingTime: number;
  /** Quality factor Q = π f τ */
  qualityFactor: number;
  /** Label string e.g. "(2,2,0)" */
  label: string;
}

// Berti fitting coefficients: [f1, f2, f3, q1, q2, q3]
// for ω_lmn = f1 + f2*(1-a_f)^f3  and  Q_lmn = q1 + q2*(1-a_f)^q3
const BERTI_COEFFS: Record<string, [number, number, number, number, number, number]> = {
  "2,2,0": [1.5251, -1.1568, 0.1292, 0.7000, 1.4187, -0.4990],
  "2,2,1": [1.3673, -1.0260, 0.1628, 0.3562, 2.3420, -0.2467],
};

// Physical constants
const MSUN_KG = 1.989e30;
const G = 6.674e-11;
const C = 2.998e8;
const MSUN_SEC = (G * MSUN_KG) / (C * C * C); // ~4.926e-6 s

/**
 * Estimate the final spin of the remnant BH using the Hofmann et al. (2016) fit.
 * Simplified: a_f ≈ √12 η - 3.871 η² + 4.028 η³  (non-spinning limit)
 */
function estimateFinalSpin(m1: number, m2: number, chi1 = 0, chi2 = 0): number {
  const totalMass = m1 + m2;
  const eta = (m1 * m2) / (totalMass * totalMass);
  const chiEff = (m1 * chi1 + m2 * chi2) / totalMass;

  // Rezzolla et al. (2008) non-spinning + leading spin correction
  const aFinal = Math.sqrt(12) * eta - 3.871 * eta * eta + 4.028 * eta * eta * eta
    + chiEff * eta * (2.0 - 1.25 * eta);

  return Math.min(Math.max(aFinal, 0), 0.998);
}

/**
 * Estimate the final mass of the remnant BH.
 * Uses the Healy & Lousto (2017) fit for radiated energy.
 */
function estimateFinalMass(m1: number, m2: number): number {
  const totalMass = m1 + m2;
  const eta = (m1 * m2) / (totalMass * totalMass);
  // Fraction of energy radiated ≈ 0.0559745 η + 0.1469 η²
  const erad = 0.0559745 * eta + 0.1469 * eta * eta;
  return totalMass * (1 - erad);
}

/**
 * Compute QNM modes for a binary black hole merger.
 *
 * @param m1 - Primary mass in solar masses
 * @param m2 - Secondary mass in solar masses
 * @param chi1 - Primary dimensionless spin (default 0)
 * @param chi2 - Secondary dimensionless spin (default 0)
 * @param modes - Which (l,m,n) modes to compute (default: fundamental + first overtone)
 * @returns Array of QNMMode results
 */
export function computeQNMModes(
  m1: number,
  m2: number,
  chi1 = 0,
  chi2 = 0,
  modes: string[] = ["2,2,0", "2,2,1"],
): QNMMode[] {
  const finalMass = estimateFinalMass(m1, m2);
  const finalSpin = estimateFinalSpin(m1, m2, chi1, chi2);

  const mfSec = finalMass * MSUN_SEC; // final mass in seconds

  const results: QNMMode[] = [];

  for (const modeKey of modes) {
    const coeffs = BERTI_COEFFS[modeKey];
    if (!coeffs) continue;

    const [f1, f2, f3, q1, q2, q3] = coeffs;

    // Dimensionless frequency and quality factor
    const omegaHat = f1 + f2 * Math.pow(1 - finalSpin, f3);
    const Q = q1 + q2 * Math.pow(1 - finalSpin, q3);

    // Physical frequency: f = ω / (2π M_f)
    const frequency = omegaHat / (2 * Math.PI * mfSec);

    // Damping time: τ = Q / (π f)
    const dampingTime = Q / (Math.PI * frequency);

    const [l, m, n] = modeKey.split(",").map(Number);

    results.push({
      l, m, n,
      frequency,
      dampingTime,
      qualityFactor: Q,
      label: `(${l},${m},${n})`,
    });
  }

  return results;
}
