import { Effect, BlendFunction } from "postprocessing";
import { Uniform } from "three";

import fragmentShader from "../shaders/gw-distortion.frag.glsl?raw";

export class GWDistortionEffect extends Effect {
  constructor() {
    super("GWDistortion", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["intensity", new Uniform(0.0)],
        ["frequency", new Uniform(15.0)],
        ["waveTime", new Uniform(0.0)],
      ]),
    });
  }

  get intensity(): number {
    return (this.uniforms.get("intensity") as Uniform<number>).value;
  }

  set intensity(value: number) {
    (this.uniforms.get("intensity") as Uniform<number>).value = value;
  }

  get frequency(): number {
    return (this.uniforms.get("frequency") as Uniform<number>).value;
  }

  set frequency(value: number) {
    (this.uniforms.get("frequency") as Uniform<number>).value = value;
  }

  get waveTime(): number {
    return (this.uniforms.get("waveTime") as Uniform<number>).value;
  }

  set waveTime(value: number) {
    (this.uniforms.get("waveTime") as Uniform<number>).value = value;
  }
}
