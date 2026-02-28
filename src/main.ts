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
import {
  fetchEventCatalog,
  generateWaveform,
  waveformToTexture,
  classifyEvent,
  type GWEvent,
  type WaveformData,
} from "./lib/waveform";
import { GWAudioEngine } from "./lib/audio";
import { BinarySystem } from "./lib/binary";
import { UniverseMap } from "./lib/universe-map";
import vertexShader from "./shaders/spacetime.vert.glsl?raw";
import fragmentShader from "./shaders/spacetime.frag.glsl?raw";

// ─── State ───────────────────────────────────────────────────────────

let events: GWEvent[] = [];
let currentEvent: GWEvent | null = null;
let currentWaveform: WaveformData | null = null;

let playbackTime = 0;
let isPlaying = false;
let playbackSpeed = 1.0;

type ViewMode = "event" | "map";
let viewMode: ViewMode = "event";

const audio = new GWAudioEngine();
const mouse = new THREE.Vector2();

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

// ─── Event View Objects ──────────────────────────────────────────────
// Grouped so we can toggle visibility between views

const eventViewGroup = new THREE.Group();
scene.add(eventViewGroup);

// Spacetime mesh
const defaultWaveformData = new Float32Array(512 * 4);
for (let i = 0; i < 512; i++) {
  defaultWaveformData[i * 4 + 0] = 0.5;
  defaultWaveformData[i * 4 + 1] = 0.5;
  defaultWaveformData[i * 4 + 2] = 0;
  defaultWaveformData[i * 4 + 3] = 1;
}
const defaultTexture = new THREE.DataTexture(
  defaultWaveformData, 512, 1, THREE.RGBAFormat, THREE.FloatType
);
defaultTexture.needsUpdate = true;
defaultTexture.minFilter = THREE.LinearFilter;
defaultTexture.magFilter = THREE.LinearFilter;

const spacetimeMaterial = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uAmplitude: { value: 1.8 },
    uWaveform: { value: defaultTexture },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: true,
});

const spacetimeGeometry = new THREE.PlaneGeometry(16, 16, 200, 200);
spacetimeGeometry.rotateX(-Math.PI / 2);
eventViewGroup.add(new THREE.Mesh(spacetimeGeometry, spacetimeMaterial));

// Binary system
const binary = new BinarySystem();
eventViewGroup.add(binary.group);

// Merger glow
const glowMaterial = new THREE.MeshBasicMaterial({
  color: 0x6366f1, transparent: true, opacity: 0,
});
const mergerGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 32, 32), glowMaterial
);
mergerGlow.position.set(0, 0.6, 0);
eventViewGroup.add(mergerGlow);

eventViewGroup.add(new THREE.AmbientLight(0x404060, 0.4));

// ─── Ambient Stars (shared between views) ────────────────────────────

const starCount = 4000;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const r = 25 + Math.random() * 80;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i * 3 + 2] = r * Math.cos(phi);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({
  color: 0xccccff, size: 0.06, sizeAttenuation: true,
  transparent: true, opacity: 0.7,
});
scene.add(new THREE.Points(starGeometry, starMaterial));

// ─── Universe Map ────────────────────────────────────────────────────

const universeMap = new UniverseMap();
scene.add(universeMap.group);

universeMap.onSelectEvent = (event) => {
  selectEvent(event);
  setViewMode("event");
};

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

// ─── UI Controls ─────────────────────────────────────────────────────

