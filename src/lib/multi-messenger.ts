/**
 * Multi-messenger metadata for GW events that have electromagnetic counterparts.
 *
 * Currently only GW170817 has confirmed EM counterpart data.
 */

export interface EMCounterpart {
  /** Counterpart designation (e.g. "GRB 170817A") */
  name: string;
  /** Emission type */
  type: "GRB" | "optical" | "X-ray" | "radio" | "kilonova";
  /** Delay after GW trigger in seconds */
  delaySeconds: number;
  /** Observing facility / mission */
  observatory: string;
  /** Brief educational description */
  description: string;
}

export interface MultiMessengerData {
  /** Canonical event name */
  eventName: string;
  /** EM counterpart designation(s) — legacy summary string */
  emCounterpart: string;
  /** Individual EM counterpart records */
  emCounterparts: EMCounterpart[];
  /** Host galaxy name and distance */
  hostGalaxy: string;
  /** Host galaxy distance in Mpc */
  hostGalaxyDistanceMpc: number;
  /** Hubble constant measurement */
  h0Measurement: string;
  /** Ejecta mass estimate */
  ejectaMass: string;
  /** GRB delay after merger */
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
        delaySeconds: 11 * 3600, // ~11 hours
        observatory: "Swope Telescope (Las Campanas)",
        description:
          "The first kilonova observed with a known gravitational-wave source. Its rapid reddening revealed freshly synthesized heavy elements forged by the r-process.",
      },
      {
        name: "CXO J130948.0–233120",
        type: "X-ray",
        delaySeconds: 9 * 86400, // ~9 days
        observatory: "Chandra X-ray Observatory",
        description:
          "X-ray emission appeared days after the merger, produced by the interaction of the relativistic jet with the surrounding interstellar medium.",
      },
      {
        name: "VLA J130948.0–233120",
        type: "radio",
        delaySeconds: 16 * 86400, // ~16 days
        observatory: "Karl G. Jansky VLA",
        description:
          "Radio afterglow from the expanding cocoon of material around the jet, confirming the merger launched a structured relativistic outflow.",
      },
    ],
    hostGalaxy: "NGC 4993, 40 Mpc",
    hostGalaxyDistanceMpc: 40,
    h0Measurement: "70 +12/−8 km/s/Mpc",
    ejectaMass: "~0.05 M☉",
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
