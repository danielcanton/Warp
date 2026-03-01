# WarpLab — Internal Reference Guide

Last updated: March 2026

## Architecture overview

WarpLab is a Vite multi-page app: a React landing page (`/`) and a vanilla TypeScript app (`/app.html`). The app uses Three.js for 3D rendering with custom GLSL shaders, Web Audio API for sonification, and KaTeX for LaTeX equation rendering.

```
Landing page (React + Tailwind)
  └── /app.html (vanilla TS + Three.js)
        ├── SceneManager (lifecycle for 4 scenes)
        ├── View Mode system (explorer / student / researcher)
        ├── Post-processing pipeline (bloom + tone mapping)
        └── PWA service worker (offline support)
```

## Entry points

| File | Purpose |
|------|---------|
| `index.html` | Landing page shell (React mount) |
| `app.html` | App shell — all UI HTML, CSS, and DOM structure |
| `src/landing.tsx` | React landing page component |
| `src/main.ts` | App entry — renderer, camera, controls, scene init, render loop |

## Scene system

All scenes implement the `Scene` interface (`src/scenes/types.ts`):

```typescript
interface Scene {
  id: string;
  label: string;
  supportsXR: boolean;
  init(ctx: SceneContext): Promise<void>;
  update(dt: number, elapsed: number): void;
  onResize(w: number, h: number): void;
  getUI(): HTMLElement | null;
  dispose(): void;
}
```

`SceneManager` (`src/lib/SceneManager.ts`) handles scene lifecycle: registration, tab rendering, switching (dispose old + init new), and UI panel management.

### Scenes

| Scene | File | VR | Description |
|-------|------|----|-------------|
| Merger | `src/scenes/merger/MergerScene.ts` | Yes | Real GW events on deforming spacetime grid |
| Sandbox | `src/scenes/sandbox/SandboxScene.ts` | Yes | Custom binary parameters + merge trigger |
| Black Hole | `src/scenes/blackhole/BlackHoleScene.ts` | No | Ray-marched Schwarzschild black hole |
| N-Body | `src/scenes/nbody/NBodyScene.ts` | No | Gravitational simulator with presets |

### Scene switching flow

1. User clicks tab or `SceneManager.switchScene(id)`
2. Current scene's `dispose()` called — removes Three.js objects, cleans up DOM, unbinds events
3. New scene's `init(ctx)` called — adds objects to `ctx.scene`, builds UI panel
4. Tab highlight updates

Scenes persist state between switches (e.g., black hole keeps camera position). Objects are removed/re-added to the Three.js scene, not recreated.

## View modes

Three complexity tiers managed by `src/lib/view-mode.ts`:

| Mode | UI detail | Equations | Export | Stored in |
|------|-----------|-----------|--------|-----------|
| Explorer | Name, masses, distance only | None | No | localStorage + URL |
| Student | All parameters with labels | KaTeX (2-3 key formulas) | JSON only | localStorage + URL |
| Researcher | Full data + 90% CI intervals | KaTeX (all + computed values) | ZIP bundle | localStorage + URL |

Switch via gear icon (top center) or `?mode=` URL param. Changes fire `onViewModeChange()` callbacks that scenes subscribe to.

## Equations system

### Data: `src/lib/equation-data.ts`

Pure typed definitions — no DOM logic. Each `EquationDef` has:
- `id`, `latex` (LaTeX string), `label` (plain English)
- `modes` array (`'student'` | `'researcher'`)
- Optional `compute(values)` function returning formatted string

Three exports: `mergerEquations` (5), `blackholeEquations` (4), `nbodyEquations` (3). Sandbox reuses `mergerEquations`.

### Rendering: `src/lib/equations.ts`

- `ensureKatex()` — lazy `import('katex')` + CSS, loaded once
- `buildEquationsSection(equations, mode, values?)` — creates `.info-equations` DOM
- `updateEquationValues(container, equations, values)` — updates computed values without re-rendering KaTeX
- `removeEquationsSection(container)` — cleanup

KaTeX is code-split by Vite into a separate chunk (~77KB gzip). Never loaded in Explorer mode.

## Merger scene details

### Event data flow