const playBtn = document.getElementById("play-btn")!;
const timeSlider = document.getElementById("time-slider") as HTMLInputElement;
const timeLabel = document.getElementById("time-label")!;
const speedBtn = document.getElementById("speed-btn")!;
const speedLabel = document.getElementById("speed-label")!;
const eventName = document.getElementById("event-name")!;
const massesEl = document.getElementById("masses")!;
const distanceEl = document.getElementById("distance")!;
const typeBadgeEl = document.getElementById("type-badge")!;
const chirpMassEl = document.getElementById("chirp-mass")!;
const finalMassEl = document.getElementById("final-mass")!;
const energyRadiatedEl = document.getElementById("energy-radiated")!;
const chiEffEl = document.getElementById("chi-eff")!;
const redshiftEl = document.getElementById("redshift")!;
const snrEl = document.getElementById("snr")!;
const pAstroEl = document.getElementById("p-astro")!;
const catalogEl = document.getElementById("catalog-name")!;
const eventListItems = document.getElementById("event-list-items")!;
const mapToggleBtn = document.getElementById("map-toggle")!;
const eventCountEl = document.getElementById("event-count")!;
const timeControlsEl = document.getElementById("time-controls")!;
const eventInfoEl = document.getElementById("event-info")!;
const mapLegendEl = document.getElementById("map-legend")!;
const helpOverlay = document.getElementById("help-overlay")!;
const helpBtn = document.getElementById("help-btn")!;
const helpCloseBtn = document.getElementById("help-close")!;
const sortSelect = document.getElementById("sort-select") as HTMLSelectElement;
const filterChips = document.querySelectorAll<HTMLButtonElement>(".filter-chip");
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const loadingScreen = document.getElementById("loading-screen")!;
const loadingStatus = document.getElementById("loading-status")!;
const mapTooltip = document.getElementById("map-tooltip")!;
const onboarding = document.getElementById("onboarding")!;
const aboutOverlay = document.getElementById("about-overlay")!;
const aboutCloseBtn = document.getElementById("about-close")!;
const brandEl = document.getElementById("brand")!;
const screenshotBtn = document.getElementById("screenshot-btn")!;
const eventsToggleBtn = document.getElementById("events-toggle");
const eventListEl = document.getElementById("event-list")!;
const shareBtn = document.getElementById("share-btn")!;
const shareToast = document.getElementById("share-toast")!;

// ─── Embed Mode ──────────────────────────────────────────────────────
const isEmbed =
  new URLSearchParams(window.location.search).get("embed") === "true";
if (isEmbed) {
  document.body.classList.add("embed");
}

// ─── Screenshot Export ──────────────────────────────────────────────

function takeScreenshot() {
  // Force a fresh render so the buffer is current
  if (renderer.xr.isPresenting) {
    renderer.render(scene, camera);
  } else {
    composer.render(0);
  }

  const sourceCanvas = renderer.domElement;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  // Create offscreen canvas and draw the screenshot
  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext("2d")!;
  ctx.drawImage(sourceCanvas, 0, 0);

  // Watermark text settings
  const eventLabel = currentEvent?.commonName ?? "WarpLab";
  const watermark = "warplab.app";
  const fontSize = Math.max(16, Math.round(h * 0.025));

  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = "top";

  // Event name — top left
  const pad = Math.round(fontSize * 1.2);
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(eventLabel, pad, pad);

  // Watermark — bottom right
  ctx.textBaseline = "bottom";
  ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  const metrics = ctx.measureText(watermark);
  ctx.fillText(watermark, w - metrics.width - pad, h - pad);

  // Trigger download
  offscreen.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (currentEvent?.commonName ?? "warplab").replace(/[^a-zA-Z0-9_-]/g, "");
    a.download = `warplab-${safeName}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

screenshotBtn.addEventListener("click", takeScreenshot);

// Mobile events panel toggle
if (eventsToggleBtn) {
  eventsToggleBtn.addEventListener("click", () => {
    const isOpen = eventListEl.classList.toggle("mobile-open");
    eventsToggleBtn.textContent = isOpen ? "Close" : "Events";
  });
}

// Share button
let shareToastTimer: ReturnType<typeof setTimeout> | null = null;

function showShareToast(message: string) {
  shareToast.textContent = message;
  shareToast.classList.add("show");
  if (shareToastTimer) clearTimeout(shareToastTimer);
  shareToastTimer = setTimeout(() => {
    shareToast.classList.remove("show");
  }, 2000);
}

shareBtn.addEventListener("click", async () => {
  if (!currentEvent) return;
  const shareUrl = `https://warplab.app/app.html?event=${encodeURIComponent(currentEvent.commonName)}`;

  // On mobile, try Web Share API first
  if (navigator.share) {
    try {
      await navigator.share({
        title: `WarpLab — ${currentEvent.commonName}`,
        url: shareUrl,
      });
      return;
    } catch {
      // User cancelled or API failed — fall through to clipboard
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(shareUrl);
    showShareToast("Link copied!");
  } catch {
    showShareToast("Could not copy link");
  }
});

