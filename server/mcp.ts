#!/usr/bin/env node
// ─── WarpLab MCP Server ────────────────────────────────────────────────
// Exposes gravitational wave physics tools to AI agents via MCP protocol.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  fetchEventCatalog,
  classifyEvent,
  generateWaveform,
  generateCustomWaveform,
  computeQNMModes,
  computeCharacteristicStrain,
  computeOptimalSNR,
  getALIGOCharacteristicStrain,
  integrateGeodesic,
  integrateTimelikeGeodesic,
  getMultiMessengerData,
  generateParametersJSON,
  generateParametersCSV,
  generateWaveformCSV,
  generateBibTeX,
  generateNotebook,
  generateREADME,
  Vec3,
} from "../src/core/index";
import type { GWEvent } from "../src/core/index";

const server = new McpServer({
  name: "warplab",
  version: "1.0.0",
});

// ─── Catalog cache ──────────────────────────────────────────────────

let catalogCache: GWEvent[] | null = null;
async function getCatalog(): Promise<GWEvent[]> {
  if (!catalogCache) catalogCache = await fetchEventCatalog();
  return catalogCache;
}

function findEvent(catalog: GWEvent[], name: string): GWEvent | undefined {
  const lower = name.toLowerCase();
  return catalog.find((e) => e.commonName.toLowerCase() === lower);
}

// ─── Tools ──────────────────────────────────────────────────────────

server.tool(
  "search_events",
  "Search and filter the gravitational wave event catalog from GWOSC",
  {
    type: z.enum(["BBH", "BNS", "NSBH"]).optional().describe("Filter by event type"),
    mass_min: z.number().optional().describe("Minimum total mass in solar masses"),
    mass_max: z.number().optional().describe("Maximum total mass in solar masses"),
    distance_max: z.number().optional().describe("Maximum luminosity distance in Mpc"),
    snr_min: z.number().optional().describe("Minimum network SNR"),
    catalog: z.string().optional().describe("Filter by catalog (e.g. GWTC-3-confident)"),
    limit: z.number().optional().default(20).describe("Max results (default 20)"),
  },
  async (params) => {
    const catalog = await getCatalog();
    let results = catalog;

    if (params.type) {
      results = results.filter((e) => classifyEvent(e) === params.type);
    }
    if (params.mass_min != null) {
      results = results.filter((e) => e.total_mass_source >= params.mass_min!);
    }
    if (params.mass_max != null) {
      results = results.filter((e) => e.total_mass_source <= params.mass_max!);
    }
    if (params.distance_max != null) {
      results = results.filter((e) => e.luminosity_distance <= params.distance_max!);
    }
    if (params.snr_min != null) {
      results = results.filter((e) => e.network_matched_filter_snr >= params.snr_min!);
    }
    if (params.catalog) {
      const cat = params.catalog.toLowerCase();
      results = results.filter((e) => e.catalog_shortName.toLowerCase().includes(cat));
    }

    const limited = results.slice(0, params.limit);
    const summary = limited.map((e) => ({
      name: e.commonName,
      type: classifyEvent(e),
      m1: e.mass_1_source,
      m2: e.mass_2_source,
      total_mass: e.total_mass_source,
      distance_Mpc: e.luminosity_distance,
      snr: e.network_matched_filter_snr,
      catalog: e.catalog_shortName,
    }));

    return {
      content: [{
        type: "text" as const,
        text: `Found ${results.length} events (showing ${limited.length}):\n\n${JSON.stringify(summary, null, 2)}`,
      }],
    };
  },
);

