import * as THREE from "three";
import type { WaveformData } from "./waveform";

// Re-export from core
export type { BinaryParams } from "../core/types";
export { generateCustomWaveform } from "../core/waveform";

/**
 * Create a DataTexture from waveform data for the GPU.
 */
export function waveformToTexture(waveform: WaveformData): THREE.DataTexture {
  const width = waveform.hPlus.length;
  const data = new Float32Array(width * 4);

  for (let i = 0; i < width; i++) {
    data[i * 4 + 0] = waveform.hPlus[i] * 0.5 + 0.5;
    data[i * 4 + 1] = waveform.hCross[i] * 0.5 + 0.5;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 1;
  }

  const texture = new THREE.DataTexture(
    data, width, 1, THREE.RGBAFormat, THREE.FloatType
  );
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;

  return texture;
}
