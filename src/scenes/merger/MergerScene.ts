import * as THREE from "three";
import type { Scene, SceneContext } from "../types";
import {
  fetchEventCatalog,
  generateWaveform,
  waveformToTexture,
  classifyEvent,
  type GWEvent,
  type WaveformData,
} from "../../lib/waveform";
import { GWAudioEngine } from "../../lib/audio";
import { BinarySystem } from "../../lib/binary";
import { UniverseMap } from "../../lib/universe-map";
import { VRPanel } from "../../lib/VRPanel";
import { getViewMode, onViewModeChange, type ViewMode } from "../../lib/view-mode";
import { performExport } from "../../lib/export";
import { mergerEquations } from "../../lib/equation-data";
import { buildEquationsSection, updateEquationValues, removeEquationsSection } from "../../lib/equations";
import vertexShader from "../../shaders/spacetime.vert.glsl?raw";
import fragmentShader from "../../shaders/spacetime.frag.glsl?raw";

// ─── Tour types ──────────────────────────────────────────────────────

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
      { event: "GW150914", description: "The first gravitational wave ever detected. Two black holes, 36 and 29 solar masses, merged 1.3 billion light-years away." },
      { event: "GW170817", description: "The first neutron star merger detected \u2014 and the first event seen in both gravitational waves and light." },
      { event: "GW190521", description: "The heaviest merger observed. Created a 142 solar mass black hole \u2014 the first confirmed intermediate-mass black hole." },
      { event: "GW200115", description: "A neutron star swallowed by a black hole \u2014 confirming these mixed mergers exist." },
      { event: "GW190814", description: "A mystery: the lighter object (2.6 M\u2609) could be the heaviest neutron star or lightest black hole ever found." },
    ],
  },
  {
    name: "Record Breakers",
    steps: [
      { event: "GW190521", description: "The heaviest merger ever observed \u2014 two black holes totaling over 150 solar masses collided to form the first confirmed intermediate-mass black hole." },
      { event: "GW190425", description: "The heaviest binary neutron star system ever detected. At ~3.4 solar masses total, it far exceeds any known neutron star binary in our galaxy." },
      { event: "GW190814", description: "The most asymmetric merger: a 23 solar mass black hole swallowed a 2.6 solar mass mystery object. The mass ratio of ~9:1 broke all previous records." },
      { event: "GW150914", description: "The loudest detection \u2014 with a network SNR of ~24, this was the clearest gravitational wave signal ever recorded, heard across all detectors." },
    ],
  },
  {
    name: "Neutron Stars",
    steps: [
      { event: "GW170817", description: "The landmark multi-messenger event. This neutron star merger was seen in gravitational waves, gamma rays, X-rays, and visible light simultaneously." },
      { event: "GW190425", description: "A heavy neutron star binary \u2014 significantly more massive than any double pulsar system known in our Milky Way." },
      { event: "GW200105", description: "One of the first confirmed neutron star\u2013black hole mergers. A ~9 solar mass black hole consumed a ~1.9 solar mass neutron star." },
      { event: "GW200115", description: "The second confirmed NSBH merger, detected just 10 days after GW200105. Together they proved this class of merger really exists in nature." },
    ],
  },
];

export class MergerScene implements Scene {
  readonly id = "merger";
  readonly label = "Merger";
  readonly supportsXR = true;

  private ctx!: SceneContext;

  // Three.js objects
  private eventViewGroup = new THREE.Group();
  private spacetimeMaterial!: THREE.ShaderMaterial;
  private binary = new BinarySystem();
  private mergerGlow!: THREE.Mesh;
  private glowMaterial!: THREE.MeshBasicMaterial;
  private stars!: THREE.Points;
  private universeMap = new UniverseMap();

  // State
  private events: GWEvent[] = [];
  private currentEvent: GWEvent | null = null;
  private currentWaveform: WaveformData | null = null;
  private playbackTime = 0;
  private isPlaying = false;
  private playbackSpeed = 1.0;
  private viewMode: "event" | "map" = "event";
  private audio = new GWAudioEngine();
  private mouse = new THREE.Vector2();

  // UI elements (cached)
  private playBtn!: HTMLElement;
  private timeSlider!: HTMLInputElement;
  private timeLabel!: HTMLElement;
  private speedBtn!: HTMLElement;
  private speedLabel!: HTMLElement;
  private eventName!: HTMLElement;
  private massesEl!: HTMLElement;
  private distanceEl!: HTMLElement;
  private typeBadgeEl!: HTMLElement;
  private chirpMassEl!: HTMLElement;
  private finalMassEl!: HTMLElement;
  private energyRadiatedEl!: HTMLElement;
  private chiEffEl!: HTMLElement;
  private redshiftEl!: HTMLElement;
  private snrEl!: HTMLElement;
  private pAstroEl!: HTMLElement;
  private catalogEl!: HTMLElement;
  private eventListItems!: HTMLElement;
  private mapToggleBtn!: HTMLElement;
  private eventCountEl!: HTMLElement;
  private timeControlsEl!: HTMLElement;
  private eventInfoEl!: HTMLElement;
  private mapLegendEl!: HTMLElement;
  private helpOverlay!: HTMLElement;
  private helpBtn!: HTMLElement;
  private helpCloseBtn!: HTMLElement;
  private sortSelect!: HTMLSelectElement;
  private filterChips!: NodeListOf<HTMLButtonElement>;
  private searchInput!: HTMLInputElement;
  private loadingScreen!: HTMLElement;
  private loadingStatus!: HTMLElement;
  private mapTooltip!: HTMLElement;
  private onboarding!: HTMLElement;
  private aboutOverlay!: HTMLElement;
  private aboutCloseBtn!: HTMLElement;
  private brandEl!: HTMLElement;
  private screenshotBtn!: HTMLElement;
  private eventsToggleBtn!: HTMLElement | null;
  private eventListEl!: HTMLElement;
  private shareBtn!: HTMLElement;
  private shareToast!: HTMLElement;
  private exportBtn!: HTMLElement;
  private exportBtnLabel!: HTMLElement;
  private exportToast!: HTMLElement;

  // Filter/sort state
  private activeTypeFilter = "all";
  private activeSortKey = "snr";
  private searchQuery = "";