server.tool(
  "get_event",
  "Get full parameters for a specific gravitational wave event",
  {
    name: z.string().describe("Event name (e.g. GW150914, GW170817)"),
  },
  async (params) => {
    const catalog = await getCatalog();
    const event = findEvent(catalog, params.name);
    if (!event) {
      return { content: [{ type: "text" as const, text: `Event "${params.name}" not found in catalog.` }] };
    }

    const mm = getMultiMessengerData(event.commonName);
    const result: Record<string, unknown> = {
      name: event.commonName,
      type: classifyEvent(event),
      catalog: event.catalog_shortName,
      gps_time: event.GPS,
      mass_1: { value: event.mass_1_source, lower: event.mass_1_source_lower, upper: event.mass_1_source_upper, unit: "M_sun" },
      mass_2: { value: event.mass_2_source, lower: event.mass_2_source_lower, upper: event.mass_2_source_upper, unit: "M_sun" },
      total_mass: event.total_mass_source,
      chirp_mass: { value: event.chirp_mass_source, lower: event.chirp_mass_source_lower, upper: event.chirp_mass_source_upper, unit: "M_sun" },
      final_mass: { value: event.final_mass_source, lower: event.final_mass_source_lower, upper: event.final_mass_source_upper, unit: "M_sun" },
      distance: { value: event.luminosity_distance, lower: event.luminosity_distance_lower, upper: event.luminosity_distance_upper, unit: "Mpc" },
      redshift: event.redshift,
      chi_eff: event.chi_eff,
      snr: event.network_matched_filter_snr,
      false_alarm_rate: event.far,
      p_astro: event.p_astro,
    };

    if (mm) {
      result.multi_messenger = {
        em_counterparts: mm.emCounterparts.map((c) => ({
          name: c.name,
          type: c.type,
          delay_seconds: c.delaySeconds,
          observatory: c.observatory,
        })),
        host_galaxy: mm.hostGalaxy,
        h0_measurement: mm.h0Measurement,
        ejecta_mass: mm.ejectaMass,
      };
    }

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "generate_waveform",
  "Generate a synthetic gravitational waveform (h+ and hx time series)",
  {
    event_name: z.string().optional().describe("Generate waveform for a catalog event"),
    m1: z.number().optional().describe("Primary mass in solar masses (for custom waveform)"),
    m2: z.number().optional().describe("Secondary mass in solar masses (for custom waveform)"),
    chi1: z.number().optional().default(0).describe("Primary spin (-1 to 1)"),
    chi2: z.number().optional().default(0).describe("Secondary spin (-1 to 1)"),
    distance: z.number().optional().default(100).describe("Distance in Mpc"),
    inclination: z.number().optional().default(0).describe("Inclination in radians"),
    format: z.enum(["json", "csv"]).optional().default("json").describe("Output format"),
  },
  async (params) => {
    let waveform;

    if (params.event_name) {
      const catalog = await getCatalog();
      const event = findEvent(catalog, params.event_name);
      if (!event) {
        return { content: [{ type: "text" as const, text: `Event "${params.event_name}" not found.` }] };
      }
      waveform = generateWaveform(event);
    } else if (params.m1 != null && params.m2 != null) {
      waveform = generateCustomWaveform({
        m1: params.m1,
        m2: params.m2,
        chi1: params.chi1 ?? 0,
        chi2: params.chi2 ?? 0,
        distance: params.distance ?? 100,
        inclination: params.inclination ?? 0,
      });
    } else {
      return { content: [{ type: "text" as const, text: "Provide either event_name or m1+m2 for custom waveform." }] };
    }

    if (params.format === "csv") {
      return { content: [{ type: "text" as const, text: generateWaveformCSV(waveform) }] };
    }

    // JSON: return metadata + downsampled arrays for readability
    const step = Math.max(1, Math.floor(waveform.hPlus.length / 200));
    const sampled = {
      event: waveform.eventName,
      sample_rate: waveform.sampleRate,
      duration: waveform.duration,
      peak_index: waveform.peakIndex,
      num_samples: waveform.hPlus.length,
      note: step > 1 ? `Downsampled by ${step}x for display. Use format=csv for full data.` : undefined,
      h_plus: waveform.hPlus.filter((_, i) => i % step === 0).map((v) => +v.toFixed(6)),
      h_cross: waveform.hCross.filter((_, i) => i % step === 0).map((v) => +v.toFixed(6)),
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(sampled, null, 2) }] };
  },
);

