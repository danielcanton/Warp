#!/usr/bin/env node
// ─── WarpLab CLI ────────────────────────────────────────────────────────
// Command-line access to gravitational wave physics tools.

import {
  fetchEventCatalog,
  classifyEvent,
  generateWaveform,
  generateCustomWaveform,
  computeQNMModes,
  computeCharacteristicStrain,
  computeOptimalSNR,
  generateParametersJSON,
  generateParametersCSV,
  generateWaveformCSV,
  generateBibTeX,
  generateNotebook,
  generateREADME,
} from "../src/core/index";
import type { GWEvent } from "../src/core/index";

const args = process.argv.slice(2);
const command = args[0];

function flag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

let catalogCache: GWEvent[] | null = null;
async function getCatalog(): Promise<GWEvent[]> {
  if (!catalogCache) {
    process.stderr.write("Fetching catalog from GWOSC...\n");
    catalogCache = await fetchEventCatalog();
    process.stderr.write(`Loaded ${catalogCache.length} events.\n`);
  }
  return catalogCache;
}

function findEvent(catalog: GWEvent[], name: string): GWEvent | undefined {
  const lower = name.toLowerCase();
  return catalog.find((e) => e.commonName.toLowerCase() === lower);
}

function printJSON(obj: unknown): void {
  console.log(JSON.stringify(obj, null, 2));
}

