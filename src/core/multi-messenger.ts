// ─── Multi-Messenger Data ───────────────────────────────────────────────
// EM counterpart metadata for GW events with electromagnetic counterparts.

export interface EMCounterpart {
  name: string;
  type: "GRB" | "optical" | "X-ray" | "radio" | "kilonova";
  delaySeconds: number;
  observatory: string;
  description: string;
}

export interface MultiMessengerData {
  eventName: string;
  emCounterpart: string;
  emCounterparts: EMCounterpart[];
  hostGalaxy: string;
  hostGalaxyDistanceMpc: number;
  h0Measurement: string;
  ejectaMass: string;
  grbDelay: string;
}

const MM_DATA: Record<string, MultiMessengerData> = {
  GW170817: {
    eventName: "GW170817",
    emCounterpart: "GRB 170817A / AT 2017gfo (kilonova)",
    emCounterparts: [
      {
        name: "GRB 170817A",
        type: "GRB",
        delaySeconds: 1.7,
        observatory: "Fermi GBM / INTEGRAL SPI-ACS",
        description:
          "A short gamma-ray burst detected just 1.7 seconds after the gravitational wave signal, confirming the long-theorized link between neutron star mergers and short GRBs.",
      },
      {
        name: "AT 2017gfo",
        type: "kilonova",
        delaySeconds: 11 * 3600,
        observatory: "Swope Telescope (Las Campanas)",
        description:
          "The first kilonova observed with a known gravitational-wave source. Its rapid reddening revealed freshly synthesized heavy elements forged by the r-process.",
      },
      {
        name: "CXO J130948.0\u2013233120",
        type: "X-ray",
        delaySeconds: 9 * 86400,
        observatory: "Chandra X-ray Observatory",
        description:
          "X-ray emission appeared days after the merger, produced by the interaction of the relativistic jet with the surrounding interstellar medium.",
      },
      {
        name: "VLA J130948.0\u2013233120",
        type: "radio",
        delaySeconds: 16 * 86400,
        observatory: "Karl G. Jansky VLA",
        description:
          "Radio afterglow from the expanding cocoon of material around the jet, confirming the merger launched a structured relativistic outflow.",
      },
    ],
    hostGalaxy: "NGC 4993, 40 Mpc",
    hostGalaxyDistanceMpc: 40,
    h0Measurement: "70 +12/\u22128 km/s/Mpc",
    ejectaMass: "~0.05 M\u2609",
    grbDelay: "1.7 s",
  },
};

/**
 * Look up multi-messenger data for a given event common name.
 * Returns null if no EM counterpart data exists.
 */
export function getMultiMessengerData(
  commonName: string,
): MultiMessengerData | null {
  return MM_DATA[commonName] ?? null;
}
