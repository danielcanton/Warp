import * as THREE from "three";
import type {
  EffectComposer,
  BloomEffect,
} from "postprocessing";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  controls: OrbitControls;
  composer: EffectComposer;
  bloom: BloomEffect;
  audioCtx: AudioContext | null;
  container: HTMLElement;
}

export interface Scene {
  id: string;
  label: string;
  init(ctx: SceneContext): Promise<void>;
  update(dt: number, elapsed: number): void;
  onResize(w: number, h: number): void;
  getUI(): HTMLElement | null;
  dispose(): void;
  supportsXR?: boolean;
}