let activeTypeFilter: string = "all";
let activeSortKey: string = "snr";
let searchQuery: string = "";

playBtn.addEventListener("click", () => {
  if (!currentWaveform) return;
  if (isPlaying) {
    isPlaying = false;
    audio.stop();
    playBtn.innerHTML = "&#9654;";
  } else {
    isPlaying = true;
    if (playbackTime >= 0.99) {
      playbackTime = 0;
      binary.reset();
    }
    audio.play(playbackTime, playbackSpeed);
    playBtn.innerHTML = "&#9646;&#9646;";
  }
});

timeSlider.addEventListener("input", () => {
  playbackTime = parseInt(timeSlider.value) / 1000;
  binary.reset();
  if (isPlaying) {
    audio.play(playbackTime, playbackSpeed);
  }
});

const speeds = [0.25, 0.5, 1, 2, 4];
let speedIndex = 2;

speedBtn.addEventListener("click", () => {
  speedIndex = (speedIndex + 1) % speeds.length;
  playbackSpeed = speeds[speedIndex];
  speedLabel.textContent = `${playbackSpeed}x`;
  audio.setSpeed(playbackSpeed);
});

// ─── View Mode Toggle ────────────────────────────────────────────────

function setViewMode(mode: ViewMode) {
  viewMode = mode;

  if (mode === "event") {
    eventViewGroup.visible = true;
    universeMap.hide();
    scene.fog = new THREE.FogExp2(0x000005, 0.04);

    // Restore event view camera
    camera.position.set(3, 4, 7);
    controls.target.set(0, 0.5, 0);
    controls.minDistance = 2;
    controls.maxDistance = 25;

    // Show/hide UI
    timeControlsEl.style.display = "flex";
    eventInfoEl.style.display = "block";
    mapLegendEl.style.display = "none";
    mapToggleBtn.textContent = "Universe Map";
    mapTooltip.style.display = "none";
  } else {
    eventViewGroup.visible = false;
    universeMap.show();
    scene.fog = new THREE.FogExp2(0x000005, 0.008);

    // Zoom out for map view
    camera.position.set(15, 12, 20);
    controls.target.set(0, 0, 0);
    controls.minDistance = 2;
    controls.maxDistance = 120;

    isPlaying = false;
    audio.stop();
    playBtn.innerHTML = "&#9654;";

    // Show/hide UI
    timeControlsEl.style.display = "none";
    eventInfoEl.style.display = "none";
    helpOverlay.style.display = "none";
    mapLegendEl.style.display = "block";
    mapToggleBtn.textContent = "Back to Event";
  }

  controls.update();
}

mapToggleBtn.addEventListener("click", () => {
  setViewMode(viewMode === "event" ? "map" : "event");
});

// ─── Map Click Interaction ───────────────────────────────────────────

renderer.domElement.addEventListener("click", (e) => {
  if (viewMode !== "map") return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  const hit = universeMap.raycast(mouse, camera);
  if (hit) {
    selectEvent(hit);
    setViewMode("event");
  }
});

// Hover cursor + tooltip
renderer.domElement.addEventListener("mousemove", (e) => {
  if (viewMode !== "map") return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  const hit = universeMap.raycast(mouse, camera);
  renderer.domElement.style.cursor = hit ? "pointer" : "default";

  if (hit) {
    const type = classifyEvent(hit);
    const dist = hit.luminosity_distance.toFixed(0);
    mapTooltip.innerHTML = `<span class="tooltip-name">${hit.commonName}</span><span class="tooltip-detail">${type} &middot; ${dist} Mpc</span>`;
    mapTooltip.style.display = "block";
    mapTooltip.style.left = `${e.clientX + 14}px`;
    mapTooltip.style.top = `${e.clientY - 10}px`;
  } else {
    mapTooltip.style.display = "none";
  }
});