  // Tour state
  private activeTour: Tour | null = null;
  private activeTourStep = 0;
  private tourMenuOpen = false;
  private tourToggleBtn!: HTMLElement;
  private tourMenu!: HTMLElement;
  private tourMenuItems!: HTMLElement;
  private tourOverlay!: HTMLElement;
  private tourNameEl!: HTMLElement;
  private tourStepCounter!: HTMLElement;
  private tourEventName!: HTMLElement;
  private tourDescription!: HTMLElement;
  private tourPrevBtn!: HTMLButtonElement;
  private tourNextBtn!: HTMLButtonElement;
  private tourExitBtn!: HTMLElement;

  // Speed control
  private speeds = [0.25, 0.5, 1, 2, 4];
  private speedIndex = 2;

  // Share
  private shareToastTimer: ReturnType<typeof setTimeout> | null = null;

  // VR panel
  private vrPanel: VRPanel | null = null;

  private unsubViewMode: (() => void) | null = null;

  // Intro animation
  private introProgress = 0;
  private introActive = false;
  private introStartPos = new THREE.Vector3(12, 16, 28);
  private introEndPos = new THREE.Vector3(3, 4, 7);
  private introDuration = 2.0;

  // Cleanup
  private boundHandlers: { el: EventTarget; type: string; fn: EventListener }[] = [];
  private initialized = false;

  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;
    const { scene, camera, controls } = ctx;
    const firstInit = !this.initialized;

    // ─── Cache DOM elements (only once — they live in app.html) ───
    if (firstInit) {
      this.playBtn = document.getElementById("play-btn")!;
      this.timeSlider = document.getElementById("time-slider") as HTMLInputElement;
      this.timeLabel = document.getElementById("time-label")!;
      this.speedBtn = document.getElementById("speed-btn")!;
      this.speedLabel = document.getElementById("speed-label")!;
      this.eventName = document.getElementById("event-name")!;
      this.massesEl = document.getElementById("masses")!;
      this.distanceEl = document.getElementById("distance")!;
      this.typeBadgeEl = document.getElementById("type-badge")!;
      this.chirpMassEl = document.getElementById("chirp-mass")!;
      this.finalMassEl = document.getElementById("final-mass")!;
      this.energyRadiatedEl = document.getElementById("energy-radiated")!;
      this.chiEffEl = document.getElementById("chi-eff")!;
      this.redshiftEl = document.getElementById("redshift")!;
      this.snrEl = document.getElementById("snr")!;
      this.pAstroEl = document.getElementById("p-astro")!;
      this.catalogEl = document.getElementById("catalog-name")!;
      this.eventListItems = document.getElementById("event-list-items")!;
      this.mapToggleBtn = document.getElementById("map-toggle")!;
      this.eventCountEl = document.getElementById("event-count")!;
      this.timeControlsEl = document.getElementById("time-controls")!;
      this.eventInfoEl = document.getElementById("event-info")!;
      this.mapLegendEl = document.getElementById("map-legend")!;
      this.helpOverlay = document.getElementById("help-overlay")!;
      this.helpBtn = document.getElementById("help-btn")!;
      this.helpCloseBtn = document.getElementById("help-close")!;
      this.sortSelect = document.getElementById("sort-select") as HTMLSelectElement;
      this.filterChips = document.querySelectorAll<HTMLButtonElement>(".filter-chip");
      this.searchInput = document.getElementById("search-input") as HTMLInputElement;
      this.loadingScreen = document.getElementById("loading-screen")!;
      this.loadingStatus = document.getElementById("loading-status")!;
      this.mapTooltip = document.getElementById("map-tooltip")!;
      this.onboarding = document.getElementById("onboarding")!;
      this.aboutOverlay = document.getElementById("about-overlay")!;
      this.aboutCloseBtn = document.getElementById("about-close")!;
      this.brandEl = document.getElementById("brand")!;
      this.screenshotBtn = document.getElementById("screenshot-btn")!;
      this.eventsToggleBtn = document.getElementById("events-toggle");
      this.eventListEl = document.getElementById("event-list")!;
      this.shareBtn = document.getElementById("share-btn")!;
      this.shareToast = document.getElementById("share-toast")!;
      this.exportBtn = document.getElementById("export-btn")!;
      this.exportBtnLabel = document.getElementById("export-btn-label")!;
      this.exportToast = document.getElementById("export-toast")!;
      this.tourToggleBtn = document.getElementById("tour-toggle")!;
      this.tourMenu = document.getElementById("tour-menu")!;
      this.tourMenuItems = document.getElementById("tour-menu-items")!;
      this.tourOverlay = document.getElementById("tour-overlay")!;
      this.tourNameEl = document.getElementById("tour-name")!;
      this.tourStepCounter = document.getElementById("tour-step-counter")!;
      this.tourEventName = document.getElementById("tour-event-name")!;
      this.tourDescription = document.getElementById("tour-description")!;
      this.tourPrevBtn = document.getElementById("tour-prev-btn") as HTMLButtonElement;
      this.tourNextBtn = document.getElementById("tour-next-btn") as HTMLButtonElement;
      this.tourExitBtn = document.getElementById("tour-exit-btn")!;
    }

    // ─── Build 3D objects (only first time — re-add on subsequent inits) ───
    if (firstInit) {
      this.buildSceneObjects(scene);
    } else {
      // Re-add objects that dispose() removed from scene
      scene.add(this.eventViewGroup);
      scene.add(this.stars);
      scene.add(this.universeMap.group);
    }

    // ─── Setup UI event handlers ───
    this.setupEventHandlers(ctx);

    // ─── Subscribe to view mode changes for live panel updates ───
    if (!this.unsubViewMode) {
      this.unsubViewMode = onViewModeChange((mode) => {
        this.updateExportVisibility();
        this.applyInfoPanelModeGating(mode);
        this.updateInfoPanelValues();
        this.applyControlsModeGating(mode);
        this.renderEventList();
        this.ensureEquationsSection(mode);
      });
    }

