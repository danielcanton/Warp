import { inject } from "@vercel/analytics";
inject();

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  EffectComposer,
  EffectPass,
  RenderPass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from "postprocessing";
import { SceneManager } from "./lib/SceneManager";
import { XRManager } from "./lib/XRManager";
import { MergerScene } from "./scenes/merger/MergerScene";
import { SandboxScene } from "./scenes/sandbox/SandboxScene";
import { BlackHoleScene } from "./scenes/blackhole/BlackHoleScene";
import { NBodyScene } from "./scenes/nbody/NBodyScene";
import { CosmologyScene } from "./scenes/cosmology/CosmologyScene";
import type { SceneContext } from "./scenes/types";
import { initViewMode, setViewMode, onViewModeChange } from "./lib/view-mode";
import type { ViewMode } from "./lib/view-mode";

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

// ─── XR Manager ─────────────────────────────────────────────────────

const xrManager = new XRManager(renderer, scene);
xrManager.setupCameraRig(camera);

const vrButtonEl = document.getElementById("vr-button");
if (vrButtonEl) {
  xrManager.createButton().then((btn) => {
    if (btn) {
      btn.style.cssText = vrButtonEl.style.cssText;
      vrButtonEl.replaceWith(btn);
    } else {
      vrButtonEl.textContent = "VR Not Supported";
      vrButtonEl.style.opacity = "0.4";
    }
  });
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
  xrManager,
};

const sceneManager = new SceneManager(ctx);

// Register scenes
sceneManager.register(new MergerScene());
sceneManager.register(new SandboxScene());
sceneManager.register(new BlackHoleScene());
sceneManager.register(new NBodyScene());
sceneManager.register(new CosmologyScene());

// ─── URL Parameters: embed mode & scene selection ────────────────────
const params = new URLSearchParams(window.location.search);

if (params.get("embed") === "true") {
  document.body.classList.add("embed");
}

const startScene = params.get("scene") ?? "merger";
sceneManager.switchScene(startScene);

// ─── View Mode ──────────────────────────────────────────────────────

const initialMode = initViewMode();

const gearBtn = document.getElementById("gear-btn")!;
const dropdown = document.getElementById("view-mode-dropdown")!;
const modeOptions = dropdown.querySelectorAll<HTMLButtonElement>(".mode-option");

// Set initial active state from resolved mode
function updateModeUI(mode: ViewMode): void {
  modeOptions.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}
updateModeUI(initialMode);

gearBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown.classList.toggle("show");
});

modeOptions.forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode as ViewMode;
    setViewMode(mode);
    dropdown.classList.remove("show");
  });
});

// Close dropdown on click outside
document.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest("#view-mode-gear")) {
    dropdown.classList.remove("show");
  }
});

// Sync UI when mode changes programmatically
onViewModeChange(updateModeUI);

// ─── Mobile Bar & Menu ───────────────────────────────────────────────

