export interface CosmologyPanelCallbacks {
  onPlayPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
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

    panel.innerHTML = `
      <div class="cos-header">
        <h3 class="cos-title">Cosmology</h3>
        <button class="cos-expand-btn" id="cos-expand" aria-label="Expand panel">&#9660;</button>
      </div>

      <div class="cos-always-visible">
        <div class="cos-section">
          <div class="cos-row">
            <label>Preset</label>
            <select class="cos-select" id="cos-preset">
              <option value="0">Our Universe</option>
            </select>
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
