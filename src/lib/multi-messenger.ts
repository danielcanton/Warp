/**
 * Multi-messenger metadata for GW events that have electromagnetic counterparts.
 *
 * Currently only GW170817 has confirmed EM counterpart data.
 */

export interface MultiMessengerData {
  /** EM counterpart designation(s) */
  emCounterpart: string;
  /** Host galaxy name and distance */
  hostGalaxy: string;
  /** Researcher-only: Hubble constant measurement */
  h0?: string;
  /** Researcher-only: Ejecta mass estimate */
  ejectaMass?: string;
  /** Researcher-only: GRB delay after merger */
  grbDelay?: string;
}

const MM_DATA: Record<string, MultiMessengerData> = {
  GW170817: {
    emCounterpart: "GRB 170817A / AT 2017gfo (kilonova)",
    hostGalaxy: "NGC 4993, 40 Mpc",
    h0: "70 +12/−8 km/s/Mpc",
    ejectaMass: "~0.05 M☉",
    grbDelay: "1.7 s",
  },
};

/**
 * Look up multi-messenger data for a given event common name.
 * Returns undefined if no EM counterpart data exists.
 */
export function getMultiMessengerData(
  commonName: string,
): MultiMessengerData | undefined {
  return MM_DATA[commonName];
}