server.tool(
  "compute_qnm",
  "Compute quasi-normal mode frequencies for a black hole merger remnant",
  {
    m1: z.number().describe("Primary mass in solar masses"),
    m2: z.number().describe("Secondary mass in solar masses"),
    chi1: z.number().optional().default(0).describe("Primary spin"),
    chi2: z.number().optional().default(0).describe("Secondary spin"),
    modes: z.array(z.string()).optional().default(["2,2,0", "2,2,1"]).describe("QNM modes to compute (e.g. ['2,2,0'])"),
  },
  async (params) => {
    const results = computeQNMModes(params.m1, params.m2, params.chi1, params.chi2, params.modes);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          input: { m1: params.m1, m2: params.m2, chi1: params.chi1, chi2: params.chi2 },
          modes: results.map((m) => ({
            mode: m.label,
            frequency_Hz: +m.frequency.toFixed(2),
            damping_time_ms: +(m.dampingTime * 1000).toFixed(3),
            quality_factor: +m.qualityFactor.toFixed(2),
          })),
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "compute_snr",
  "Compute optimal matched-filter SNR against aLIGO design sensitivity",
  {
    event_name: z.string().optional().describe("Compute SNR for a catalog event"),
    m1: z.number().optional().describe("Primary mass (for custom)"),
    m2: z.number().optional().describe("Secondary mass (for custom)"),
    distance: z.number().optional().default(100).describe("Distance in Mpc (for custom)"),
  },
  async (params) => {
    let waveform;

    if (params.event_name) {
      const catalog = await getCatalog();
      const event = findEvent(catalog, params.event_name);
      if (!event) {
        return { content: [{ type: "text" as const, text: `Event "${params.event_name}" not found.` }] };
      }
      waveform = generateWaveform(event);
    } else if (params.m1 != null && params.m2 != null) {
      waveform = generateCustomWaveform({
        m1: params.m1,
        m2: params.m2,
        chi1: 0,
        chi2: 0,
        distance: params.distance ?? 100,
        inclination: 0,
      });
    } else {
      return { content: [{ type: "text" as const, text: "Provide event_name or m1+m2." }] };
    }

    const strain = computeCharacteristicStrain(waveform);
    const snr = computeOptimalSNR(strain);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          event: waveform.eventName,
          optimal_snr: +snr.toFixed(2),
          note: "SNR computed against aLIGO O4 design sensitivity (10-5000 Hz band)",
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "get_population_stats",
  "Get population statistics from the gravitational wave catalog",
  {
    stat: z.enum(["mass", "chirp_mass", "spin", "distance", "type_counts"]).describe("Which statistic to compute"),
  },
  async (params) => {
    const catalog = await getCatalog();

    if (params.stat === "type_counts") {
      const counts = { BBH: 0, BNS: 0, NSBH: 0 };
      for (const e of catalog) {
        const t = classifyEvent(e) as keyof typeof counts;
        if (t in counts) counts[t]++;
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ total: catalog.length, ...counts }, null, 2) }] };
    }

    if (params.stat === "mass") {
      const masses = catalog.map((e) => ({ name: e.commonName, m1: e.mass_1_source, m2: e.mass_2_source, total: e.total_mass_source }));
      const totalMasses = masses.map((m) => m.total).filter((m) => m > 0);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            count: totalMasses.length,
            min_total_mass: +Math.min(...totalMasses).toFixed(1),
            max_total_mass: +Math.max(...totalMasses).toFixed(1),
            median_total_mass: +totalMasses.sort((a, b) => a - b)[Math.floor(totalMasses.length / 2)].toFixed(1),
            heaviest_events: masses.sort((a, b) => b.total - a.total).slice(0, 5),
          }, null, 2),
        }],
      };
    }

    if (params.stat === "chirp_mass") {
      const mc = catalog.map((e) => e.chirp_mass_source).filter((m) => m > 0);
      mc.sort((a, b) => a - b);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            count: mc.length,
            min: +mc[0].toFixed(2),
            max: +mc[mc.length - 1].toFixed(2),
            median: +mc[Math.floor(mc.length / 2)].toFixed(2),
            p10: +mc[Math.floor(mc.length * 0.1)].toFixed(2),
            p90: +mc[Math.floor(mc.length * 0.9)].toFixed(2),
          }, null, 2),
        }],
      };
    }

    if (params.stat === "spin") {
      const spins = catalog.map((e) => e.chi_eff).filter((s) => s !== 0 || true);
      spins.sort((a, b) => a - b);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            count: spins.length,
            min_chi_eff: +spins[0].toFixed(3),
            max_chi_eff: +spins[spins.length - 1].toFixed(3),
            median_chi_eff: +spins[Math.floor(spins.length / 2)].toFixed(3),
            note: "chi_eff is the mass-weighted effective spin parameter",
          }, null, 2),
        }],
      };
    }

    if (params.stat === "distance") {
      const dists = catalog.map((e) => e.luminosity_distance).filter((d) => d > 0);
      dists.sort((a, b) => a - b);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            count: dists.length,
            min_Mpc: +dists[0].toFixed(0),
            max_Mpc: +dists[dists.length - 1].toFixed(0),
            median_Mpc: +dists[Math.floor(dists.length / 2)].toFixed(0),
            nearest_events: catalog.filter((e) => e.luminosity_distance > 0)
              .sort((a, b) => a.luminosity_distance - b.luminosity_distance)
              .slice(0, 5)
              .map((e) => ({ name: e.commonName, distance_Mpc: e.luminosity_distance })),
          }, null, 2),
        }],
      };
    }

    return { content: [{ type: "text" as const, text: "Unknown stat type." }] };
  },
);

