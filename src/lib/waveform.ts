import * as THREE from "three";

// Re-export core types and functions so existing imports don't break
export type { WaveformData } from "../core/types";
export { classifyEvent } from "../core/catalog";
export { generateWaveform } from "../core/waveform";

// Re-export GWEvent but augment mapPosition to use THREE.Vector3
import type { GWEvent as CoreGWEvent } from "../core/types";
export interface GWEvent extends Omit<CoreGWEvent, "mapPosition"> {
  mapPosition?: THREE.Vector3;
}

// Re-export fetchEventCatalog with THREE.Vector3 mapPosition
import { fetchEventCatalog as coreFetchEventCatalog } from "../core/catalog";

export async function fetchEventCatalog(): Promise<GWEvent[]> {
  const events = await coreFetchEventCatalog();
  // Convert plain {x,y,z} to THREE.Vector3 for the browser
  return events.map((e) => ({
    ...e,
    mapPosition: e.mapPosition
      ? new THREE.Vector3(e.mapPosition.x, e.mapPosition.y, e.mapPosition.z)
      : undefined,
  }));
}

/**
 * Create a DataTexture from waveform data for the GPU.
 */
export function waveformToTexture(waveform: { hPlus: number[]; hCross: number[] }): THREE.DataTexture {
  const width = waveform.hPlus.length;
  const data = new Float32Array(width * 4);

  for (let i = 0; i < width; i++) {
    data[i * 4 + 0] = waveform.hPlus[i] * 0.5 + 0.5;
    data[i * 4 + 1] = waveform.hCross[i] * 0.5 + 0.5;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 1;
  }

  const texture = new THREE.DataTexture(
    data,
    width,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;

  return texture;
}
