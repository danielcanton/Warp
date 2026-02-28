import { inject } from "@vercel/analytics";
inject();

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import {
  EffectComposer,
  EffectPass,
  RenderPass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from "postprocessing";
import { SceneManager } from "./lib/SceneManager";
import { MergerScene } from "./scenes/merger/MergerScene";
import { SandboxScene } from "./scenes/sandbox/SandboxScene";
import { BlackHoleScene } from "./scenes/blackhole/BlackHoleScene";
import { NBodyScene } from "./scenes/nbody/NBodyScene";
import type { SceneContext } from "./scenes/types";

// ─── Three.js Setup ──────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000005);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.01,
  500
);
camera.position.set(3, 4, 7);
camera.lookAt(0, 0.5, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.5, 0);
controls.maxPolarAngle = Math.PI * 0.85;
controls.minDistance = 2;
controls.maxDistance = 25;

// ─── Post-Processing ─────────────────────────────────────────────────

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new BloomEffect({
  luminanceThreshold: 0.2,
  luminanceSmoothing: 0.3,
  intensity: 1.5,
  mipmapBlur: true,
});

const toneMapping = new ToneMappingEffect({
  mode: ToneMappingMode.ACES_FILMIC,
});

composer.addPass(new EffectPass(camera, bloom, toneMapping));

// ─── VR Button ───────────────────────────────────────────────────────

const vrButtonEl = document.getElementById("vr-button")!;
if ("xr" in navigator) {
  (navigator as Navigator & { xr: XRSystem }).xr
    .isSessionSupported("immersive-vr")
    .then((supported) => {
      if (supported) {
        const vrBtn = VRButton.createButton(renderer);
        vrBtn.style.cssText = vrButtonEl.style.cssText;
        vrButtonEl.replaceWith(vrBtn);
      } else {
        vrButtonEl.textContent = "VR Not Supported";
        vrButtonEl.style.opacity = "0.4";
      }
    });
} else {
  vrButtonEl.textContent = "WebXR Not Available";
  vrButtonEl.style.opacity = "0.4";
}

// ─── Scene Manager ───────────────────────────────────────────────────

const ctx: SceneContext = {
  renderer,
  camera,
  scene,
  controls,
  composer,
  bloom,
  audioCtx: null,
  container: document.body,
};

const sceneManager = new SceneManager(ctx);

// Register scenes
sceneManager.register(new MergerScene());
sceneManager.register(new SandboxScene());
sceneManager.register(new BlackHoleScene());
sceneManager.register(new NBodyScene());

// ─── URL Parameters: embed mode & scene selection ────────────────────
const params = new URLSearchParams(window.location.search);

if (params.get("embed") === "true") {
  document.body.classList.add("embed");
}

const startScene = params.get("scene") ?? "merger";
sceneManager.switchScene(startScene);

// ─── Render Loop ─────────────────────────────────────────────────────

const clock = new THREE.Clock();
let elapsedTotal = 0;

function animate() {
  const delta = clock.getDelta();
  elapsedTotal += delta;

  sceneManager.update(delta, elapsedTotal);

  if (renderer.xr.isPresenting) {
    renderer.render(scene, camera);
  } else {
    composer.render(delta);
  }
}

renderer.setAnimationLoop(animate);

// ─── Resize ──────────────────────────────────────────────────────────

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  sceneManager.onResize(window.innerWidth, window.innerHeight);
});