async function main() {
  if (!command || command === "help" || command === "--help") {
    console.log(`WarpLab CLI — Gravitational Wave Physics Tools

Usage: warplab <command> [options]

Commands:
  search    Search events [--type BBH|BNS|NSBH] [--mass-min N] [--mass-max N] [--snr-min N] [--limit N]
  info      Get event details <event-name>
  waveform  Generate waveform <event-name> | --m1 N --m2 N [--format json|csv]
  qnm       Compute QNM frequencies <event-name> | --m1 N --m2 N
  snr       Compute optimal SNR <event-name> | --m1 N --m2 N
  export    Export event data <event-name> [--format json|csv|bibtex|notebook|readme|waveform]
  stats     Population statistics [--stat mass|chirp_mass|spin|distance|type_counts]
  help      Show this help
`);
    return;
  }

  if (command === "search") {
    const catalog = await getCatalog();
    let results = catalog;

    const type = flag("type");
    if (type) results = results.filter((e) => classifyEvent(e) === type);

    const massMin = flag("mass-min");
    if (massMin) results = results.filter((e) => e.total_mass_source >= +massMin);

    const massMax = flag("mass-max");
    if (massMax) results = results.filter((e) => e.total_mass_source <= +massMax);

    const snrMin = flag("snr-min");
    if (snrMin) results = results.filter((e) => e.network_matched_filter_snr >= +snrMin);

    const limit = +(flag("limit") ?? "20");
    const limited = results.slice(0, limit);

    if (hasFlag("table")) {
      console.log("Name              Type  m1      m2      Dist(Mpc)  SNR");
      console.log("─".repeat(65));
      for (const e of limited) {
        console.log(
          `${e.commonName.padEnd(18)}${classifyEvent(e).padEnd(6)}${e.mass_1_source.toFixed(1).padStart(6)}  ${e.mass_2_source.toFixed(1).padStart(6)}  ${e.luminosity_distance.toFixed(0).padStart(9)}  ${e.network_matched_filter_snr.toFixed(1).padStart(5)}`,
        );
      }
      console.log(`\n${results.length} total, ${limited.length} shown`);
    } else {
      printJSON(limited.map((e) => ({
        name: e.commonName,
        type: classifyEvent(e),
        m1: e.mass_1_source,
        m2: e.mass_2_source,
        distance_Mpc: e.luminosity_distance,
        snr: e.network_matched_filter_snr,
      })));
    }
    return;
  }

  if (command === "info") {
    const name = args[1];
    if (!name) { console.error("Usage: warplab info <event-name>"); process.exit(1); }
    const catalog = await getCatalog();
    const event = findEvent(catalog, name);
    if (!event) { console.error(`Event "${name}" not found.`); process.exit(1); }
    printJSON({
      name: event.commonName,
      type: classifyEvent(event),
      catalog: event.catalog_shortName,
      m1: event.mass_1_source,
      m2: event.mass_2_source,
      total_mass: event.total_mass_source,
      chirp_mass: event.chirp_mass_source,
      final_mass: event.final_mass_source,
      distance_Mpc: event.luminosity_distance,
      redshift: event.redshift,
      chi_eff: event.chi_eff,
      snr: event.network_matched_filter_snr,
      p_astro: event.p_astro,
    });
    return;
  }

  if (command === "waveform") {
    const format = flag("format") ?? "json";
    let waveform;

    if (args[1] && !args[1].startsWith("--")) {
      const catalog = await getCatalog();
      const event = findEvent(catalog, args[1]);
      if (!event) { console.error(`Event "${args[1]}" not found.`); process.exit(1); }
      waveform = generateWaveform(event);
    } else {
      const m1 = flag("m1");
      const m2 = flag("m2");
      if (!m1 || !m2) { console.error("Usage: warplab waveform <event> OR --m1 N --m2 N"); process.exit(1); }
      waveform = generateCustomWaveform({
        m1: +m1, m2: +m2,
        chi1: +(flag("chi1") ?? "0"),
        chi2: +(flag("chi2") ?? "0"),
        distance: +(flag("distance") ?? "100"),
        inclination: +(flag("inclination") ?? "0"),
      });
    }

    if (format === "csv") {
      console.log(generateWaveformCSV(waveform));
    } else {
      printJSON({
        event: waveform.eventName,
        sample_rate: waveform.sampleRate,
        duration: waveform.duration,
        num_samples: waveform.hPlus.length,
      });
    }
    return;
  }

  if (command === "qnm") {
    let m1: number, m2: number, chi1 = 0, chi2 = 0;

    if (args[1] && !args[1].startsWith("--")) {
      const catalog = await getCatalog();
      const event = findEvent(catalog, args[1]);
      if (!event) { console.error(`Event "${args[1]}" not found.`); process.exit(1); }
      m1 = event.mass_1_source;
      m2 = event.mass_2_source;
      chi1 = event.chi_eff * (m1 + m2) / (2 * m1); // approximate
    } else {
      if (!flag("m1") || !flag("m2")) { console.error("Usage: warplab qnm <event> OR --m1 N --m2 N"); process.exit(1); }
      m1 = +flag("m1")!;
      m2 = +flag("m2")!;
      chi1 = +(flag("chi1") ?? "0");
      chi2 = +(flag("chi2") ?? "0");
    }

    const modes = computeQNMModes(m1, m2, chi1, chi2);
    printJSON(modes.map((m) => ({
      mode: m.label,
      frequency_Hz: +m.frequency.toFixed(2),
      damping_time_ms: +(m.dampingTime * 1000).toFixed(3),
      quality_factor: +m.qualityFactor.toFixed(2),
    })));
    return;
  }

  if (command === "snr") {
    let waveform;

    if (args[1] && !args[1].startsWith("--")) {
      const catalog = await getCatalog();
      const event = findEvent(catalog, args[1]);
      if (!event) { console.error(`Event "${args[1]}" not found.`); process.exit(1); }
      waveform = generateWaveform(event);
    } else {
      if (!flag("m1") || !flag("m2")) { console.error("Usage: warplab snr <event> OR --m1 N --m2 N"); process.exit(1); }
      waveform = generateCustomWaveform({
        m1: +flag("m1")!, m2: +flag("m2")!,
        chi1: 0, chi2: 0,
        distance: +(flag("distance") ?? "100"),
        inclination: 0,
      });
    }

    const strain = computeCharacteristicStrain(waveform);
    const snr = computeOptimalSNR(strain);
    printJSON({ event: waveform.eventName, optimal_snr: +snr.toFixed(2) });
    return;
  }

  if (command === "export") {
    const name = args[1];
    if (!name) { console.error("Usage: warplab export <event-name> [--format json|csv|bibtex|notebook|readme|waveform]"); process.exit(1); }

    const catalog = await getCatalog();
    const event = findEvent(catalog, name);
    if (!event) { console.error(`Event "${name}" not found.`); process.exit(1); }

    const format = flag("format") ?? "json";
    switch (format) {
      case "json": console.log(generateParametersJSON(event)); break;
      case "csv": console.log(generateParametersCSV(event)); break;
      case "bibtex": console.log(generateBibTeX(event)); break;
      case "notebook": console.log(generateNotebook(event)); break;
      case "readme": console.log(generateREADME(event)); break;
      case "waveform": console.log(generateWaveformCSV(generateWaveform(event))); break;
      default: console.error(`Unknown format: ${format}`); process.exit(1);
    }
    return;
  }

  if (command === "stats") {
    const stat = flag("stat") ?? "type_counts";
    const catalog = await getCatalog();

    if (stat === "type_counts") {
      const counts = { BBH: 0, BNS: 0, NSBH: 0 };
      for (const e of catalog) {
        const t = classifyEvent(e) as keyof typeof counts;
        if (t in counts) counts[t]++;
      }
      printJSON({ total: catalog.length, ...counts });
    } else if (stat === "mass") {
      const masses = catalog.map((e) => e.total_mass_source).filter((m) => m > 0).sort((a, b) => a - b);
      printJSON({ count: masses.length, min: +masses[0].toFixed(1), max: +masses[masses.length - 1].toFixed(1), median: +masses[Math.floor(masses.length / 2)].toFixed(1) });
    } else if (stat === "chirp_mass") {
      const mc = catalog.map((e) => e.chirp_mass_source).filter((m) => m > 0).sort((a, b) => a - b);
      printJSON({ count: mc.length, min: +mc[0].toFixed(2), max: +mc[mc.length - 1].toFixed(2), median: +mc[Math.floor(mc.length / 2)].toFixed(2) });
    } else if (stat === "spin") {
      const spins = catalog.map((e) => e.chi_eff).sort((a, b) => a - b);
      printJSON({ count: spins.length, min: +spins[0].toFixed(3), max: +spins[spins.length - 1].toFixed(3), median: +spins[Math.floor(spins.length / 2)].toFixed(3) });
    } else if (stat === "distance") {
      const dists = catalog.map((e) => e.luminosity_distance).filter((d) => d > 0).sort((a, b) => a - b);
      printJSON({ count: dists.length, min_Mpc: +dists[0].toFixed(0), max_Mpc: +dists[dists.length - 1].toFixed(0), median_Mpc: +dists[Math.floor(dists.length / 2)].toFixed(0) });
    }
    return;
  }

  console.error(`Unknown command: ${command}. Run "warplab help" for usage.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