// ─── Event Selection ─────────────────────────────────────────────────

function selectEvent(event: GWEvent) {
  currentEvent = event;
  currentWaveform = generateWaveform(event);

  const texture = waveformToTexture(currentWaveform);
  spacetimeMaterial.uniforms.uWaveform.value = texture;

  const snrScale = Math.min(event.network_matched_filter_snr / 15, 3);
  spacetimeMaterial.uniforms.uAmplitude.value = 1.2 + snrScale * 0.6;

  playbackTime = 0;
  isPlaying = false;
  audio.stop();
  audio.prepare(currentWaveform);
  playBtn.innerHTML = "&#9654;";
  binary.reset();

  // Update UI — primary fields
  eventName.textContent = event.commonName;
  massesEl.textContent = `${event.mass_1_source.toFixed(1)} + ${event.mass_2_source.toFixed(1)} M\u2609`;
  distanceEl.textContent = `${event.luminosity_distance.toFixed(0)} Mpc`;

  // Type badge
  const type = classifyEvent(event);
  const typeLabels: Record<string, string> = {
    BBH: "Binary Black Hole",
    BNS: "Binary Neutron Star",
    NSBH: "Neutron Star \u2013 Black Hole",
  };
  typeBadgeEl.textContent = typeLabels[type] ?? type;
  typeBadgeEl.className = `type-badge ${type.toLowerCase()}`;

  // Expanded detail fields
  chirpMassEl.textContent = event.chirp_mass_source
    ? `${event.chirp_mass_source.toFixed(1)} M\u2609`
    : "\u2014";

  finalMassEl.textContent = event.final_mass_source
    ? `${event.final_mass_source.toFixed(1)} M\u2609`
    : "\u2014";

  // Energy radiated = (m1 + m2) - final mass
  if (event.final_mass_source > 0) {
    const radiated = event.mass_1_source + event.mass_2_source - event.final_mass_source;
    if (radiated > 0) {
      energyRadiatedEl.textContent = `${radiated.toFixed(1)} M\u2609`;
    } else {
      energyRadiatedEl.textContent = "\u2014";
    }
  } else {
    energyRadiatedEl.textContent = "\u2014";
  }

  chiEffEl.textContent = event.chi_eff != null
    ? (event.chi_eff >= 0 ? "+" : "") + event.chi_eff.toFixed(2)
    : "\u2014";

  redshiftEl.textContent = event.redshift?.toFixed(3) ?? "\u2014";
  snrEl.textContent = event.network_matched_filter_snr.toFixed(1);

  // p_astro confidence badge
  if (event.p_astro > 0) {
    const pVal = event.p_astro;
    pAstroEl.textContent = pVal >= 0.99 ? "> 0.99" : pVal.toFixed(2);
    pAstroEl.className = `pastro-badge ${pVal >= 0.99 ? "high" : pVal >= 0.5 ? "med" : "low"}`;
  } else {
    pAstroEl.textContent = "\u2014";
    pAstroEl.className = "pastro-badge";
  }

  // Catalog
  catalogEl.textContent = event.catalog_shortName
    ? `Catalog: ${event.catalog_shortName}`
    : "";

  document.querySelectorAll(".event-item").forEach((el) => {
    el.classList.toggle(
      "active",
      el.getAttribute("data-name") === event.commonName
    );
  });

  // Update URL without reload
  const url = new URL(window.location.href);
  url.searchParams.set("event", event.commonName);
  history.replaceState(null, "", url.toString());
}

