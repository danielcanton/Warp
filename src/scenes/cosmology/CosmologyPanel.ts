import { cosmologyPresets } from "./presets";
import { getViewMode, onViewModeChange, type ViewMode } from "../../lib/view-mode";
import { cosmologyEquations } from "../../lib/equation-data";
import {
  buildEquationsSection,
  removeEquationsSection,
  updateEquationValues,
} from "../../lib/equations";

export interface CosmologyPanelCallbacks {
  onPresetChange: (index: number) => void;
  onPlayPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onDarkMatterChange: (fraction: number) => void;
  onDarkEnergyChange: (fraction: number) => void;
  /** Friedmann parameter callbacks — map to physics engine */
  onH0Change?: (value: number) => void;
  onOmegaMChange?: (value: number) => void;
  onOmegaLambdaChange?: (value: number) => void;
  onOmegaKChange?: (value: number) => void;
}

export class CosmologyPanel {
  readonly element: HTMLElement;
  private callbacks: CosmologyPanelCallbacks;

  private playBtn!: HTMLButtonElement;
  private speedValEl!: HTMLElement;
  private galaxyCountEl!: HTMLElement;
  private collapsibleEl!: HTMLElement;

  private speeds = [0.1, 0.25, 0.5, 1, 2, 5, 10];
  private speedIndex = 3;
  private isPlaying = true;
  private unsubViewMode: (() => void) | null = null;

  /** Current Friedmann parameter values for equation computation */
  private friedmannParams = {
    H0: 67.4,
    Omega_m: 0.315,
    Omega_Lambda: 0.685,
    Omega_k: 0.0,
  };

  constructor(callbacks: CosmologyPanelCallbacks) {
    this.callbacks = callbacks;
    this.element = this.build();
    // Set up view mode: initial + subscribe
    const mode = getViewMode();
    this.applyViewMode(mode);
    this.unsubViewMode = onViewModeChange((m) => this.applyViewMode(m));
  }