if (window.innerWidth <= 768) {
  const mobileBar = document.getElementById("mobile-bar")!;
  const mobileTabs = document.getElementById("mobile-tabs")!;
  const hamburgerBtn = document.getElementById("mobile-hamburger")!;
  const mobileMenu = document.getElementById("mobile-menu")!;
  const menuGrid = mobileMenu.querySelector(".mobile-menu-grid")!;
  const backdrop = document.getElementById("mobile-menu-backdrop")!;
  const infoSheet = document.getElementById("mobile-info-sheet")!;
  const sheetHandle = infoSheet.querySelector(".sheet-handle")!;

  // Show mobile bar
  mobileBar.style.display = "flex";

  // ── Populate scene tabs ──
  function buildMobileTabs() {
    mobileTabs.innerHTML = "";
    for (const s of sceneManager.getScenes()) {
      const btn = document.createElement("button");
      btn.className = "mobile-tab" + (sceneManager.currentId === s.id ? " active" : "");
      btn.textContent = s.label;
      btn.dataset.sceneId = s.id;
      btn.addEventListener("click", () => {
        sceneManager.switchScene(s.id);
        mobileTabs.querySelectorAll(".mobile-tab").forEach((t) =>
          t.classList.toggle("active", (t as HTMLElement).dataset.sceneId === s.id)
        );
        // Show info sheet only in merger scene
        if (s.id === "merger") {
          infoSheet.classList.add("sheet-peek");
        } else {
          infoSheet.classList.remove("sheet-peek", "sheet-expanded");
        }
      });
      mobileTabs.appendChild(btn);
    }
  }
  buildMobileTabs();

  // ── Hamburger toggle ──
  function closeMenu() {
    mobileMenu.classList.remove("mobile-menu-open");
    backdrop.classList.remove("visible");
  }

  hamburgerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = mobileMenu.classList.toggle("mobile-menu-open");
    backdrop.classList.toggle("visible", isOpen);
  });
  backdrop.addEventListener("click", closeMenu);

  // ── Menu items ──
  const menuItems: { icon: string; label: string; action: () => void }[] = [
    {
      icon: "▶", label: "Play",
      action: () => { document.getElementById("play-btn")?.click(); closeMenu(); },
    },
    {
      icon: "⏲", label: "Speed",
      action: () => { document.getElementById("speed-btn")?.click(); closeMenu(); },
    },
    {
      icon: "☰", label: "Events",
      action: () => { document.getElementById("events-toggle")?.click(); closeMenu(); },
    },
    {
      icon: "🗺", label: "Map",
      action: () => { document.getElementById("map-toggle")?.click(); closeMenu(); },
    },
    {
      icon: "📷", label: "Screenshot",
      action: () => { document.getElementById("screenshot-btn")?.click(); closeMenu(); },
    },
    {
      icon: "🎯", label: "Tours",
      action: () => { document.getElementById("tour-toggle")?.click(); closeMenu(); },
    },
  ];

  for (const item of menuItems) {
    const btn = document.createElement("button");
    btn.className = "mobile-menu-item";
    btn.innerHTML = `<span class="menu-icon">${item.icon}</span>${item.label}`;
    btn.addEventListener("click", item.action);
    menuGrid.appendChild(btn);
  }

  // ── Info sheet gesture ──
  let sheetStartY = 0;
  let sheetStartTranslate = 0;
  let isDraggingSheet = false;

  function getSheetTranslateY(): number {
    const style = getComputedStyle(infoSheet);
    const matrix = new DOMMatrix(style.transform);
    return matrix.m42;
  }

  sheetHandle.addEventListener("touchstart", (e) => {
    const touch = (e as TouchEvent).touches[0];
    sheetStartY = touch.clientY;
    sheetStartTranslate = getSheetTranslateY();
    isDraggingSheet = true;
    infoSheet.style.transition = "none";
  });

  sheetHandle.addEventListener("touchmove", (e) => {
    if (!isDraggingSheet) return;
    e.preventDefault();
    const touch = (e as TouchEvent).touches[0];
    const dy = touch.clientY - sheetStartY;
    const newY = Math.max(0, sheetStartTranslate + dy);
    infoSheet.style.transform = `translateY(${newY}px)`;
  }, { passive: false });

  sheetHandle.addEventListener("touchend", (e) => {
    if (!isDraggingSheet) return;
    isDraggingSheet = false;
    infoSheet.style.transition = "";
    infoSheet.style.transform = "";

    const touch = (e as TouchEvent).changedTouches[0];
    const dy = touch.clientY - sheetStartY;

    if (infoSheet.classList.contains("sheet-expanded")) {
      // Swiping down from expanded → peek or hide
      if (dy > 60) {
        infoSheet.classList.remove("sheet-expanded");
        infoSheet.classList.add("sheet-peek");
      } else {
        // snap back to expanded
        infoSheet.classList.add("sheet-expanded");
      }
    } else if (infoSheet.classList.contains("sheet-peek")) {
      // Swiping up from peek → expanded
      if (dy < -40) {
        infoSheet.classList.remove("sheet-peek");
        infoSheet.classList.add("sheet-expanded");
      } else if (dy > 40) {
        // Swiping down from peek → hide
        infoSheet.classList.remove("sheet-peek");
      }
    }
  });

  // Tap on handle toggles peek ↔ expanded
  sheetHandle.addEventListener("click", () => {
    if (infoSheet.classList.contains("sheet-expanded")) {
      infoSheet.classList.remove("sheet-expanded");
      infoSheet.classList.add("sheet-peek");
    } else if (infoSheet.classList.contains("sheet-peek")) {
      infoSheet.classList.remove("sheet-peek");
      infoSheet.classList.add("sheet-expanded");
    }
  });

  // Show sheet in peek mode if starting on merger scene
  if (startScene === "merger") {
    // Delay slightly to let MergerScene populate
    requestAnimationFrame(() => infoSheet.classList.add("sheet-peek"));
  }
}

// ─── Render Loop ─────────────────────────────────────────────────────

const clock = new THREE.Clock();
let elapsedTotal = 0;

function animate() {
  const delta = clock.getDelta();
  elapsedTotal += delta;

  sceneManager.update(delta, elapsedTotal);

  if (renderer.xr.isPresenting) {
    xrManager.update();
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