function getFilteredSortedEvents(): GWEvent[] {
  let filtered = events;

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((e) => e.commonName.toLowerCase().includes(q));
  }

  // Type filter
  if (activeTypeFilter !== "all") {
    filtered = filtered.filter((e) => classifyEvent(e) === activeTypeFilter);
  }

  // Sort
  const sorted = [...filtered];
  switch (activeSortKey) {
    case "snr":
      sorted.sort((a, b) => b.network_matched_filter_snr - a.network_matched_filter_snr);
      break;
    case "mass":
      sorted.sort((a, b) => (b.mass_1_source + b.mass_2_source) - (a.mass_1_source + a.mass_2_source));
      break;
    case "distance":
      sorted.sort((a, b) => a.luminosity_distance - b.luminosity_distance);
      break;
    case "date":
      sorted.sort((a, b) => b.GPS - a.GPS);
      break;
  }

  return sorted;
}

function renderEventList() {
  const sorted = getFilteredSortedEvents();
  const displayed = sorted.slice(0, 100);

  // Update count
  const totalLabel = activeTypeFilter === "all"
    ? `${events.length} events`
    : `${sorted.length} of ${events.length} events`;
  eventCountEl.textContent = totalLabel;

  eventListItems.innerHTML = displayed
    .map((e) => {
      const totalMass = (e.mass_1_source + e.mass_2_source).toFixed(0);
      return `<div class="event-item" data-name="${e.commonName}">
        <span>${e.commonName}</span>
        <span class="mass">${totalMass} M\u2609</span>
      </div>`;
    })
    .join("");

  // Re-apply active highlight
  if (currentEvent) {
    eventListItems.querySelectorAll(".event-item").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-name") === currentEvent!.commonName);
    });
  }

  eventListItems.querySelectorAll(".event-item").forEach((el) => {
    el.addEventListener("click", () => {
      const name = el.getAttribute("data-name")!;
      const event = events.find((e) => e.commonName === name);
      if (event) {
        selectEvent(event);
        if (viewMode === "map") setViewMode("event");
        // Close mobile events panel
        eventListEl.classList.remove("mobile-open");
        if (eventsToggleBtn) eventsToggleBtn.textContent = "Events";
      }
    });
  });
}

// ─── Filter & Sort Controls ─────────────────────────────────────────

filterChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    activeTypeFilter = chip.dataset.type!;
    filterChips.forEach((c) => c.classList.toggle("active", c === chip));
    renderEventList();
  });
});

sortSelect.addEventListener("change", () => {
  activeSortKey = sortSelect.value;
  renderEventList();
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  renderEventList();
});

// ─── Help Overlay ───────────────────────────────────────────────────

function toggleHelp() {
  const isShown = helpOverlay.style.display === "block";
  helpOverlay.style.display = isShown ? "none" : "block";
  if (!isShown) {
    // Hide event info when help is shown (they overlap)
    eventInfoEl.style.display = "none";
  } else if (viewMode === "event") {
    eventInfoEl.style.display = "block";
  }
}

helpBtn.addEventListener("click", toggleHelp);
helpCloseBtn.addEventListener("click", toggleHelp);

// ─── About Overlay ──────────────────────────────────────────────────

function toggleAbout() {
  aboutOverlay.classList.toggle("show");
}

brandEl.addEventListener("click", toggleAbout);
aboutCloseBtn.addEventListener("click", toggleAbout);
aboutOverlay.addEventListener("click", (e) => {
  if (e.target === aboutOverlay) toggleAbout();
});

// ─── Tours ──────────────────────────────────────────────────────────

interface TourStep {
  event: string;
  description: string;
}

interface Tour {
  name: string;
  steps: TourStep[];
}