  private build(): HTMLElement {
    const panel = document.createElement("div");
    panel.id = "cosmology-panel";
    panel.className = "glass";

    const presetOptions = cosmologyPresets
      .map((p, i) => `<option value="${i}">${p.name}</option>`)
      .join("");

    panel.innerHTML = `
      <div class="cos-header">
        <h3 class="cos-title">Cosmology</h3>
        <button class="cos-expand-btn" id="cos-expand" aria-label="Expand panel">&#9660;</button>
      </div>

      <div class="cos-always-visible">
        <div class="cos-section">
          <div class="cos-row">
            <label>Preset</label>
            <select class="cos-select" id="cos-preset">${presetOptions}</select>
          </div>
        </div>

        <div class="cos-section">
          <div class="cos-row" style="gap:6px">
            <button class="cos-btn" id="cos-play">\u23F8</button>
            <button class="cos-btn" id="cos-reset">\u21BA</button>
            <label style="font-size:10px;color:rgba(255,255,255,0.4);margin-left:4px">Speed</label>
            <input type="range" class="cos-slider" id="cos-speed" min="0" max="6" value="3" />
            <span class="cos-speed-val" id="cos-speed-val">1x</span>
          </div>
        </div>
      </div>

      <div class="cos-collapsible" id="cos-collapsible">
        <!-- Explorer sliders (simple) -->
        <div class="cos-explorer-sliders">
          <div class="cos-section">
            <div class="cos-row cos-slider-row">
              <label>Dark Matter</label>
              <input type="range" class="cos-slider" id="cos-dm" min="0" max="200" value="100" />
              <span class="cos-speed-val" id="cos-dm-val">100%</span>
            </div>
            <div class="cos-hint">How much invisible mass holds galaxies together</div>
          </div>

          <div class="cos-section">
            <div class="cos-row cos-slider-row">
              <label>Dark Energy</label>
              <input type="range" class="cos-slider" id="cos-de" min="0" max="200" value="100" />
              <span class="cos-speed-val" id="cos-de-val">100%</span>
            </div>
            <div class="cos-hint">How fast the universe expands</div>
          </div>
        </div>

        <!-- Friedmann parameter sliders (Student/Researcher) -->
        <div class="cos-friedmann-sliders" style="display:none">
          <div class="cos-section">
            <div class="cos-row cos-slider-row">
              <label>H₀</label>
              <input type="range" class="cos-slider" id="cos-h0" min="20" max="120" value="67" step="0.1" />
              <span class="cos-speed-val" id="cos-h0-val">67.4</span>
            </div>
            <div class="cos-hint">Hubble constant (km/s/Mpc)</div>
          </div>

          <div class="cos-section">
            <div class="cos-row cos-slider-row">
              <label>Ω<sub>m</sub></label>
              <input type="range" class="cos-slider" id="cos-omega-m" min="0" max="1.5" value="0.315" step="0.005" />
              <span class="cos-speed-val" id="cos-omega-m-val">0.315</span>
            </div>
            <div class="cos-hint">Matter density parameter</div>
          </div>

          <div class="cos-section">
            <div class="cos-row cos-slider-row">
              <label>Ω<sub>Λ</sub></label>
              <input type="range" class="cos-slider" id="cos-omega-l" min="0" max="1.5" value="0.685" step="0.005" />
              <span class="cos-speed-val" id="cos-omega-l-val">0.685</span>
            </div>
            <div class="cos-hint">Dark energy density parameter</div>
          </div>

          <div class="cos-section">
            <div class="cos-row cos-slider-row">
              <label>Ω<sub>k</sub></label>
              <input type="range" class="cos-slider" id="cos-omega-k" min="-0.5" max="0.5" value="0" step="0.005" />
              <span class="cos-speed-val" id="cos-omega-k-val">0.000</span>
            </div>
            <div class="cos-hint">Curvature parameter (0 = flat)</div>
          </div>
        </div>

        <div class="cos-info">
          <span>Galaxies: <strong id="cos-galaxy-count">0</strong></span>
        </div>
      </div>
    `;

    // Cache elements
    this.playBtn = panel.querySelector("#cos-play") as HTMLButtonElement;
    this.speedValEl = panel.querySelector("#cos-speed-val")!;
    this.galaxyCountEl = panel.querySelector("#cos-galaxy-count")!;
    this.collapsibleEl = panel.querySelector("#cos-collapsible")!;

    // Expand/collapse (mobile)
    const expandBtn = panel.querySelector("#cos-expand") as HTMLButtonElement;
    expandBtn.addEventListener("click", () => {
      const isCollapsed = panel.classList.toggle("cos-collapsed");
      expandBtn.innerHTML = isCollapsed ? "&#9650;" : "&#9660;";
    });
    if (window.innerWidth <= 768) {
      panel.classList.add("cos-collapsed");
      expandBtn.innerHTML = "&#9650;";
    }

    // Preset
    const presetSelect = panel.querySelector("#cos-preset") as HTMLSelectElement;
    presetSelect.addEventListener("change", () => {
      this.callbacks.onPresetChange(parseInt(presetSelect.value));
    });

    // Play/Pause
    this.playBtn.addEventListener("click", () => {
      this.isPlaying = !this.isPlaying;
      this.playBtn.textContent = this.isPlaying ? "\u23F8" : "\u25B6";
      this.callbacks.onPlayPause();
    });

    // Reset
    panel.querySelector("#cos-reset")!.addEventListener("click", () => {
      this.callbacks.onReset();
      this.isPlaying = true;
      this.playBtn.textContent = "\u23F8";
    });

    // Speed
    const speedSlider = panel.querySelector("#cos-speed") as HTMLInputElement;
    speedSlider.addEventListener("input", () => {
      this.speedIndex = parseInt(speedSlider.value);
      const speed = this.speeds[this.speedIndex];
      this.speedValEl.textContent = `${speed}x`;
      this.callbacks.onSpeedChange(speed);
    });

    // Explorer: Dark Matter
    const dmSlider = panel.querySelector("#cos-dm") as HTMLInputElement;
    const dmVal = panel.querySelector("#cos-dm-val")!;
    dmSlider.addEventListener("input", () => {
      const pct = parseInt(dmSlider.value);
      dmVal.textContent = `${pct}%`;
      this.callbacks.onDarkMatterChange(pct / 100);
    });

    // Explorer: Dark Energy
    const deSlider = panel.querySelector("#cos-de") as HTMLInputElement;
    const deVal = panel.querySelector("#cos-de-val")!;
    deSlider.addEventListener("input", () => {
      const pct = parseInt(deSlider.value);
      deVal.textContent = `${pct}%`;
      this.callbacks.onDarkEnergyChange(pct / 100);
    });

    // Friedmann: H0
    const h0Slider = panel.querySelector("#cos-h0") as HTMLInputElement;
    const h0Val = panel.querySelector("#cos-h0-val")!;
    h0Slider.addEventListener("input", () => {
      const v = parseFloat(h0Slider.value);
      this.friedmannParams.H0 = v;
      h0Val.textContent = v.toFixed(1);
      // Map H0 to dark energy fraction: H0/67.4 scales expansion rate
      this.callbacks.onDarkEnergyChange(v / 67.4);
      this.callbacks.onH0Change?.(v);
      this.updateEquations();
    });

    // Friedmann: Omega_m
    const omSlider = panel.querySelector("#cos-omega-m") as HTMLInputElement;
    const omVal = panel.querySelector("#cos-omega-m-val")!;
    omSlider.addEventListener("input", () => {
      const v = parseFloat(omSlider.value);
      this.friedmannParams.Omega_m = v;
      omVal.textContent = v.toFixed(3);
      // Map Omega_m to dark matter fraction: Omega_m/0.315 scales DM contribution
      this.callbacks.onDarkMatterChange(v / 0.315);
      this.callbacks.onOmegaMChange?.(v);
      this.updateEquations();
    });

    // Friedmann: Omega_Lambda
    const olSlider = panel.querySelector("#cos-omega-l") as HTMLInputElement;
    const olVal = panel.querySelector("#cos-omega-l-val")!;
    olSlider.addEventListener("input", () => {
      const v = parseFloat(olSlider.value);
      this.friedmannParams.Omega_Lambda = v;
      olVal.textContent = v.toFixed(3);
      // Map Omega_Lambda to dark energy: scales expansion
      this.callbacks.onDarkEnergyChange(v / 0.685);
      this.callbacks.onOmegaLambdaChange?.(v);
      this.updateEquations();
    });

    // Friedmann: Omega_k
    const okSlider = panel.querySelector("#cos-omega-k") as HTMLInputElement;
    const okVal = panel.querySelector("#cos-omega-k-val")!;
    okSlider.addEventListener("input", () => {
      const v = parseFloat(okSlider.value);
      this.friedmannParams.Omega_k = v;
      okVal.textContent = v.toFixed(3);
      this.callbacks.onOmegaKChange?.(v);
      this.updateEquations();
    });

    return panel;
  }

