// ─── Data Export (Browser) ──────────────────────────────────────────────
// Re-exports core generation functions and adds browser download logic.

import type { GWEvent, WaveformData } from "./waveform";
import type { ViewMode } from "./view-mode";

// Re-export all generation functions from core
export {
  generateParametersJSON,
  generateParametersCSV,
  generateWaveformCSV,
  generateBibTeX,
  generateNotebook,
  generateREADME,
} from "../core/export";

import {
  generateParametersJSON,
  generateParametersCSV,
  generateWaveformCSV,
  generateBibTeX,
  generateNotebook,
  generateREADME,
} from "../core/export";

// ─── Export orchestration (browser-only) ────────────────────────────

export interface ExportOptions {
  event: GWEvent;
  waveform: WaveformData | null;
  mode: ViewMode;
}

/**
 * Perform the data export.
 * - Student mode: downloads a single JSON file with parameters
 * - Researcher mode: downloads a full ZIP bundle
 */
export async function performExport(options: ExportOptions): Promise<void> {
  const { event, waveform, mode } = options;

  if (mode === "student") {
    const json = generateParametersJSON(event);
    downloadString(json, `${event.commonName}_data.json`, "application/json");
    return;
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  zip.file("parameters.json", generateParametersJSON(event));
  zip.file("parameters.csv", generateParametersCSV(event));

  if (waveform) {
    zip.file("waveform_template.csv", generateWaveformCSV(waveform));
  }

  zip.file("notebook.ipynb", generateNotebook(event));
  zip.file("CITATION.bib", generateBibTeX(event));
  zip.file("README.md", generateREADME(event));

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${event.commonName}_export.zip`);
}

// ─── Download helpers (browser-only) ────────────────────────────────

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