const tours: Tour[] = [
  {
    name: "Greatest Hits",
    steps: [
      {
        event: "GW150914",
        description:
          "The first gravitational wave ever detected. Two black holes, 36 and 29 solar masses, merged 1.3 billion light-years away.",
      },
      {
        event: "GW170817",
        description:
          "The first neutron star merger detected \u2014 and the first event seen in both gravitational waves and light.",
      },
      {
        event: "GW190521",
        description:
          "The heaviest merger observed. Created a 142 solar mass black hole \u2014 the first confirmed intermediate-mass black hole.",
      },
      {
        event: "GW200115",
        description:
          "A neutron star swallowed by a black hole \u2014 confirming these mixed mergers exist.",
      },
      {
        event: "GW190814",
        description:
          "A mystery: the lighter object (2.6 M\u2609) could be the heaviest neutron star or lightest black hole ever found.",
      },
    ],
  },
  {
    name: "Record Breakers",
    steps: [
      {
        event: "GW190521",
        description:
          "The heaviest merger ever observed \u2014 two black holes totaling over 150 solar masses collided to form the first confirmed intermediate-mass black hole.",
      },
      {
        event: "GW190425",
        description:
          "The heaviest binary neutron star system ever detected. At ~3.4 solar masses total, it far exceeds any known neutron star binary in our galaxy.",
      },
      {
        event: "GW190814",
        description:
          "The most asymmetric merger: a 23 solar mass black hole swallowed a 2.6 solar mass mystery object. The mass ratio of ~9:1 broke all previous records.",
      },
      {
        event: "GW150914",
        description:
          "The loudest detection \u2014 with a network SNR of ~24, this was the clearest gravitational wave signal ever recorded, heard across all detectors.",
      },
    ],
  },
  {
    name: "Neutron Stars",
    steps: [
      {
        event: "GW170817",
        description:
          "The landmark multi-messenger event. This neutron star merger was seen in gravitational waves, gamma rays, X-rays, and visible light simultaneously.",
      },
      {
        event: "GW190425",
        description:
          "A heavy neutron star binary \u2014 significantly more massive than any double pulsar system known in our Milky Way.",
      },
      {
        event: "GW200105",
        description:
          "One of the first confirmed neutron star\u2013black hole mergers. A ~9 solar mass black hole consumed a ~1.9 solar mass neutron star.",
      },
      {
        event: "GW200115",
        description:
          "The second confirmed NSBH merger, detected just 10 days after GW200105. Together they proved this class of merger really exists in nature.",
      },
    ],
  },
];

let activeTour: Tour | null = null;
let activeTourStep = 0;
let tourMenuOpen = false;

const tourToggleBtn = document.getElementById("tour-toggle")!;
const tourMenu = document.getElementById("tour-menu")!;
const tourMenuItems = document.getElementById("tour-menu-items")!;
const tourOverlay = document.getElementById("tour-overlay")!;
const tourNameEl = document.getElementById("tour-name")!;
const tourStepCounter = document.getElementById("tour-step-counter")!;
const tourEventName = document.getElementById("tour-event-name")!;
const tourDescription = document.getElementById("tour-description")!;
const tourPrevBtn = document.getElementById("tour-prev-btn") as HTMLButtonElement;
const tourNextBtn = document.getElementById("tour-next-btn") as HTMLButtonElement;
const tourExitBtn = document.getElementById("tour-exit-btn")!;

// Build tour menu items
tourMenuItems.innerHTML = tours
  .map(
    (t, i) =>
      `<button class="tour-option" data-tour-index="${i}">${t.name}<span class="tour-option-count">${t.steps.length} events</span></button>`
  )
  .join("");

tourMenuItems.querySelectorAll(".tour-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    const index = parseInt(btn.getAttribute("data-tour-index")!);
    startTour(index);
  });
});

tourToggleBtn.addEventListener("click", () => {
  if (activeTour) {
    // If a tour is active, exit it
    exitTour();
    return;
  }
  tourMenuOpen = !tourMenuOpen;
  tourMenu.classList.toggle("show", tourMenuOpen);
});

function startTour(tourIndex: number) {
  activeTour = tours[tourIndex];
  activeTourStep = 0;
  tourMenuOpen = false;
  tourMenu.classList.remove("show");

  // Make sure we're in event view
  if (viewMode === "map") setViewMode("event");

  showTourStep();
  tourOverlay.classList.add("show");
}

