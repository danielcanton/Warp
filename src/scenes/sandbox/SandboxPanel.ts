import type { BinaryParams } from "../../lib/waveform-generator";

type OnChangeCallback = (params: BinaryParams) => void;
type OnMergeCallback = () => void;

/**
 * Glass panel with sliders for custom binary merger parameters.
 */
export class SandboxPanel {
  readonly element: HTMLElement;
  private onChange: OnChangeCallback;
  private onMerge: OnMergeCallback;

  private m1Slider!: HTMLInputElement;
  private m2Slider!: HTMLInputElement;
  private chi1Slider!: HTMLInputElement;
  private chi2Slider!: HTMLInputElement;
  private distSlider!: HTMLInputElement;
  private m1Value!: HTMLElement;
  private m2Value!: HTMLElement;
  private chi1Value!: HTMLElement;
  private chi2Value!: HTMLElement;
  private distValue!: HTMLElement;

  constructor(onChange: OnChangeCallback, onMerge: OnMergeCallback) {
    this.onChange = onChange;
    this.onMerge = onMerge;
    this.element = this.build();
  }

  private build(): HTMLElement {
    const panel = document.createElement("div");
    panel.id = "sandbox-panel";
    panel.className = "glass";
    panel.innerHTML = `
      <h3 class="sandbox-title">Binary Sandbox</h3>
      <div class="sandbox-params">
        <div class="sandbox-row">
          <label>Mass 1</label>
          <input type="range" class="sandbox-slider" id="sb-m1" min="1" max="150" value="36" step="0.5" />
          <span class="sandbox-val" id="sb-m1-val">36 M\u2609</span>
        </div>
        <div class="sandbox-row">
          <label>Mass 2</label>
          <input type="range" class="sandbox-slider" id="sb-m2" min="1" max="150" value="29" step="0.5" />
          <span class="sandbox-val" id="sb-m2-val">29 M\u2609</span>
        </div>
        <div class="sandbox-row">
          <label>Spin 1</label>
          <input type="range" class="sandbox-slider" id="sb-chi1" min="-100" max="100" value="0" />
          <span class="sandbox-val" id="sb-chi1-val">0.00</span>
        </div>
        <div class="sandbox-row">
          <label>Spin 2</label>
          <input type="range" class="sandbox-slider" id="sb-chi2" min="-100" max="100" value="0" />
          <span class="sandbox-val" id="sb-chi2-val">0.00</span>
        </div>
        <div class="sandbox-row">
          <label>Distance</label>
          <input type="range" class="sandbox-slider" id="sb-dist" min="10" max="6000" value="440" step="10" />
          <span class="sandbox-val" id="sb-dist-val">440 Mpc</span>
        </div>
      </div>
      <button class="sandbox-merge-btn" id="sb-merge">Merge</button>
      <div class="sandbox-hint">Adjust parameters then click Merge to watch the inspiral</div>
    `;

    // Cache elements
    this.m1Slider = panel.querySelector("#sb-m1") as HTMLInputElement;
    this.m2Slider = panel.querySelector("#sb-m2") as HTMLInputElement;
    this.chi1Slider = panel.querySelector("#sb-chi1") as HTMLInputElement;
    this.chi2Slider = panel.querySelector("#sb-chi2") as HTMLInputElement;
    this.distSlider = panel.querySelector("#sb-dist") as HTMLInputElement;
    this.m1Value = panel.querySelector("#sb-m1-val")!;
    this.m2Value = panel.querySelector("#sb-m2-val")!;
    this.chi1Value = panel.querySelector("#sb-chi1-val")!;
    this.chi2Value = panel.querySelector("#sb-chi2-val")!;
    this.distValue = panel.querySelector("#sb-dist-val")!;

    // Slider events
    const sliders = [this.m1Slider, this.m2Slider, this.chi1Slider, this.chi2Slider, this.distSlider];
    for (const s of sliders) {
      s.addEventListener("input", () => this.handleChange());
    }

    // Merge button
    panel.querySelector("#sb-merge")!.addEventListener("click", () => this.onMerge());

    return panel;
  }

  private handleChange() {
    const params = this.getParams();
    this.m1Value.textContent = `${params.m1.toFixed(0)} M\u2609`;
    this.m2Value.textContent = `${params.m2.toFixed(0)} M\u2609`;
    this.chi1Value.textContent = params.chi1.toFixed(2);
    this.chi2Value.textContent = params.chi2.toFixed(2);
    this.distValue.textContent = `${params.distance.toFixed(0)} Mpc`;
    this.onChange(params);
  }

  getParams(): BinaryParams {
    return {
      m1: parseFloat(this.m1Slider.value),
      m2: parseFloat(this.m2Slider.value),
      chi1: parseInt(this.chi1Slider.value) / 100,
      chi2: parseInt(this.chi2Slider.value) / 100,
      distance: parseFloat(this.distSlider.value),
      inclination: 0,
    };
  }

  dispose() {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
