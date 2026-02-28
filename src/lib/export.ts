/**
 * Data export module for WarpLab.
 * Generates ZIP bundles with event parameters, waveform data,
 * spectrogram screenshots, Jupyter notebooks, and BibTeX citations.
 */

import type { GWEvent, WaveformData } from "./waveform";
import { classifyEvent } from "./waveform";
import type { ViewMode } from "./view-mode";

// ─── GWTC catalog → paper mapping ──────────────────────────────────

const CATALOG_PAPERS: Record<string, { key: string; entry: string }> = {
  "GWTC-1": {
    key: "LIGOScientific:2018mvr",
    entry: `@article{LIGOScientific:2018mvr,
  author = "{LIGO Scientific Collaboration and Virgo Collaboration}",
  title = "{GWTC-1: A Gravitational-Wave Transient Catalog of Compact Binary Mergers Observed by LIGO and Virgo during the First and Second Observing Runs}",
  journal = "Phys. Rev. X",
  volume = "9",
  pages = "031040",
  year = "2019",
  doi = "10.1103/PhysRevX.9.031040",
  eprint = "1811.12907",
  archivePrefix = "arXiv"
}`,
  },
  "GWTC-2": {
    key: "LIGOScientific:2020ibl",
    entry: `@article{LIGOScientific:2020ibl,
  author = "{LIGO Scientific Collaboration and Virgo Collaboration}",
  title = "{GWTC-2: Compact Binary Coalescences Observed by LIGO and Virgo During the First Half of the Third Observing Run}",
  journal = "Phys. Rev. X",
  volume = "11",
  pages = "021053",
  year = "2021",
  doi = "10.1103/PhysRevX.11.021053",
  eprint = "2010.14527",
  archivePrefix = "arXiv"
}`,
  },
  "GWTC-2.1": {
    key: "LIGOScientific:2021usb",
    entry: `@article{LIGOScientific:2021usb,
  author = "{LIGO Scientific Collaboration and Virgo Collaboration}",
  title = "{GWTC-2.1: Deep Extended Catalog of Compact Binary Coalescences Observed by LIGO and Virgo During the First Half of the Third Observing Run}",
  journal = "Phys. Rev. D",
  volume = "109",
  pages = "022001",
  year = "2024",
  doi = "10.1103/PhysRevD.109.022001",
  eprint = "2108.01045",
  archivePrefix = "arXiv"
}`,
  },
  "GWTC-3": {
    key: "LIGOScientific:2021djp",
    entry: `@article{LIGOScientific:2021djp,
  author = "{LIGO Scientific Collaboration and Virgo Collaboration and KAGRA Collaboration}",
  title = "{GWTC-3: Compact Binary Coalescences Observed by LIGO and Virgo During the Second Part of the Third Observing Run}",
  journal = "Phys. Rev. X",
  volume = "13",
  pages = "041039",
  year = "2023",
  doi = "10.1103/PhysRevX.13.041039",
  eprint = "2111.03606",
  archivePrefix = "arXiv"
}`,
  },
};

// ─── Parameter JSON ────────────────────────────────────────────────