function showTourStep() {
  if (!activeTour) return;

  const step = activeTour.steps[activeTourStep];
  tourNameEl.textContent = activeTour.name;
  tourStepCounter.textContent = `${activeTourStep + 1} of ${activeTour.steps.length}`;
  tourEventName.textContent = step.event;
  tourDescription.textContent = step.description;

  tourPrevBtn.disabled = activeTourStep === 0;
  tourNextBtn.disabled = activeTourStep === activeTour.steps.length - 1;

  // Select the event in the 3D scene
  const event = events.find((e) => e.commonName === step.event);
  if (event) selectEvent(event);
}

function nextTourStep() {
  if (!activeTour || activeTourStep >= activeTour.steps.length - 1) return;
  activeTourStep++;
  showTourStep();
}

function prevTourStep() {
  if (!activeTour || activeTourStep <= 0) return;
  activeTourStep--;
  showTourStep();
}

function exitTour() {
  activeTour = null;
  activeTourStep = 0;
  tourOverlay.classList.remove("show");
  tourMenu.classList.remove("show");
  tourMenuOpen = false;
}

tourNextBtn.addEventListener("click", nextTourStep);
tourPrevBtn.addEventListener("click", prevTourStep);
tourExitBtn.addEventListener("click", exitTour);

// ─── Onboarding Hints ──────────────────────────────────────────────

function dismissOnboarding() {
  if (onboarding.classList.contains("hidden")) return;
  onboarding.classList.add("hidden");
  setTimeout(() => onboarding.remove(), 800);
  localStorage.setItem("warplab-onboarded", "1");
}

// Show onboarding only on first visit
if (localStorage.getItem("warplab-onboarded")) {
  onboarding.remove();
} else {
  // Dismiss on any click or after 12 seconds
  window.addEventListener("click", dismissOnboarding, { once: true });
  setTimeout(dismissOnboarding, 12000);
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────

window.addEventListener("keydown", (e) => {
  // Don't intercept shortcuts when typing in search
  if (document.activeElement === searchInput) {
    if (e.code === "Escape") {
      searchInput.blur();
      e.preventDefault();
    }
    return;
  }
  if (e.code === "Space") {
    e.preventDefault();
    playBtn.click();
  }
  if (e.code === "KeyS") speedBtn.click();
  if (e.code === "KeyM") mapToggleBtn.click();
  if (e.code === "KeyH") toggleHelp();
  if (e.code === "KeyP") takeScreenshot();
  if (e.code === "Escape") {
    if (helpOverlay.style.display === "block") toggleHelp();
    if (aboutOverlay.classList.contains("show")) toggleAbout();
    dismissOnboarding();
  }
  if (e.code === "Slash") {
    e.preventDefault();
    searchInput.focus();
  }
});

// ─── Intro Zoom Animation ────────────────────────────────────────────

let introProgress = 0;
let introActive = false;
const introStartPos = new THREE.Vector3(12, 16, 28);
const introEndPos = new THREE.Vector3(3, 4, 7);
const introDuration = 2.0; // seconds

function startIntroZoom() {
  introActive = true;
  introProgress = 0;
  camera.position.copy(introStartPos);
  // Start with canvas fully transparent, fade in
  renderer.domElement.style.opacity = "0";
  renderer.domElement.style.transition = "opacity 0.8s ease";
  requestAnimationFrame(() => {
    renderer.domElement.style.opacity = "1";
  });
}

function updateIntroZoom(delta: number) {
  if (!introActive) return;
  introProgress += delta / introDuration;
  if (introProgress >= 1) {
    introProgress = 1;
    introActive = false;
    camera.position.copy(introEndPos);
    return;
  }
  // Ease-out cubic
  const t = 1 - Math.pow(1 - introProgress, 3);
  camera.position.lerpVectors(introStartPos, introEndPos, t);
}

// ─── Render Loop ─────────────────────────────────────────────────────

const clock = new THREE.Clock();
let elapsedTotal = 0;

function animate() {
  const delta = clock.getDelta();
  elapsedTotal += delta;

  updateIntroZoom(delta);

  if (viewMode === "event") {
    // Advance playback
    if (isPlaying && currentWaveform) {
      playbackTime += (delta * playbackSpeed) / currentWaveform.duration;
      if (playbackTime >= 1.0) {
        playbackTime = 1.0;
        isPlaying = false;
        audio.stop();
        playBtn.innerHTML = "&#9654;";
      }
    }

    spacetimeMaterial.uniforms.uTime.value = playbackTime;

    if (currentWaveform && currentEvent) {
      binary.update(playbackTime, currentWaveform, currentEvent);
    }

    // Merger glow + bloom
    if (currentWaveform) {
      const mergerNorm = currentWaveform.peakIndex / currentWaveform.hPlus.length;
      const distFromMerger = Math.abs(playbackTime - mergerNorm);
      const glowIntensity = Math.max(0, 1 - distFromMerger * 8);
      glowMaterial.opacity = glowIntensity * 0.9;
      mergerGlow.scale.setScalar(1 + glowIntensity * 3);
      bloom.intensity = 1.2 + glowIntensity * 3;
    }

    // Subtle camera drift
    if (!isPlaying) {
      camera.position.x += Math.sin(elapsedTotal * 0.1) * 0.002;
      camera.position.y += Math.cos(elapsedTotal * 0.07) * 0.001;
    }

    // Update slider + label
    timeSlider.value = String(Math.floor(playbackTime * 1000));
    if (currentWaveform) {
      timeLabel.textContent = `${(playbackTime * currentWaveform.duration).toFixed(2)}s`;
    }
  } else {
    // Map view: gentle rotation
    bloom.intensity = 1.8;
  }

  controls.update();

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
});