    // ─── First-time only setup ───
    if (firstInit) {
      // Onboarding
      const onboardingEl = document.getElementById("onboarding");
      if (onboardingEl) {
        if (localStorage.getItem("warplab-onboarded")) {
          onboardingEl.remove();
        } else {
          window.addEventListener("click", () => this.dismissOnboarding(), { once: true });
          setTimeout(() => this.dismissOnboarding(), 12000);
        }
      }

      // Build tour menu
      this.buildTourMenu();
    }

    // ─── Show all merger-specific UI ───
    this.eventInfoEl.style.display = "block";
    this.eventListEl.style.display = "";
    this.timeControlsEl.style.display = "flex";
    this.mapToggleBtn.style.display = "";
    this.mapTooltip.style.display = "none";
    this.mapLegendEl.style.display = "none";
    this.helpOverlay.style.display = "none";
    const uiEl = document.getElementById("ui");
    if (uiEl) uiEl.style.display = "flex";
    this.updateExportVisibility();

    // Apply initial mode gating
    const initMode = getViewMode();
    this.applyInfoPanelModeGating(initMode);
    this.applyControlsModeGating(initMode);

    // ─── Load data (only first time) ───
    if (firstInit) {
      await this.loadEventCatalog();
      this.initialized = true;
    } else {
      // Re-entering: re-select current event to refresh UI state
      if (this.currentEvent) {
        this.selectEvent(this.currentEvent);
      }
      this.renderEventList();
    }

    // ─── VR Panel ───
    if (ctx.xrManager && !this.vrPanel) {
      this.setupVRPanel(ctx);
    }

    // ─── Camera setup ───
    camera.position.set(3, 4, 7);
    camera.lookAt(0, 0.5, 0);
    controls.target.set(0, 0.5, 0);
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.minDistance = 2;
    controls.maxDistance = 25;
    controls.enabled = true;