export function generateParametersJSON(event: GWEvent): string {
  const type = classifyEvent(event);
  const energyRadiated = event.total_mass_source - event.final_mass_source;

  const params = {
    event: event.commonName,
    catalog: event.catalog_shortName,
    type,
    gps_time: event.GPS,
    mass_1_source: {
      value: event.mass_1_source,
      lower: event.mass_1_source_lower,
      upper: event.mass_1_source_upper,
      unit: "M_sun",
    },
    mass_2_source: {
      value: event.mass_2_source,
      lower: event.mass_2_source_lower,
      upper: event.mass_2_source_upper,
      unit: "M_sun",
    },
    total_mass_source: { value: event.total_mass_source, unit: "M_sun" },
    chirp_mass_source: {
      value: event.chirp_mass_source,
      lower: event.chirp_mass_source_lower,
      upper: event.chirp_mass_source_upper,
      unit: "M_sun",
    },
    final_mass_source: {
      value: event.final_mass_source,
      lower: event.final_mass_source_lower,
      upper: event.final_mass_source_upper,
      unit: "M_sun",
    },
    energy_radiated: { value: energyRadiated, unit: "M_sun_c2" },
    luminosity_distance: {
      value: event.luminosity_distance,
      lower: event.luminosity_distance_lower,
      upper: event.luminosity_distance_upper,
      unit: "Mpc",
    },
    redshift: event.redshift,
    chi_eff: event.chi_eff,
    network_snr: event.network_matched_filter_snr,
    false_alarm_rate: event.far,
    p_astro: event.p_astro,
    source: "GWOSC (https://gwosc.org)",
    exported_by: "WarpLab (https://warplab.app)",
  };

  return JSON.stringify(params, null, 2);
}

// ─── Parameter CSV ─────────────────────────────────────────────────

