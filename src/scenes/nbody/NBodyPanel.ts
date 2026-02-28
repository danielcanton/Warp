import { presets } from "./presets";

export type BodyType = "star" | "planet" | "blackhole";

export interface NBodyPanelCallbacks {
  onPresetChange: (index: number) => void;
  onPlayPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onPlaceBody: (type: BodyType, mass: number) => void;
  onToggleTrails: (on: boolean) => void;
  onToggleGrid: (on: boolean) => void;
  onToggleCollisions: (on: boolean) => void;
}

export class NBodyPanel {
  readonly element: HTMLElement;
  private callbacks: NBodyPanelCallbacks;

  private bodyCountEl!: HTMLElement;
  private energyEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private speedValEl!: HTMLElement;

  private speeds = [0.1, 0.25, 0.5, 1, 2, 5, 10, 100, 1000];
  private speedIndex = 3; // start at 1x
  private isPlaying = true;

  constructor(callbacks: NBodyPanelCallbacks) {
    this.callbacks = callbacks;
    this.element = this.build();
  }

  private build(): HTMLElement {
    const panel = document.createElement("div");
    panel.id = "nbody-panel";
    panel.className = "glass";

    // Build preset options
    const presetOptions = presets
      .map((p, i) => `<option value="${i}">${p.name}</option>`)
      .join("");

    panel.innerHTML = `
      <div class="nb-header">
        <h3 class="nb-title">N-Body Sandbox</h3>
        <button class="nb-expand-btn" id="nb-expand" aria-label="Expand panel">&#9660;</button>
      </div>

      <div class="nb-always-visible">
        <div class="nb-section">
          <div class="nb-row">
            <label>Preset</label>
            <select class="nb-select" id="nb-preset">${presetOptions}</select>
          </div>
        </div>

        <div class="nb-section">
          <div class="nb-row" style="gap:6px">
            <button class="nb-btn" id="nb-play">⏸</button>
            <button class="nb-btn" id="nb-reset">↺</button>
            <label style="font-size:10px;color:rgba(255,255,255,0.4);margin-left:4px">Speed</label>
            <input type="range" class="nb-slider" id="nb-speed" min="0" max="8" value="3" />
            <span class="nb-speed-val" id="nb-speed-val">1x</span>
          </div>
        </div>
      </div>

      <div class="nb-collapsible" id="nb-collapsible">
        <div class="nb-section">
          <div class="nb-row">
            <label>Add Body</label>
            <select class="nb-select nb-small" id="nb-body-type">
              <option value="star">Star</option>
              <option value="planet" selected>Planet</option>
              <option value="blackhole">Black Hole</option>
            </select>
          </div>
          <div class="nb-row">
            <label>Mass</label>
            <input type="range" class="nb-slider" id="nb-body-mass" min="1" max="200" value="10" />
            <span class="nb-val" id="nb-body-mass-val">0.10</span>
          </div>
          <button class="nb-place-btn" id="nb-place">Place</button>
        </div>

        <div class="nb-toggles">
          <label class="nb-toggle-label"><input type="checkbox" id="nb-trails" checked /> Trails</label>
          <label class="nb-toggle-label"><input type="checkbox" id="nb-grid" /> Grid</label>
          <label class="nb-toggle-label"><input type="checkbox" id="nb-collisions" checked /> Collisions</label>
        </div>

        <div class="nb-info">
          <span>Bodies: <strong id="nb-body-count">0</strong></span>
          <span>E: <strong id="nb-energy">0</strong></span>
        </div>

        <div class="nb-hint">Click to place. Drag to set velocity.</div>
      </div>
    `;

    // Cache
    this.bodyCountEl = panel.querySelector("#nb-body-count")!;
    this.energyEl = panel.querySelector("#nb-energy")!;
    this.playBtn = panel.querySelector("#nb-play") as HTMLButtonElement;
    this.speedValEl = panel.querySelector("#nb-speed-val")!;

    // Expand/collapse (mobile)
    const expandBtn = panel.querySelector("#nb-expand") as HTMLButtonElement;
    const collapsible = panel.querySelector("#nb-collapsible") as HTMLElement;
    expandBtn.addEventListener("click", () => {
      const isCollapsed = panel.classList.toggle("nb-collapsed");
      expandBtn.innerHTML = isCollapsed ? "&#9650;" : "&#9660;";
    });
    // Start collapsed on mobile
    if (window.innerWidth <= 768) {
      panel.classList.add("nb-collapsed");
      expandBtn.innerHTML = "&#9650;";
    }

    // Preset
    const presetSelect = panel.querySelector("#nb-preset") as HTMLSelectElement;
    presetSelect.addEventListener("change", () => {
      this.callbacks.onPresetChange(parseInt(presetSelect.value));
    });

    // Play/Pause
    this.playBtn.addEventListener("click", () => {
      this.isPlaying = !this.isPlaying;
      this.playBtn.textContent = this.isPlaying ? "⏸" : "▶";
      this.callbacks.onPlayPause();
    });

    // Reset
    panel.querySelector("#nb-reset")!.addEventListener("click", () => {
      this.callbacks.onReset();
      this.isPlaying = true;
      this.playBtn.textContent = "⏸";
    });

    // Speed
    const speedSlider = panel.querySelector("#nb-speed") as HTMLInputElement;
    speedSlider.addEventListener("input", () => {
      this.speedIndex = parseInt(speedSlider.value);
      const speed = this.speeds[this.speedIndex];
      this.speedValEl.textContent = speed >= 1 ? `${speed}x` : `${speed}x`;
      this.callbacks.onSpeedChange(speed);
    });

    // Body mass display
    const massSlider = panel.querySelector("#nb-body-mass") as HTMLInputElement;
    const massVal = panel.querySelector("#nb-body-mass-val")!;
    massSlider.addEventListener("input", () => {
      massVal.textContent = (parseInt(massSlider.value) / 100).toFixed(2);
    });

    // Place button
    panel.querySelector("#nb-place")!.addEventListener("click", () => {
      const typeSelect = panel.querySelector("#nb-body-type") as HTMLSelectElement;
      const mass = parseInt(massSlider.value) / 100;
      this.callbacks.onPlaceBody(typeSelect.value as BodyType, mass);
    });

    // Toggles
    (panel.querySelector("#nb-trails") as HTMLInputElement).addEventListener("change", (e) => {
      this.callbacks.onToggleTrails((e.target as HTMLInputElement).checked);
    });
    (panel.querySelector("#nb-grid") as HTMLInputElement).addEventListener("change", (e) => {
      this.callbacks.onToggleGrid((e.target as HTMLInputElement).checked);
    });
    (panel.querySelector("#nb-collisions") as HTMLInputElement).addEventListener("change", (e) => {
      this.callbacks.onToggleCollisions((e.target as HTMLInputElement).checked);
    });

    return panel;
  }

  updateInfo(bodyCount: number, energy: number) {
    this.bodyCountEl.textContent = String(bodyCount);
    this.energyEl.textContent = energy.toFixed(2);
  }

  setPlaying(playing: boolean) {
    this.isPlaying = playing;
    this.playBtn.textContent = playing ? "⏸" : "▶";
  }

  /** Hide panel on mobile during placement mode */
  setPlacementMode(active: boolean) {
    if (window.innerWidth <= 768) {
      this.element.style.display = active ? "none" : "";
    }
  }

  dispose() {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