// ─── Init ────────────────────────────────────────────────────────────

async function init() {
  try {
    loadingStatus.textContent = "Fetching event catalog from GWOSC...";
    events = await fetchEventCatalog();

    loadingStatus.textContent = `${events.length} events loaded. Preparing...`;

    // Populate universe map
    universeMap.populate(events);

    renderEventList();

    // Check URL for deep link
    const urlEvent = new URLSearchParams(window.location.search).get("event");
    const target = urlEvent
      ? events.find((e) => e.commonName === urlEvent)
      : events.find((e) => e.commonName === "GW150914");

    if (target) {
      selectEvent(target);
    } else if (events.length > 0) {
      selectEvent(events[0]);
    }

    eventName.textContent = currentEvent?.commonName ?? "No events loaded";

    // Fade out loading screen and start intro zoom
    loadingScreen.classList.add("fade-out");
    setTimeout(() => loadingScreen.remove(), 700);
    startIntroZoom();
  } catch (err) {
    console.error("Failed to load event catalog:", err);
    loadingStatus.textContent = "Failed to connect. Using offline data...";
    eventName.textContent = "Failed to load catalog";

    const fallback: GWEvent = {
      commonName: "GW150914 (offline)",
      GPS: 1126259462.4,
      mass_1_source: 35.6,
      mass_1_source_lower: -3.0,
      mass_1_source_upper: 4.8,
      mass_2_source: 30.6,
      mass_2_source_lower: -4.4,
      mass_2_source_upper: 3.0,
      luminosity_distance: 440,
      luminosity_distance_lower: -170,
      luminosity_distance_upper: 150,
      redshift: 0.09,
      chi_eff: -0.01,
      network_matched_filter_snr: 24,
      far: 1e-7,
      catalog_shortName: "GWTC-1",
      total_mass_source: 66.2,
      chirp_mass_source: 28.3,
      chirp_mass_source_lower: -1.5,
      chirp_mass_source_upper: 1.7,
      final_mass_source: 62.3,
      final_mass_source_lower: -3.1,
      final_mass_source_upper: 3.7,
      p_astro: 1.0,
      mapPosition: new THREE.Vector3(3, 1, 2),
    };
    events = [fallback];
    universeMap.populate(events);
    selectEvent(fallback);
    renderEventList();

    loadingScreen.classList.add("fade-out");
    setTimeout(() => loadingScreen.remove(), 700);
    startIntroZoom();
  }
}

init();