server.tool(
  "integrate_geodesic",
  "Trace a photon or particle geodesic around a Schwarzschild black hole",
  {
    start_r: z.number().describe("Starting radial distance (in units of Schwarzschild radius)"),
    start_angle: z.number().optional().default(0).describe("Starting angle in radians"),
    velocity_angle: z.number().optional().default(Math.PI / 2).describe("Initial velocity direction angle"),
    schwarzschild_radius: z.number().optional().default(2).describe("Schwarzschild radius"),
    particle_type: z.enum(["photon", "particle"]).optional().default("photon"),
    energy: z.number().optional().default(1.0).describe("Specific energy for massive particles"),
    max_points: z.number().optional().default(200).describe("Max output points"),
  },
  async (params) => {
    const rs = params.schwarzschild_radius ?? 2;
    const r0 = params.start_r * rs;
    const angle = params.start_angle ?? 0;

    const startPos = new Vec3(r0 * Math.cos(angle), 0, r0 * Math.sin(angle));
    const va = params.velocity_angle ?? Math.PI / 2;
    const startVel = new Vec3(Math.cos(va), 0, Math.sin(va));

    let result;
    if (params.particle_type === "particle") {
      result = integrateTimelikeGeodesic(startPos, startVel, rs, params.energy ?? 1.0);
    } else {
      result = integrateGeodesic(startPos, startVel, rs);
    }

    // Downsample points
    const step = Math.max(1, Math.floor(result.points.length / (params.max_points ?? 200)));
    const points = result.points
      .filter((_, i) => i % step === 0)
      .map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          outcome: result.outcome,
          angular_momentum: +result.L.toFixed(4),
          particle_type: result.particleType,
          num_points: result.points.length,
          points_shown: points.length,
          trajectory: points,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "export_event",
  "Generate event data in various formats (JSON, CSV, BibTeX, Jupyter notebook)",
  {
    event_name: z.string().describe("Event name"),
    format: z.enum(["json", "csv", "bibtex", "notebook", "readme", "waveform_csv"]).describe("Export format"),
  },
  async (params) => {
    const catalog = await getCatalog();
    const event = findEvent(catalog, params.event_name);
    if (!event) {
      return { content: [{ type: "text" as const, text: `Event "${params.event_name}" not found.` }] };
    }

    let output: string;
    switch (params.format) {
      case "json": output = generateParametersJSON(event); break;
      case "csv": output = generateParametersCSV(event); break;
      case "bibtex": output = generateBibTeX(event); break;
      case "notebook": output = generateNotebook(event); break;
      case "readme": output = generateREADME(event); break;
      case "waveform_csv": {
        const wf = generateWaveform(event);
        output = generateWaveformCSV(wf);
        break;
      }
    }

    return { content: [{ type: "text" as const, text: output }] };
  },
);

// ─── Start server ───────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