```
GWOSC API (gwosc.org/eventapi/json/allevents/)
  └── waveform.ts: fetchEvents() → dedup by name, prefer newest catalog
        └── MergerScene: populate event list, select first by SNR
              └── selectEvent(): generate waveform → update UI → reset playback
```

### Key subsystems

| System | File | Purpose |
|--------|------|---------|
| Waveform gen | `src/lib/waveform-generator.ts` | IMRPhenom analytical waveform synthesis |
| Binary orbit | `src/lib/binary.ts` | Two-body inspiral animation |
| Audio | `src/lib/audio.ts` | Web Audio oscillator mapping GW frequency to sound |
| Universe map | `src/lib/universe-map.ts` | 3D scatter plot of all events at cosmological distances |
| Tours | `src/lib/tours.ts` | Guided tour sequences through event subsets |
| Export | `src/lib/export.ts` | ZIP bundle generation (JSZip, lazy-loaded) |

### Event classification

```
m1 > 3 && m2 > 3  →  BBH (Binary Black Hole)
m1 < 3 && m2 < 3  →  BNS (Binary Neutron Star)
otherwise          →  NSBH (Neutron Star–Black Hole)
```

## Black hole scene

Full-screen ray-marched shader (`src/shaders/blackhole.frag.glsl`). Uses an independent `PerspectiveCamera` for orbit (main OrbitControls disabled). Supports:

- Mass slider → adjusts Schwarzschild radius uniform
- Accretion disk toggle
- AR mode → `getUserMedia()` camera feed as background texture
- Pinch-zoom on mobile

## N-Body scene

Iterative gravitational force calculation with optional collision detection. Bodies can be placed interactively (click to position, drag to set velocity). Presets include solar system, binary star, triple system.

## Export format (researcher mode)

`performExport()` in `src/lib/export.ts`:

**Student mode**: single `{eventName}_data.json`

**Researcher mode**: `{eventName}_export.zip` containing:

| File | Content |
|------|---------|
| `parameters.json` | Full event data with 90% CI |
| `parameters.csv` | Same in tabular format |
| `waveform_template.csv` | `time_s, h_plus, h_cross` arrays |
| `notebook.ipynb` | Jupyter notebook — fetches real GWOSC strain, Q-transform, whitened overlay |
| `CITATION.bib` | BibTeX for GWOSC + catalog paper + WarpLab |
| `README.md` | Usage instructions |

## URL parameters

| Param | Values | Default | Notes |
|-------|--------|---------|-------|
| `scene` | `merger`, `sandbox`, `blackhole`, `nbody` | `merger` | |
| `mode` | `explorer`, `student`, `researcher` | from localStorage or `explorer` | |
| `embed` | `true` | `false` | Hides brand, events, help, about, onboarding, scene tabs |
| `event` | event name (e.g. `GW150914`) | first by SNR | Merger scene only |

## Keyboard shortcuts

| Key | Action | Scene |
|-----|--------|-------|
| `Space` | Play / Pause | Merger, Sandbox, N-Body |
| `S` | Cycle speed (0.25x → 4x) | Merger |
| `M` | Toggle universe map | Merger |
| `H` | Toggle help overlay | All |
| `P` | Screenshot (PNG) | All |
| `/` | Focus search input | Merger |
| `T` | Open tours menu | Merger |
| `Esc` | Close overlay / cancel placement | All |

## DOM structure (key IDs)

### Panels
- `event-info` — event detail panel (top-left, draggable/minimizable)
- `event-list` — scrollable event list (top-right, draggable/minimizable)
- `time-controls` — playback controls (bottom-center, draggable)
- `sandbox-panel` — sandbox sliders (created by SandboxPanel)
- `blackhole-panel` — black hole controls (created by BlackHoleScene)
- `nbody-panel` — n-body controls (created by NBodyPanel)

### Overlays
- `help-overlay` — help panel (H key)
- `about-overlay` — about modal (brand click)
- `loading-screen` — initial load spinner
- `onboarding` — first-visit hints (4 positioned divs)
- `tour-menu` / `tour-overlay` — tour system