  private applyViewMode(mode: ViewMode): void {
    const explorerSliders = this.element.querySelector(".cos-explorer-sliders") as HTMLElement;
    const friedmannSliders = this.element.querySelector(".cos-friedmann-sliders") as HTMLElement;

    if (mode === "explorer") {
      explorerSliders.style.display = "";
      friedmannSliders.style.display = "none";
    } else {
      explorerSliders.style.display = "none";
      friedmannSliders.style.display = "";
    }

    this.ensureEquationsSection(mode);
  }

  private async ensureEquationsSection(mode: ViewMode): Promise<void> {
    removeEquationsSection(this.element);
    if (mode === "explorer") return;

    const section = await buildEquationsSection(
      cosmologyEquations,
      mode,
      this.friedmannParams,
    );
    if (section) {
      // Insert equations before the info row at the bottom
      const infoEl = this.collapsibleEl.querySelector(".cos-info");
      if (infoEl) {
        this.collapsibleEl.insertBefore(section, infoEl);
      } else {
        this.collapsibleEl.appendChild(section);
      }
    }
  }

  private updateEquations(): void {
    updateEquationValues(this.element, cosmologyEquations, this.friedmannParams);
  }

  updateInfo(galaxyCount: number) {
    this.galaxyCountEl.textContent = String(galaxyCount);
  }

  setPlaying(playing: boolean) {
    this.isPlaying = playing;
    this.playBtn.textContent = playing ? "\u23F8" : "\u25B6";
  }

  dispose() {
    if (this.unsubViewMode) {
      this.unsubViewMode();
      this.unsubViewMode = null;
    }
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