export function generateParametersCSV(event: GWEvent): string {
  const type = classifyEvent(event);
  const energyRadiated = event.total_mass_source - event.final_mass_source;

  const headers = [
    "parameter",
    "value",
    "lower_90",
    "upper_90",
    "unit",
  ];

  const rows = [
    ["event_name", event.commonName, "", "", ""],
    ["catalog", event.catalog_shortName, "", "", ""],
    ["type", type, "", "", ""],
    ["gps_time", event.GPS, "", "", "s"],
    [
      "mass_1_source",
      event.mass_1_source,
      event.mass_1_source_lower,
      event.mass_1_source_upper,
      "M_sun",
    ],
    [
      "mass_2_source",
      event.mass_2_source,
      event.mass_2_source_lower,
      event.mass_2_source_upper,
      "M_sun",
    ],
    ["total_mass_source", event.total_mass_source, "", "", "M_sun"],
    [
      "chirp_mass_source",
      event.chirp_mass_source,
      event.chirp_mass_source_lower,
      event.chirp_mass_source_upper,
      "M_sun",
    ],
    [
      "final_mass_source",
      event.final_mass_source,
      event.final_mass_source_lower,
      event.final_mass_source_upper,
      "M_sun",
    ],
    ["energy_radiated", energyRadiated, "", "", "M_sun_c2"],
    [
      "luminosity_distance",
      event.luminosity_distance,
      event.luminosity_distance_lower,
      event.luminosity_distance_upper,
      "Mpc",
    ],
    ["redshift", event.redshift, "", "", ""],
    ["chi_eff", event.chi_eff, "", "", ""],
    ["network_snr", event.network_matched_filter_snr, "", "", ""],
    ["false_alarm_rate", event.far, "", "", "Hz"],
    ["p_astro", event.p_astro, "", "", ""],
  ];

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

// ─── Waveform CSV ──────────────────────────────────────────────────

export function generateWaveformCSV(waveform: WaveformData): string {
  const headers = ["time_s", "h_plus", "h_cross"];
  const lines = [headers.join(",")];
  const dt = 1 / waveform.sampleRate;

  for (let i = 0; i < waveform.hPlus.length; i++) {
    const t = (i * dt).toFixed(6);
    lines.push(`${t},${waveform.hPlus[i].toExponential(8)},${waveform.hCross[i].toExponential(8)}`);
  }

  return lines.join("\n");
}

// ─── BibTeX ────────────────────────────────────────────────────────

export function generateBibTeX(event: GWEvent): string {
  const entries: string[] = [];

  // GWOSC data citation
  entries.push(`@misc{GWOSC,
  author = "{LIGO Scientific Collaboration and Virgo Collaboration and KAGRA Collaboration}",
  title = "{Gravitational Wave Open Science Center}",
  howpublished = "\\url{https://gwosc.org}",
  year = "2023",
  note = "Event: ${event.commonName}"
}`);

  // Catalog paper
  const catalog = event.catalog_shortName;
  const paper = CATALOG_PAPERS[catalog];
  if (paper) {
    entries.push(paper.entry);
  }

  // WarpLab citation
  entries.push(`@misc{WarpLab,
  author = "{Canton, Daniel}",
  title = "{WarpLab: Interactive Gravitational Wave Visualizer}",
  howpublished = "\\url{https://warplab.app}",
  year = "2025"
}`);

  return entries.join("\n\n");
}

// ─── Jupyter Notebook ──────────────────────────────────────────────

export function generateNotebook(event: GWEvent): string {
  const type = classifyEvent(event);
  const gps = event.GPS;
  const eventName = event.commonName;

  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3",
      },
      language_info: {
        name: "python",
        version: "3.10.0",
      },
    },
    cells: [
      {
        cell_type: "markdown",
        metadata: {},
        source: [
          `# ${eventName} — Gravitational Wave Analysis\n`,
          `\n`,
          `**Type:** ${type}  \n`,
          `**Masses:** ${event.mass_1_source.toFixed(1)} + ${event.mass_2_source.toFixed(1)} M☉  \n`,
          `**Distance:** ${event.luminosity_distance.toFixed(0)} Mpc  \n`,
          `**Catalog:** ${event.catalog_shortName}  \n`,
          `**GPS Time:** ${gps}  \n`,
          `\n`,
          `This notebook fetches real detector strain from [GWOSC](https://gwosc.org) and reproduces the spectrogram and template overlay.\n`,
          `\n`,
          `*Exported from [WarpLab](https://warplab.app)*`,
        ],
      },
      {
        cell_type: "markdown",
        metadata: {},
        source: ["## 1. Setup\n", "Install required packages if needed."],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          `# Install dependencies (uncomment if needed)\n`,
          `# !pip install gwosc gwpy matplotlib numpy\n`,
          `\n`,
          `import numpy as np\n`,
          `import matplotlib.pyplot as plt\n`,
          `from gwpy.timeseries import TimeSeries\n`,
          `from gwosc.datasets import event_gps\n`,
          `\n`,
          `EVENT = "${eventName}"\n`,
          `GPS = ${gps}\n`,
          `DETECTOR = "H1"  # Change to "L1" or "V1" for other detectors`,
        ],
        execution_count: null,
        outputs: [],
      },
      {
        cell_type: "markdown",
        metadata: {},
        source: [
          "## 2. Fetch strain data from GWOSC\n",
          "Download 32 seconds of strain centered on the event.",
        ],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          `# Fetch 32s of strain data centered on the event\n`,
          `strain = TimeSeries.fetch_open_data(\n`,
          `    DETECTOR, GPS - 16, GPS + 16,\n`,
          `    cache=True\n`,
          `)\n`,
          `print(f"Sample rate: {strain.sample_rate}")\n`,
          `print(f"Duration: {strain.duration}")`,
        ],
        execution_count: null,
        outputs: [],
      },
      {
        cell_type: "markdown",
        metadata: {},
        source: [
          "## 3. Q-transform spectrogram\n",
          "Compute and plot the time-frequency spectrogram using a Q-transform.",
        ],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          `# Compute Q-transform spectrogram\n`,
          `dt = 1  # seconds around merger to plot\n`,
          `qgram = strain.q_transform(\n`,
          `    outseg=(GPS - dt, GPS + dt),\n`,
          `    qrange=(4, 64),\n`,
          `    frange=(20, 1024),\n`,
          `    logf=True\n`,
          `)\n`,
          `\n`,
          `fig, ax = plt.subplots(figsize=(10, 5))\n`,
          `ax.imshow(qgram.T, origin="lower", aspect="auto",\n`,
          `          extent=[qgram.x0.value, (qgram.x0 + qgram.dx * qgram.shape[0]).value,\n`,
          `                  qgram.y0.value, (qgram.y0 + qgram.dy * qgram.shape[1]).value])\n`,
          `ax.set_xlabel("Time [s]")\n`,
          `ax.set_ylabel("Frequency [Hz]")\n`,
          `ax.set_title(f"{EVENT} — Q-transform ({DETECTOR})")\n`,
          `ax.set_yscale("log")\n`,
          `plt.colorbar(ax.images[0], label="Normalized energy")\n`,
          `plt.tight_layout()\n`,
          `plt.show()`,
        ],
        execution_count: null,
        outputs: [],
      },
      {
        cell_type: "markdown",
        metadata: {},
        source: [
          "## 4. Whitened strain and template overlay\n",
          "Bandpass and whiten the data, then overlay the included waveform template.",
        ],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          `# Bandpass filter and whiten\n`,
          `white = strain.whiten(4, 2).bandpass(30, 400)\n`,
          `\n`,
          `# Load the template waveform from the exported CSV\n`,
          `import os\n`,
          `template_file = os.path.join(\n`,
          `    os.path.dirname(os.path.abspath("__file__")),\n`,
          `    "waveform_template.csv"\n`,
          `)\n`,
          `\n`,
          `fig, ax = plt.subplots(figsize=(10, 4))\n`,
          `\n`,
          `# Plot whitened strain around merger\n`,
          `t = white.times.value - GPS\n`,
          `mask = (t > -0.5) & (t < 0.2)\n`,
          `ax.plot(t[mask], white.value[mask], label=f"{DETECTOR} whitened\", alpha=0.8)\n`,
          `\n`,
          `# Overlay template if available\n`,
          `if os.path.exists(template_file):\n`,
          `    template = np.genfromtxt(template_file, delimiter=",",\n`,
          `                             names=True, dtype=None, encoding="utf-8")\n`,
          `    t_templ = template["time_s"]\n`,
          `    h_templ = template["h_plus"]\n`,
          `    # Center template on t=0 at peak\n`,
          `    peak_idx = np.argmax(np.abs(h_templ))\n`,
          `    t_templ = t_templ - t_templ[peak_idx]\n`,
          `    # Scale template to match whitened strain amplitude\n`,
          `    scale = np.max(np.abs(white.value[mask])) / np.max(np.abs(h_templ))\n`,
          `    ax.plot(t_templ, h_templ * scale, "--", label="Template (h+)",\n`,
          `            alpha=0.7, color="tab:orange")\n`,
          `\n`,
          `ax.set_xlabel("Time relative to merger [s]")\n`,
          `ax.set_ylabel("Strain (whitened)")\n`,
          `ax.set_title(f"{EVENT} — Whitened strain with template overlay")\n`,
          `ax.legend()\n`,
          `plt.tight_layout()\n`,
          `plt.show()`,
        ],
        execution_count: null,
        outputs: [],
      },
      {
        cell_type: "markdown",
        metadata: {},
        source: [
          "## 5. Event parameters\n",
          "Summary of parameters from the GWTC catalog.",
        ],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          `# Event parameters from ${event.catalog_shortName}\n`,
          `params = {\n`,
          `    "Event": "${eventName}",\n`,
          `    "Type": "${type}",\n`,
          `    "m1 [M☉]": ${event.mass_1_source.toFixed(2)},\n`,
          `    "m2 [M☉]": ${event.mass_2_source.toFixed(2)},\n`,
          `    "M_total [M☉]": ${event.total_mass_source.toFixed(2)},\n`,
          `    "M_chirp [M☉]": ${event.chirp_mass_source.toFixed(2)},\n`,
          `    "M_final [M☉]": ${event.final_mass_source.toFixed(2)},\n`,
          `    "Distance [Mpc]": ${event.luminosity_distance.toFixed(1)},\n`,
          `    "Redshift": ${event.redshift.toFixed(4)},\n`,
          `    "χ_eff": ${event.chi_eff.toFixed(3)},\n`,
          `    "SNR": ${event.network_matched_filter_snr.toFixed(1)},\n`,
          `    "p_astro": ${event.p_astro.toFixed(4)},\n`,
          `}\n`,
          `\n`,
          `for k, v in params.items():\n`,
          `    print(f"{k:20s} {v}")`,
        ],
        execution_count: null,
        outputs: [],
      },
    ],
  };

  return JSON.stringify(notebook, null, 1);
}