    scene.fog = new THREE.FogExp2(0x000005, 0.04);
  }

  private setupVRPanel(ctx: SceneContext) {
    const xr = ctx.xrManager!;
    this.vrPanel = new VRPanel(1.4, 0.5);
    this.vrPanel.setTitle(this.currentEvent?.commonName ?? "Merger");

    // Button layout: 4 buttons in a row
    const btnY = 0.55;
    const btnH = 0.35;
    const btnW = 0.22;
    const gap = 0.02;
    const startX = 0.04;

    this.vrPanel.addButton({
      label: this.isPlaying ? "\u23F8" : "\u25B6",
      x: startX,
      y: btnY,
      w: btnW,
      h: btnH,
      onClick: () => {
        this.playBtn.click();
      },
    });

    this.vrPanel.addButton({
      label: `${this.playbackSpeed}x`,
      x: startX + btnW + gap,
      y: btnY,
      w: btnW,
      h: btnH,
      onClick: () => {
        this.speedBtn.click();
      },
    });

    this.vrPanel.addButton({
      label: "\u2190 Prev",
      x: startX + (btnW + gap) * 2,
      y: btnY,
      w: btnW,
      h: btnH,
      onClick: () => {
        const events = this.getFilteredSortedEvents();
        if (!this.currentEvent || events.length === 0) return;
        const idx = events.findIndex((e) => e.commonName === this.currentEvent!.commonName);
        const prev = events[(idx - 1 + events.length) % events.length];
        this.selectEvent(prev);
      },
    });

    this.vrPanel.addButton({
      label: "Next \u2192",
      x: startX + (btnW + gap) * 3,
      y: btnY,
      w: btnW,
      h: btnH,
      onClick: () => {
        const events = this.getFilteredSortedEvents();
        if (!this.currentEvent || events.length === 0) return;
        const idx = events.findIndex((e) => e.commonName === this.currentEvent!.commonName);
        const next = events[(idx + 1) % events.length];
        this.selectEvent(next);
      },
    });

    xr.registerPanel(this.vrPanel);

    xr.onSessionStart = () => {
      if (this.vrPanel) {
        this.vrPanel.positionInFront(ctx.camera, 2, -0.3);
        ctx.scene.add(this.vrPanel.mesh);
      }
    };

    xr.onSessionEnd = () => {
      if (this.vrPanel) {
        ctx.scene.remove(this.vrPanel.mesh);
      }
    };

    // If already in VR (scene switch mid-session), show panel immediately
    if (xr.isPresenting && this.vrPanel) {
      this.vrPanel.positionInFront(ctx.camera, 2, -0.3);
      ctx.scene.add(this.vrPanel.mesh);
    }
  }

  private buildSceneObjects(scene: THREE.Scene) {
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

    this.spacetimeMaterial = new THREE.ShaderMaterial({
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
    this.eventViewGroup.add(new THREE.Mesh(spacetimeGeometry, this.spacetimeMaterial));

    // Binary system
    this.eventViewGroup.add(this.binary.group);

    // Merger glow
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x6366f1, transparent: true, opacity: 0,
    });
    this.mergerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 32, 32), this.glowMaterial
    );
    this.mergerGlow.position.set(0, 0.6, 0);
    this.eventViewGroup.add(this.mergerGlow);

    this.eventViewGroup.add(new THREE.AmbientLight(0x404060, 0.4));

    scene.add(this.eventViewGroup);

    // Ambient stars
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
    this.stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(this.stars);

    // Universe map
    scene.add(this.universeMap.group);
    this.universeMap.onSelectEvent = (event) => {
      this.selectEvent(event);
      this.setViewMode("event");
    };
  }

  private addHandler(el: EventTarget, type: string, fn: EventListener) {
    el.addEventListener(type, fn);
    this.boundHandlers.push({ el, type, fn });
  }

  private setupEventHandlers(ctx: SceneContext) {
    const { renderer, camera } = ctx;

    // Play/pause
    this.addHandler(this.playBtn, "click", () => {
      if (!this.currentWaveform) return;
      if (this.isPlaying) {
        this.isPlaying = false;
        this.audio.stop();
        this.playBtn.innerHTML = "&#9654;";
        this.vrPanel?.updateButton(0, "\u25B6");
      } else {
        this.isPlaying = true;
        if (this.playbackTime >= 0.99) {
          this.playbackTime = 0;
          this.binary.reset();
        }
        this.audio.play(this.playbackTime, this.playbackSpeed);
        this.playBtn.innerHTML = "&#9646;&#9646;";
        this.vrPanel?.updateButton(0, "\u23F8");
      }
    });

    // Time slider
    this.addHandler(this.timeSlider, "input", () => {
      this.playbackTime = parseInt(this.timeSlider.value) / 1000;
      this.binary.reset();
      if (this.isPlaying) {
        this.audio.play(this.playbackTime, this.playbackSpeed);
      }
    });

    // Speed
    this.addHandler(this.speedBtn, "click", () => {
      this.speedIndex = (this.speedIndex + 1) % this.speeds.length;
      this.playbackSpeed = this.speeds[this.speedIndex];
      this.speedLabel.textContent = `${this.playbackSpeed}x`;
      this.audio.setSpeed(this.playbackSpeed);
      this.vrPanel?.updateButton(1, `${this.playbackSpeed}x`);
    });

    // Map toggle
    this.addHandler(this.mapToggleBtn, "click", () => {
      this.setViewMode(this.viewMode === "event" ? "map" : "event");
    });

    // Map click
    this.addHandler(renderer.domElement, "click", ((e: MouseEvent) => {
      if (this.viewMode !== "map") return;
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      const hit = this.universeMap.raycast(this.mouse, camera);
      if (hit) {
        this.selectEvent(hit);
        this.setViewMode("event");
      }
    }) as EventListener);

    // Map hover + tooltip
    this.addHandler(renderer.domElement, "mousemove", ((e: MouseEvent) => {
      if (this.viewMode !== "map") return;
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      const hit = this.universeMap.raycast(this.mouse, camera);
      renderer.domElement.style.cursor = hit ? "pointer" : "default";
      if (hit) {
        const tooltipMode = getViewMode();
        let tooltipHTML = `<span class="tooltip-name">${hit.commonName}</span>`;
        if (tooltipMode !== "explorer") {
          const type = classifyEvent(hit);
          const dist = hit.luminosity_distance.toFixed(0);
          tooltipHTML += `<span class="tooltip-detail">${type} &middot; ${dist} Mpc</span>`;
        }
        if (tooltipMode === "researcher") {
          const snr = hit.network_matched_filter_snr.toFixed(1);
          const pVal = hit.p_astro;
          const pStr = pVal >= 0.99 ? ">0.99" : pVal > 0 ? pVal.toFixed(2) : "";
          tooltipHTML += `<span class="tooltip-detail">SNR ${snr}${pStr ? ` · p<sub>astro</sub>=${pStr}` : ""}</span>`;
        }
        this.mapTooltip.innerHTML = tooltipHTML;
        this.mapTooltip.style.display = "block";
        this.mapTooltip.style.left = `${e.clientX + 14}px`;
        this.mapTooltip.style.top = `${e.clientY - 10}px`;
      } else {
        this.mapTooltip.style.display = "none";
      }
    }) as EventListener);

    // Screenshot
    this.addHandler(this.screenshotBtn, "click", () => this.takeScreenshot());

    // Mobile events panel toggle
    if (this.eventsToggleBtn) {
      this.addHandler(this.eventsToggleBtn, "click", () => {
        const isOpen = this.eventListEl.classList.toggle("mobile-open");
        this.eventsToggleBtn!.textContent = isOpen ? "Close" : "Events";
      });
    }

    // Share
    this.addHandler(this.shareBtn, "click", () => this.handleShare());

    // Export
    this.addHandler(this.exportBtn, "click", () => this.handleExport());

    // Filter chips
    this.filterChips.forEach((chip) => {
      this.addHandler(chip, "click", () => {
        this.activeTypeFilter = chip.dataset.type!;
        this.filterChips.forEach((c) => c.classList.toggle("active", c === chip));
        this.renderEventList();
      });
    });

    // Sort
    this.addHandler(this.sortSelect, "change", () => {
      this.activeSortKey = this.sortSelect.value;
      this.renderEventList();
    });

    // Search
    this.addHandler(this.searchInput, "input", () => {
      this.searchQuery = this.searchInput.value.trim();
      this.renderEventList();
    });

    // Help
    this.addHandler(this.helpBtn, "click", () => this.toggleHelp());
    this.addHandler(this.helpCloseBtn, "click", () => this.toggleHelp());

    // About
    this.addHandler(this.brandEl, "click", () => this.toggleAbout());
    this.addHandler(this.aboutCloseBtn, "click", () => this.toggleAbout());
    this.addHandler(this.aboutOverlay, "click", ((e: Event) => {
      if (e.target === this.aboutOverlay) this.toggleAbout();
    }) as EventListener);

    // Tour buttons
    this.addHandler(this.tourToggleBtn, "click", () => {
      if (this.activeTour) {
        this.exitTour();
        return;
      }
      this.tourMenuOpen = !this.tourMenuOpen;
      this.tourMenu.classList.toggle("show", this.tourMenuOpen);
    });
    this.addHandler(this.tourNextBtn, "click", () => this.nextTourStep());
    this.addHandler(this.tourPrevBtn, "click", () => this.prevTourStep());
    this.addHandler(this.tourExitBtn, "click", () => this.exitTour());

    // Keyboard shortcuts
    this.addHandler(window, "keydown", ((e: KeyboardEvent) => {
      if (document.activeElement === this.searchInput) {
        if (e.code === "Escape") {
          this.searchInput.blur();
          e.preventDefault();
        }
        return;
      }
      if (e.code === "Space") { e.preventDefault(); this.playBtn.click(); }
      if (e.code === "KeyS") this.speedBtn.click();
      if (e.code === "KeyM") this.mapToggleBtn.click();
      if (e.code === "KeyH") this.toggleHelp();
      if (e.code === "KeyP") this.takeScreenshot();
      if (e.code === "Escape") {
        if (this.helpOverlay.style.display === "block") this.toggleHelp();
        if (this.aboutOverlay.classList.contains("show")) this.toggleAbout();
        this.dismissOnboarding();
      }
      if (e.code === "Slash") { e.preventDefault(); this.searchInput.focus(); }
    }) as EventListener);

  }

  // ─── View mode ──────────────────────────────────────────────────────

  private setViewMode(mode: "event" | "map") {
    this.viewMode = mode;
    const { camera, controls } = this.ctx;

    if (mode === "event") {
      this.eventViewGroup.visible = true;
      this.universeMap.hide();
      this.ctx.scene.fog = new THREE.FogExp2(0x000005, 0.04);
      camera.position.set(3, 4, 7);
      controls.target.set(0, 0.5, 0);
      controls.minDistance = 2;
      controls.maxDistance = 25;
      this.timeControlsEl.style.display = "flex";
      this.eventInfoEl.style.display = "block";
      this.mapLegendEl.style.display = "none";
      this.mapToggleBtn.textContent = "Universe Map";
      this.mapTooltip.style.display = "none";
      this.updateExportVisibility();
    } else {
      this.eventViewGroup.visible = false;
      this.universeMap.show();
      this.ctx.scene.fog = new THREE.FogExp2(0x000005, 0.008);
      camera.position.set(15, 12, 20);
      controls.target.set(0, 0, 0);
      controls.minDistance = 2;
      controls.maxDistance = 120;
      this.isPlaying = false;
      this.audio.stop();
      this.playBtn.innerHTML = "&#9654;";
      this.vrPanel?.updateButton(0, "\u25B6");
      this.timeControlsEl.style.display = "none";
      this.eventInfoEl.style.display = "none";
      this.helpOverlay.style.display = "none";
      this.mapLegendEl.style.display = "block";
      this.mapToggleBtn.textContent = "Back to Event";
    }
    controls.update();
  }

  // ─── View-mode gating helpers ────────────────────────────────────────

  /** Format a value with ± uncertainty for researcher mode */
  private formatWithUncertainty(value: number, lower: number, upper: number, decimals: number, unit: string): string {
    const v = value.toFixed(decimals);
    const lo = Math.abs(lower).toFixed(decimals);
    const hi = Math.abs(upper).toFixed(decimals);
    return `${v} <span class="uncertainty">+${hi}/−${lo}</span> ${unit}`;
  }

  /** Apply mode-gating to sonification controls */
  private applyControlsModeGating(mode: ViewMode): void {
    // Explorer: play/pause only — hide speed button/label
    this.speedBtn.style.display = mode === "explorer" ? "none" : "";
    this.speedLabel.style.display = mode === "explorer" ? "none" : "";
  }

  /** Apply mode-gating to the info panel elements */
  private applyInfoPanelModeGating(mode: ViewMode): void {
    // Explorer: hide type badge, divider, all detail rows, catalog
    const showStudent = mode !== "explorer";
    this.typeBadgeEl.style.display = showStudent ? "" : "none";
    const dividers = this.eventInfoEl.querySelectorAll<HTMLElement>(".info-divider");
    dividers.forEach((d) => (d.style.display = showStudent ? "" : "none"));
    const details = this.eventInfoEl.querySelectorAll<HTMLElement>(".info-detail");
    details.forEach((d) => (d.style.display = showStudent ? "" : "none"));
    const catalog = this.eventInfoEl.querySelector<HTMLElement>(".info-catalog");
    if (catalog) catalog.style.display = showStudent ? "" : "none";
  }

  /** Build or rebuild the equations section inside the info panel */
  private async ensureEquationsSection(mode: ViewMode): Promise<void> {
    const panelBody = this.eventInfoEl.querySelector<HTMLElement>(".panel-body");
    if (!panelBody) return;

    // Remove existing equations
    removeEquationsSection(panelBody);

    if (mode === "explorer" || !this.currentEvent) return;

    const event = this.currentEvent;
    const values: Record<string, number> = {
      m1: event.mass_1_source,
      m2: event.mass_2_source,
      distance: event.luminosity_distance,
      finalMass: event.final_mass_source ?? 0,
    };

    const section = await buildEquationsSection(mergerEquations, mode, values);
    if (section) panelBody.appendChild(section);
  }

  /** Update info panel values to reflect the current mode (uncertainties for researcher) */
  private updateInfoPanelValues(): void {
    const event = this.currentEvent;
    if (!event) return;
    const mode = getViewMode();

    if (mode === "researcher") {
      this.massesEl.innerHTML = this.formatWithUncertainty(
        event.mass_1_source, event.mass_1_source_lower, event.mass_1_source_upper, 1, "M☉"
      ) + " + " + this.formatWithUncertainty(
        event.mass_2_source, event.mass_2_source_lower, event.mass_2_source_upper, 1, "M☉"
      );

      this.distanceEl.innerHTML = this.formatWithUncertainty(
        event.luminosity_distance, event.luminosity_distance_lower, event.luminosity_distance_upper, 0, "Mpc"
      );

      this.chirpMassEl.innerHTML = event.chirp_mass_source
        ? this.formatWithUncertainty(event.chirp_mass_source, event.chirp_mass_source_lower, event.chirp_mass_source_upper, 1, "M☉")
        : "—";

      this.finalMassEl.innerHTML = event.final_mass_source
        ? this.formatWithUncertainty(event.final_mass_source, event.final_mass_source_lower, event.final_mass_source_upper, 1, "M☉")
        : "—";
    } else {
      this.massesEl.textContent = `${event.mass_1_source.toFixed(1)} + ${event.mass_2_source.toFixed(1)} M☉`;
      this.distanceEl.textContent = `${event.luminosity_distance.toFixed(0)} Mpc`;
      this.chirpMassEl.textContent = event.chirp_mass_source
        ? `${event.chirp_mass_source.toFixed(1)} M☉` : "—";
      this.finalMassEl.textContent = event.final_mass_source
        ? `${event.final_mass_source.toFixed(1)} M☉` : "—";
    }
  }

  // ─── Event selection ────────────────────────────────────────────────

  private selectEvent(event: GWEvent) {
    this.currentEvent = event;
    this.currentWaveform = generateWaveform(event);

    const texture = waveformToTexture(this.currentWaveform);
    this.spacetimeMaterial.uniforms.uWaveform.value = texture;

    const snrScale = Math.min(event.network_matched_filter_snr / 15, 3);
    this.spacetimeMaterial.uniforms.uAmplitude.value = 1.2 + snrScale * 0.6;

    this.playbackTime = 0;
    this.isPlaying = false;
    this.audio.stop();
    this.audio.prepare(this.currentWaveform);
    this.playBtn.innerHTML = "&#9654;";
    this.binary.reset();
    this.binary.setEventType(event);

    // Update UI
    this.vrPanel?.setTitle(event.commonName);
    this.eventName.textContent = event.commonName;

    const type = classifyEvent(event);
    const typeLabels: Record<string, string> = {
      BBH: "Binary Black Hole",
      BNS: "Binary Neutron Star",
      NSBH: "Neutron Star \u2013 Black Hole",
    };
    this.typeBadgeEl.textContent = typeLabels[type] ?? type;
    this.typeBadgeEl.className = `type-badge ${type.toLowerCase()}`;

    if (event.final_mass_source > 0) {
      const radiated = event.mass_1_source + event.mass_2_source - event.final_mass_source;
      this.energyRadiatedEl.textContent = radiated > 0 ? `${radiated.toFixed(1)} M\u2609` : "\u2014";
    } else {
      this.energyRadiatedEl.textContent = "\u2014";
    }

    this.chiEffEl.textContent = event.chi_eff != null
      ? (event.chi_eff >= 0 ? "+" : "") + event.chi_eff.toFixed(2) : "\u2014";

    this.redshiftEl.textContent = event.redshift?.toFixed(3) ?? "\u2014";
    this.snrEl.textContent = event.network_matched_filter_snr.toFixed(1);

    if (event.p_astro > 0) {
      const pVal = event.p_astro;
      this.pAstroEl.textContent = pVal >= 0.99 ? "> 0.99" : pVal.toFixed(2);
      this.pAstroEl.className = `pastro-badge ${pVal >= 0.99 ? "high" : pVal >= 0.5 ? "med" : "low"}`;
    } else {
      this.pAstroEl.textContent = "\u2014";
      this.pAstroEl.className = "pastro-badge";
    }

    this.catalogEl.textContent = event.catalog_shortName
      ? `Catalog: ${event.catalog_shortName}` : "";

    // Apply mode-dependent rendering
    const mode = getViewMode();
    this.updateInfoPanelValues();
    this.applyInfoPanelModeGating(mode);
    this.applyControlsModeGating(mode);

    // Update equations with current event values
    this.ensureEquationsSection(mode);

    document.querySelectorAll(".event-item").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-name") === event.commonName);
    });

    const url = new URL(window.location.href);
    url.searchParams.set("event", event.commonName);
    history.replaceState(null, "", url.toString());

  }

  // ─── Event list ─────────────────────────────────────────────────────

  private getFilteredSortedEvents(): GWEvent[] {
    let filtered = this.events;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter((e) => e.commonName.toLowerCase().includes(q));
    }
    if (this.activeTypeFilter !== "all") {
      filtered = filtered.filter((e) => classifyEvent(e) === this.activeTypeFilter);
    }
    const sorted = [...filtered];
    switch (this.activeSortKey) {
      case "snr": sorted.sort((a, b) => b.network_matched_filter_snr - a.network_matched_filter_snr); break;
      case "mass": sorted.sort((a, b) => (b.mass_1_source + b.mass_2_source) - (a.mass_1_source + a.mass_2_source)); break;
      case "distance": sorted.sort((a, b) => a.luminosity_distance - b.luminosity_distance); break;
      case "date": sorted.sort((a, b) => b.GPS - a.GPS); break;
    }
    return sorted;
  }

  private renderEventList() {
    const sorted = this.getFilteredSortedEvents();
    const displayed = sorted.slice(0, 100);
    const totalLabel = this.activeTypeFilter === "all"
      ? `${this.events.length} events`
      : `${sorted.length} of ${this.events.length} events`;
    this.eventCountEl.textContent = totalLabel;

    const mode = getViewMode();

    this.eventListItems.innerHTML = displayed
      .map((e) => {
        const type = classifyEvent(e);
        const dist = e.luminosity_distance.toFixed(0);
        const snr = e.network_matched_filter_snr.toFixed(1);
        const pVal = e.p_astro;
        const pStr = pVal >= 0.99 ? ">0.99" : pVal > 0 ? pVal.toFixed(2) : "";

        if (mode === "explorer") {
          // Explorer: event name only
          return `<div class="event-item" data-name="${e.commonName}">
            <span>${e.commonName}</span>
          </div>`;
        } else if (mode === "student") {
          // Student: name + type badge + distance
          return `<div class="event-item" data-name="${e.commonName}">
            <span>${e.commonName} <span class="type-badge ${type.toLowerCase()}" style="font-size:9px;padding:0 4px;margin-left:4px">${type}</span></span>
            <span class="mass">${dist} Mpc</span>
          </div>`;
        } else {
          // Researcher: name + type badge + SNR + p_astro
          return `<div class="event-item" data-name="${e.commonName}">
            <span>${e.commonName} <span class="type-badge ${type.toLowerCase()}" style="font-size:9px;padding:0 4px;margin-left:4px">${type}</span></span>
            <span class="mass">SNR ${snr}${pStr ? ` · p=${pStr}` : ""}</span>
          </div>`;
        }
      })
      .join("");

    if (this.currentEvent) {
      this.eventListItems.querySelectorAll(".event-item").forEach((el) => {
        el.classList.toggle("active", el.getAttribute("data-name") === this.currentEvent!.commonName);
      });
    }

    this.eventListItems.querySelectorAll(".event-item").forEach((el) => {
      el.addEventListener("click", () => {
        const name = el.getAttribute("data-name")!;
        const event = this.events.find((e) => e.commonName === name);
        if (event) {
          this.selectEvent(event);
          if (this.viewMode === "map") this.setViewMode("event");
          this.eventListEl.classList.remove("mobile-open");
          if (this.eventsToggleBtn) this.eventsToggleBtn.textContent = "Events";
        }
      });
    });
  }

  // ─── Help / About ───────────────────────────────────────────────────

  private toggleHelp() {
    const isShown = this.helpOverlay.style.display === "block";
    this.helpOverlay.style.display = isShown ? "none" : "block";
    if (!isShown) {
      this.eventInfoEl.style.display = "none";
    } else if (this.viewMode === "event") {
      this.eventInfoEl.style.display = "block";
    }
  }

  private toggleAbout() {
    this.aboutOverlay.classList.toggle("show");
  }

  // ─── Tours ──────────────────────────────────────────────────────────

  private buildTourMenu() {
    this.tourMenuItems.innerHTML = tours
      .map((t, i) =>
        `<button class="tour-option" data-tour-index="${i}">${t.name}<span class="tour-option-count">${t.steps.length} events</span></button>`
      )
      .join("");

    this.tourMenuItems.querySelectorAll(".tour-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.getAttribute("data-tour-index")!);
        this.startTour(index);
      });
    });
  }

  private startTour(tourIndex: number) {
    this.activeTour = tours[tourIndex];
    this.activeTourStep = 0;
    this.tourMenuOpen = false;
    this.tourMenu.classList.remove("show");
    if (this.viewMode === "map") this.setViewMode("event");
    this.showTourStep();
    this.tourOverlay.classList.add("show");
  }

  private showTourStep() {
    if (!this.activeTour) return;
    const step = this.activeTour.steps[this.activeTourStep];

    // If this event isn't in the catalog, auto-advance to the next valid step
    const event = this.events.find((e) => e.commonName === step.event);
    if (!event) {
      // Try to find next valid step in current direction
      if (this.activeTourStep < this.activeTour.steps.length - 1) {
        this.activeTourStep++;
        this.showTourStep();
      } else if (this.activeTourStep > 0) {
        this.activeTourStep--;
        this.showTourStep();
      }
      return;
    }

    this.tourNameEl.textContent = this.activeTour.name;
    const availableSteps = this.activeTour.steps.filter((s) => this.events.some((e) => e.commonName === s.event)).length;
    const currentAvailableIdx = this.activeTour.steps.slice(0, this.activeTourStep + 1).filter((s) => this.events.some((e) => e.commonName === s.event)).length;
    this.tourStepCounter.textContent = `${currentAvailableIdx} of ${availableSteps}`;
    this.tourEventName.textContent = step.event;
    this.tourDescription.textContent = step.description;
    this.tourPrevBtn.disabled = this.activeTourStep === 0;
    this.tourNextBtn.disabled = this.activeTourStep === this.activeTour.steps.length - 1;
    this.selectEvent(event);
  }

  private nextTourStep() {
    if (!this.activeTour || this.activeTourStep >= this.activeTour.steps.length - 1) return;
    this.activeTourStep++;
    this.showTourStep();
  }

  private prevTourStep() {
    if (!this.activeTour || this.activeTourStep <= 0) return;
    this.activeTourStep--;
    this.showTourStep();
  }

  private exitTour() {
    this.activeTour = null;
    this.activeTourStep = 0;
    this.tourOverlay.classList.remove("show");
    this.tourMenu.classList.remove("show");
    this.tourMenuOpen = false;
  }

  // ─── Onboarding ─────────────────────────────────────────────────────

  private dismissOnboarding() {
    const el = document.getElementById("onboarding");
    if (!el || el.classList.contains("hidden")) return;
    el.classList.add("hidden");
    setTimeout(() => el?.remove(), 800);
    localStorage.setItem("warplab-onboarded", "1");
  }

  // ─── Screenshot ─────────────────────────────────────────────────────

  private takeScreenshot() {
    const { renderer, scene, camera, composer } = this.ctx;
    if (renderer.xr.isPresenting) {
      renderer.render(scene, camera);
    } else {
      composer.render(0);
    }

    const sourceCanvas = renderer.domElement;
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const cx = offscreen.getContext("2d")!;
    cx.drawImage(sourceCanvas, 0, 0);

    const eventLabel = this.currentEvent?.commonName ?? "WarpLab";
    const watermark = "warplab.app";
    const fontSize = Math.max(16, Math.round(h * 0.025));

    cx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
    cx.textBaseline = "top";
    const pad = Math.round(fontSize * 1.2);
    cx.shadowColor = "rgba(0, 0, 0, 0.8)";
    cx.shadowBlur = 6;
    cx.shadowOffsetX = 1;
    cx.shadowOffsetY = 1;
    cx.fillStyle = "rgba(255, 255, 255, 0.9)";
    cx.fillText(eventLabel, pad, pad);

    cx.textBaseline = "bottom";
    cx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
    cx.fillStyle = "rgba(255, 255, 255, 0.6)";
    const metrics = cx.measureText(watermark);
    cx.fillText(watermark, w - metrics.width - pad, h - pad);

    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (this.currentEvent?.commonName ?? "warplab").replace(/[^a-zA-Z0-9_-]/g, "");
      a.download = `warplab-${safeName}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  // ─── Share ──────────────────────────────────────────────────────────

  private async handleShare() {
    if (!this.currentEvent) return;
    const shareUrl = `https://warplab.app/app.html?event=${encodeURIComponent(this.currentEvent.commonName)}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `WarpLab \u2014 ${this.currentEvent.commonName}`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      this.showShareToast("Link copied!");
    } catch {
      this.showShareToast("Could not copy link");
    }
  }

  private showShareToast(message: string) {
    this.shareToast.textContent = message;
    this.shareToast.classList.add("show");
    if (this.shareToastTimer) clearTimeout(this.shareToastTimer);
    this.shareToastTimer = setTimeout(() => {
      this.shareToast.classList.remove("show");
    }, 2000);
  }

  // ─── Spectrogram ────────────────────────────────────────────────────

  // ─── Export ──────────────────────────────────────────────────────────

  private updateExportVisibility() {
    const mode = getViewMode();
    const visible = mode !== "explorer" && this.viewMode === "event";
    this.exportBtn.classList.toggle("visible", visible);
    // Update label based on mode
    this.exportBtnLabel.textContent = mode === "researcher" ? "Export Data" : "Export";
  }

  private async handleExport() {
    if (!this.currentEvent) return;
    const mode = getViewMode();
    if (mode === "explorer") return;

    // Show toast
    this.exportToast.classList.add("show");

    try {
      await performExport({
        event: this.currentEvent,
        waveform: this.currentWaveform,
        mode,
      });
    } finally {
      // Hide toast after a brief delay
      setTimeout(() => {
        this.exportToast.classList.remove("show");
      }, 800);
    }
  }

  // ─── Intro zoom ─────────────────────────────────────────────────────

  private startIntroZoom() {
    this.introActive = true;
    this.introProgress = 0;
    this.ctx.camera.position.copy(this.introStartPos);
    this.ctx.renderer.domElement.style.opacity = "0";
    this.ctx.renderer.domElement.style.transition = "opacity 0.8s ease";
    requestAnimationFrame(() => {
      this.ctx.renderer.domElement.style.opacity = "1";
    });
  }

  private updateIntroZoom(delta: number) {
    if (!this.introActive) return;
    this.introProgress += delta / this.introDuration;
    if (this.introProgress >= 1) {
      this.introProgress = 1;
      this.introActive = false;
      this.ctx.camera.position.copy(this.introEndPos);
      return;
    }
    const t = 1 - Math.pow(1 - this.introProgress, 3);
    this.ctx.camera.position.lerpVectors(this.introStartPos, this.introEndPos, t);
  }

  // ─── Data loading ───────────────────────────────────────────────────

  private async loadEventCatalog() {
    try {
      const lsStatus = document.getElementById("loading-status");
      if (lsStatus) lsStatus.textContent = "Fetching event catalog from GWOSC...";
      this.events = await fetchEventCatalog();
      if (lsStatus) lsStatus.textContent = `${this.events.length} events loaded. Preparing...`;

      this.universeMap.populate(this.events);
      this.renderEventList();

      const urlEvent = new URLSearchParams(window.location.search).get("event");
      const target = urlEvent
        ? this.events.find((e) => e.commonName === urlEvent)
        : this.events.find((e) => e.commonName === "GW150914");

      if (target) {
        this.selectEvent(target);
      } else if (this.events.length > 0) {
        this.selectEvent(this.events[0]);
      }

      this.eventName.textContent = this.currentEvent?.commonName ?? "No events loaded";

      const ls = document.getElementById("loading-screen");
      if (ls) {
        ls.classList.add("fade-out");
        setTimeout(() => ls.remove(), 700);
      }
      this.startIntroZoom();
    } catch (err) {
      console.error("Failed to load event catalog:", err);
      const lsEl = document.getElementById("loading-status");
      if (lsEl) lsEl.textContent = "Failed to connect. Using offline data...";
      this.eventName.textContent = "Failed to load catalog";

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
      this.events = [fallback];
      this.universeMap.populate(this.events);
      this.selectEvent(fallback);
      this.renderEventList();

      const ls2 = document.getElementById("loading-screen");
      if (ls2) {
        ls2.classList.add("fade-out");
        setTimeout(() => ls2.remove(), 700);
      }
      this.startIntroZoom();
    }
  }

  // ─── Scene interface ────────────────────────────────────────────────

  update(dt: number, elapsed: number): void {
    this.updateIntroZoom(dt);

    if (this.viewMode === "event") {
      if (this.isPlaying && this.currentWaveform) {
        this.playbackTime += (dt * this.playbackSpeed) / this.currentWaveform.duration;
        if (this.playbackTime >= 1.0) {
          this.playbackTime = 1.0;
          this.isPlaying = false;
          this.audio.stop();
          this.playBtn.innerHTML = "&#9654;";
          this.vrPanel?.updateButton(0, "\u25B6");
        }
      }

      this.spacetimeMaterial.uniforms.uTime.value = this.playbackTime;

      if (this.currentWaveform && this.currentEvent) {
        this.binary.update(this.playbackTime, this.currentWaveform, this.currentEvent);
      }

      if (this.currentWaveform) {
        const mergerNorm = this.currentWaveform.peakIndex / this.currentWaveform.hPlus.length;
        const distFromMerger = Math.abs(this.playbackTime - mergerNorm);
        const glowIntensity = Math.max(0, 1 - distFromMerger * 8);
        this.glowMaterial.opacity = glowIntensity * 0.9;
        this.mergerGlow.scale.setScalar(1 + glowIntensity * 3);
        this.ctx.bloom.intensity = 1.2 + glowIntensity * 3;
      }

      if (!this.isPlaying) {
        this.ctx.camera.position.x += Math.sin(elapsed * 0.1) * 0.002;
        this.ctx.camera.position.y += Math.cos(elapsed * 0.07) * 0.001;
      }

      this.timeSlider.value = String(Math.floor(this.playbackTime * 1000));
      if (this.currentWaveform) {
        this.timeLabel.textContent = `${(this.playbackTime * this.currentWaveform.duration).toFixed(2)}s`;
      }

    } else {
      this.ctx.bloom.intensity = 1.8;
    }

    this.ctx.controls.update();
  }

  onResize(_w: number, _h: number): void {
    // No scene-specific resize logic needed beyond what main.ts handles
  }

  getUI(): HTMLElement | null {
    return null; // Merger uses global DOM elements from app.html
  }

  dispose(): void {
    // Remove event handlers
    for (const { el, type, fn } of this.boundHandlers) {
      el.removeEventListener(type, fn);
    }
    this.boundHandlers = [];

    // Clean up VR panel
    if (this.vrPanel) {
      this.ctx.xrManager?.unregisterPanel(this.vrPanel);
      this.ctx.scene.remove(this.vrPanel.mesh);
      this.vrPanel.dispose();
      this.vrPanel = null;
    }

    // Remove 3D objects from scene (but keep references for re-add)
    this.ctx.scene.remove(this.eventViewGroup);
    this.ctx.scene.remove(this.stars);
    this.ctx.scene.remove(this.universeMap.group);

    // Stop audio & playback
    this.isPlaying = false;
    this.audio.stop();

    // Clean up export
    this.exportBtn.classList.remove("visible");

    if (this.unsubViewMode) {
      this.unsubViewMode();
      this.unsubViewMode = null;
    }

    // Hide all merger-specific UI
    this.eventInfoEl.style.display = "none";
    this.timeControlsEl.style.display = "none";
    this.mapLegendEl.style.display = "none";
    this.helpOverlay.style.display = "none";
    this.tourOverlay.classList.remove("show");
    this.tourMenu.classList.remove("show");
    this.mapTooltip.style.display = "none";
    this.eventListEl.style.display = "none";
    this.aboutOverlay.classList.remove("show");
    const uiEl2 = document.getElementById("ui");
    if (uiEl2) uiEl2.style.display = "none";
  }
}
