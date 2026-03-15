import * as THREE from "three";
import type {
  EffectComposer,
  BloomEffect,
} from "postprocessing";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { XRManager } from "../lib/XRManager";
import type { GWDistortionEffect } from "../lib/GWDistortionEffect";

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  controls: OrbitControls;
  composer: EffectComposer;
  bloom: BloomEffect;
  gwDistortion: GWDistortionEffect;
  audioCtx: AudioContext | null;
  container: HTMLElement;
  xrManager: XRManager | null;
}

export interface DetailTab {
  id: string;
  label: string;
  element: HTMLElement;
}

export interface Scene {
  id: string;
  label: string;
  init(ctx: SceneContext): Promise<void>;
  update(dt: number, elapsed: number): void;
  onResize(w: number, h: number): void;
  getUI(): HTMLElement | null;
  getDetailTabs?(): DetailTab[];
  dispose(): void;
  supportsXR?: boolean;
}