// ─── README ────────────────────────────────────────────────────────

export function generateREADME(event: GWEvent): string {
  const type = classifyEvent(event);
  return `# ${event.commonName} — Data Export

Type: ${type}
Masses: ${event.mass_1_source.toFixed(1)} + ${event.mass_2_source.toFixed(1)} M☉
Distance: ${event.luminosity_distance.toFixed(0)} Mpc
Catalog: ${event.catalog_shortName}

## Files

- **parameters.json** — Full event parameters with uncertainties (JSON)
- **parameters.csv** — Same parameters in tabular CSV format
- **waveform_template.csv** — Synthetic IMRPhenom waveform: h+(t) and h×(t) arrays
- **spectrogram.png** — Q-transform spectrogram screenshot from WarpLab
- **notebook.ipynb** — Jupyter notebook that fetches real strain from GWOSC and reproduces the analysis
- **CITATION.bib** — BibTeX citations for GWOSC, the catalog paper, and WarpLab

## Using the notebook

1. Install dependencies: \`pip install gwosc gwpy matplotlib numpy\`
2. Open \`notebook.ipynb\` in JupyterLab or VS Code
3. Run all cells — it will download real detector strain from GWOSC
4. The notebook produces a Q-transform spectrogram and a whitened strain plot with the template overlay

## Data source

All parameters are from the Gravitational Wave Open Science Center (GWOSC):
https://gwosc.org

The waveform template is a simplified IMRPhenom analytical approximation generated by WarpLab.
It is NOT a full numerical relativity waveform. For research use, fetch real strain from GWOSC.

## Citation

If you use this data in academic work, please cite the sources in CITATION.bib.

---
Exported from WarpLab (https://warplab.app)
`;
}

