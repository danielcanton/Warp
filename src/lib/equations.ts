// ─── KaTeX Lazy Loading + Equation DOM Builder ────────────────────
// Loads KaTeX (~40KB gzip) only when Student/Researcher mode is active.
// Explorer mode never triggers the import.

import type { EquationDef } from "./equation-data";
import type { ViewMode } from "./view-mode";

let katexModule: typeof import("katex") | null = null;
let cssLoaded = false;

/** Lazy-load KaTeX module + CSS. Returns the katex render function. */
async function ensureKatex(): Promise<typeof import("katex")> {
  if (katexModule) return katexModule;

  // Load CSS via side-effect import (Vite bundles it)
  if (!cssLoaded) {
    await import("katex/dist/katex.min.css");
    cssLoaded = true;
  }

  katexModule = await import("katex");
  return katexModule;
}

/**
 * Build an equations section DOM element for a given set of equations,
 * filtered by the current view mode.
 */
export async function buildEquationsSection(
  equations: EquationDef[],
  mode: ViewMode,
  values?: Record<string, number>,
): Promise<HTMLElement | null> {
  if (mode === "explorer") return null;

  const visible = equations.filter((eq) => eq.modes.includes(mode as "student" | "researcher"));
  if (visible.length === 0) return null;

  const katex = await ensureKatex();

  const section = document.createElement("div");
  section.className = "info-equations";

  for (const eq of visible) {
    const block = document.createElement("div");
    block.className = "equation-block";
    block.dataset.eqId = eq.id;

    // Label
    const label = document.createElement("div");
    label.className = "equation-label";
    label.textContent = eq.label;
    block.appendChild(label);

    // LaTeX math
    const math = document.createElement("div");
    math.className = "equation-math";
    katex.default.render(eq.latex, math, {
      throwOnError: false,
      displayMode: false,
    });
    block.appendChild(math);

    // Computed value (researcher mode)
    if (eq.compute && values) {
      const computed = eq.compute(values);
      if (computed) {
        const val = document.createElement("div");
        val.className = "equation-value";
        val.textContent = computed;
        block.appendChild(val);
      }
    }

    section.appendChild(block);
  }

  return section;
}

/**
 * Update computed values inside an existing equations section.
 * Avoids re-rendering KaTeX — only touches .equation-value elements.
 */
export function updateEquationValues(
  container: HTMLElement,
  equations: EquationDef[],
  values: Record<string, number>,
): void {
  for (const eq of equations) {
    if (!eq.compute) continue;
    const block = container.querySelector<HTMLElement>(`[data-eq-id="${eq.id}"]`);
    if (!block) continue;

    const computed = eq.compute(values);
    let valEl = block.querySelector<HTMLElement>(".equation-value");

    if (computed) {
      if (!valEl) {
        valEl = document.createElement("div");
        valEl.className = "equation-value";
        block.appendChild(valEl);
      }
      valEl.textContent = computed;
    } else if (valEl) {
      valEl.remove();
    }
  }
}

/**
 * Remove equations section from a container.
 */
export function removeEquationsSection(container: HTMLElement): void {
  const section = container.querySelector(".info-equations");
  if (section) section.remove();
}
