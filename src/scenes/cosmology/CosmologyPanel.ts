import { cosmologyPresets } from "./presets";

export interface CosmologyPanelCallbacks {
  onPresetChange: (index: number) => void;
  onPlayPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onDarkMatterChange: (fraction: number) => void;
  onDarkEnergyChange: (fraction: number) => void;
}

export class CosmologyPanel {
  readonly element: HTMLElement;
  private callbacks: CosmologyPanelCallbacks;

  private playBtn!: HTMLButtonElement;
  private speedValEl!: HTMLElement;
  private galaxyCountEl!: HTMLElement;

  private speeds = [0.1, 0.25, 0.5, 1, 2, 5, 10];
  private speedIndex = 3;
  private isPlaying = true;

  constructor(callbacks: CosmologyPanelCallbacks) {
    this.callbacks = callbacks;
    this.element = this.build();
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

        <div class="cos-info">
          <span>Galaxies: <strong id="cos-galaxy-count">0</strong></span>
        </div>
      </div>
    `;

    // Cache elements
    this.playBtn = panel.querySelector("#cos-play") as HTMLButtonElement;
    this.speedValEl = panel.querySelector("#cos-speed-val")!;
    this.galaxyCountEl = panel.querySelector("#cos-galaxy-count")!;

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

    // Dark Matter
    const dmSlider = panel.querySelector("#cos-dm") as HTMLInputElement;
    const dmVal = panel.querySelector("#cos-dm-val")!;
    dmSlider.addEventListener("input", () => {
      const pct = parseInt(dmSlider.value);
      dmVal.textContent = `${pct}%`;
      this.callbacks.onDarkMatterChange(pct / 100);
    });

    // Dark Energy
    const deSlider = panel.querySelector("#cos-de") as HTMLInputElement;
    const deVal = panel.querySelector("#cos-de-val")!;
    deSlider.addEventListener("input", () => {
      const pct = parseInt(deSlider.value);
      deVal.textContent = `${pct}%`;
      this.callbacks.onDarkEnergyChange(pct / 100);
    });

    return panel;
  }

  updateInfo(galaxyCount: number) {
    this.galaxyCountEl.textContent = String(galaxyCount);
  }

  setPlaying(playing: boolean) {
    this.isPlaying = playing;
    this.playBtn.textContent = playing ? "\u23F8" : "\u25B6";
  }

  dispose() {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