// ─── Spectrogram capture ───────────────────────────────────────────

export function captureSpectrogram(): Promise<Blob | null> {
  const canvas = document.getElementById("spectrogram-canvas") as HTMLCanvasElement | null;
  if (!canvas || canvas.width === 0) return Promise.resolve(null);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      "image/png",
    );
  });
}

// ─── Export orchestration ──────────────────────────────────────────

export interface ExportOptions {
  event: GWEvent;
  waveform: WaveformData | null;
  mode: ViewMode;
}

/**
 * Perform the data export.
 * - Student mode: downloads a single JSON file with parameters + README
 * - Researcher mode: downloads a full ZIP bundle
 */
export async function performExport(options: ExportOptions): Promise<void> {
  const { event, waveform, mode } = options;

  if (mode === "student") {
    // Quick export: JSON file with parameters
    const json = generateParametersJSON(event);
    downloadString(json, `${event.commonName}_data.json`, "application/json");
    return;
  }

  // Researcher: full ZIP bundle
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  zip.file("parameters.json", generateParametersJSON(event));
  zip.file("parameters.csv", generateParametersCSV(event));

  if (waveform) {
    zip.file("waveform_template.csv", generateWaveformCSV(waveform));
  }

  // Spectrogram screenshot
  const specBlob = await captureSpectrogram();
  if (specBlob) {
    zip.file("spectrogram.png", specBlob);
  }

  zip.file("notebook.ipynb", generateNotebook(event));
  zip.file("CITATION.bib", generateBibTeX(event));
  zip.file("README.md", generateREADME(event));

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${event.commonName}_export.zip`);
}

// ─── Download helpers ──────────────────────────────────────────────

function downloadString(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