### Controls
- `play-btn`, `time-slider`, `time-label`, `speed-btn`, `speed-label`
- `search-input`, `sort-select`, `filter-chip` buttons
- `map-toggle`, `tour-toggle`, `screenshot-btn`
- `scene-selector`, `scene-tabs`
- `view-mode-gear`, `view-mode-dropdown`

## CSS patterns

- `.glass` — semi-transparent panels (`rgba(0,0,0,0.4)`, `backdrop-filter: blur(12px)`, 1px border)
- `.panel-header` / `.panel-body` — draggable/minimizable panel structure
- `.ctrl-btn` — small circular button (32px)
- `.ui-btn` — larger rectangular button
- `.info-detail` — detail row (hidden in Explorer mode)
- `.info-equations` — equation section (hidden in Explorer mode + mobile)
- `.filter-chip` — event type filter buttons
- `.event-item` — clickable event in list

## Rendering pipeline

```
Three.js Scene
  ├── Stars (Points, 4000 vertices)
  ├── Spacetime mesh (PlaneGeometry + ShaderMaterial)
  ├── Binary system (2 spheres + orbital mechanics)
  ├── Merger glow (Sphere, additive blend)
  └── Universe map (Points + rings + Earth marker)
        ↓
EffectComposer
  ├── RenderPass
  ├── UnrealBloomPass (threshold 0.2, intensity 1.5)
  └── OutputPass (ACES filmic tone mapping)
        ↓
Canvas (WebGL2)
```

## Build & deploy

```bash
npm run dev       # Vite dev server at localhost:5173
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

Build output is code-split:
- `main-*.js` — core app
- `app-*.js` — app entry chunk
- `three.module-*.js` — Three.js
- `katex-*.js` — KaTeX (lazy, only loaded in Student/Researcher)
- `jszip.min-*.js` — JSZip (lazy, only loaded on export)
- `katex-*.css` — KaTeX styles (lazy)

PWA service worker generated by `vite-plugin-pwa`.

## File inventory

### Core
| File | Lines | Purpose |
|------|-------|---------|
| `src/main.ts` | ~400 | App bootstrap, render loop, global UI |
| `app.html` | ~1900 | All HTML structure + CSS |

### Lib
| File | Purpose |
|------|---------|
| `waveform.ts` | GWOSC API, event types, waveform synthesis dispatch |
| `waveform-generator.ts` | IMRPhenom analytical model |
| `binary.ts` | Two-body orbital animation |
| `audio.ts` | Web Audio sonification |
| `universe-map.ts` | 3D event map |
| `view-mode.ts` | 3-tier mode system |
| `equations.ts` | KaTeX lazy loader + DOM builder |
| `equation-data.ts` | Physics equation definitions |
| `export.ts` | ZIP/JSON export orchestration |
| `SceneManager.ts` | Scene lifecycle + tabs |
| `tours.ts` | Guided tour data + UI |
| `xr.ts` | WebXR session management |
| `vr-panel.ts` | In-world VR UI panel |

### Scenes
| File | Purpose |
|------|---------|
| `scenes/merger/MergerScene.ts` | Main merger visualization (~600 lines) |
| `scenes/sandbox/SandboxScene.ts` | Custom binary scene |
| `scenes/sandbox/SandboxPanel.ts` | Sandbox UI panel |
| `scenes/blackhole/BlackHoleScene.ts` | Ray-traced black hole |
| `scenes/nbody/NBodyScene.ts` | N-body simulation |
| `scenes/nbody/NBodyPanel.ts` | N-body UI panel |
| `scenes/nbody/NBodySystem.ts` | Physics engine |
| `scenes/nbody/presets.ts` | Preset configurations |

### Shaders
| File | Purpose |
|------|---------|
| `shaders/spacetime.vert.glsl` | Vertex displacement from binary masses |
| `shaders/spacetime.frag.glsl` | Grid lines, glow, distance fade |
| `shaders/blackhole.vert.glsl` | Fullscreen quad passthrough |
| `shaders/blackhole.frag.glsl` | Schwarzschild ray marching + accretion disk |
| `shaders/universe.vert.glsl` | Event dot vertex shader |
| `shaders/universe.frag.glsl` | Additive-blended event dots |
