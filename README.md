# WarpLab

**Feel spacetime bend.**

An interactive gravitational wave visualizer built with Three.js and WebGL. Every event shown is real — detected by [LIGO](https://www.ligo.caltech.edu/), [Virgo](https://www.virgo-gw.eu/), and [KAGRA](https://gwcenter.icrr.u-tokyo.ac.jp/en/).

**[Try it live at warplab.app](https://warplab.app)**

## What is this?

WarpLab lets you explore gravitational wave events — the ripples in spacetime produced when black holes and neutron stars collide. Four interactive scenes cover different aspects of gravitational physics:

- **Merger** — watch real binary mergers on a deforming spacetime grid with audio sonification
- **Sandbox** — build your own binary system, tweak masses and spins, and trigger a custom merger
- **Black Hole** — orbit a ray-traced Schwarzschild black hole with accretion disk and AR mode
- **N-Body** — gravitational simulator with presets, collision detection, and orbit trails

## Features

### Merger scene
- 90+ real events from GWTC-1, GWTC-2, GWTC-2.1, and GWTC-3 catalogs
- Real-time spacetime deformation with custom GLSL vertex shaders
- Audio sonification mapping gravitational wave frequency to sound
- 3D universe map showing all events at cosmological distances
- Guided tours ("Greatest Hits", "Record Breakers", "Neutron Stars")
- Event filtering (BBH / BNS / NSBH), sorting, and search
- URL deep links (`?event=GW150914&mode=researcher`)

### Black hole scene
- Full-screen ray-marched Schwarzschild black hole
- Togglable accretion disk and AR camera mode
- Independent orbit camera with smooth interpolation
- **VR passthrough (Quest 3)** — black hole floats in your real room via mixed reality
  - Two-tier architecture: Tier 1 (dark void + Einstein ring glow over passthrough), Tier 2 (gravitational lensing of camera feed — activates automatically when WebXR camera-access ships)
  - Grab & drag to reposition the black hole with controllers or hand tracking
  - Localized 2m sphere with early ray termination for Quest 3 performance

### Sandbox & N-Body
- Custom binary parameters with live waveform preview
- N-body gravitational simulator with presets and placement tools
- Orbit trails, reference grid, and collision physics

### Three view modes
- **Explorer** — clean, minimal interface for casual browsing
- **Student** — parameter labels, KaTeX-rendered physics equations, and pedagogical detail
- **Researcher** — full data with 90% confidence intervals, computed equation values, and data export

### Export (researcher mode)
Downloads a ZIP bundle containing:
- `parameters.json` / `parameters.csv` — full event data with uncertainties
- `waveform_template.csv` — synthetic IMRPhenom waveform arrays
- `notebook.ipynb` — Jupyter notebook that fetches real strain from GWOSC
- `CITATION.bib` — BibTeX for GWOSC, catalog paper, and WarpLab

### Platform support
- WebXR / VR ready (Merger, Sandbox, Black Hole, N-Body scenes)
- Quest 3 mixed reality passthrough (Black Hole scene)
- Embeddable via iframe (`?embed=true`)
- Responsive mobile layout
- First-visit onboarding hints
- PWA with offline support

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `S` | Cycle playback speed |
| `M` | Toggle universe map |
| `H` | Toggle help overlay |
| `P` | Take screenshot |
| `/` | Focus search input |
| `Esc` | Close overlay |

## Tech stack

- **Three.js** — 3D rendering, orbit controls, universe map
- **Custom GLSL** — spacetime grid deformation, black hole ray marching
- **Web Audio API** — real-time chirp synthesis
- **KaTeX** — LaTeX equation rendering (lazy-loaded)
- **postprocessing** — bloom and ACES tone mapping
- **React** — landing page only (Vite multi-page app)
- **Tailwind CSS v4** — landing page styling
- **TypeScript** — end to end
- **Vite** — build tooling, code splitting, PWA plugin

## Project structure

```
src/
├── main.ts                     # App entry — renderer, controls, UI, render loop
├── landing.tsx                 # React landing page
├── lib/
│   ├── waveform.ts             # GWOSC API client, waveform generation
│   ├── waveform-generator.ts   # IMRPhenom waveform synthesis
│   ├── binary.ts               # Binary orbit system (inspiral + merger)
│   ├── audio.ts                # Gravitational wave sonification
│   ├── universe-map.ts         # 3D event scatter plot
│   ├── view-mode.ts            # Explorer / Student / Researcher system
│   ├── equations.ts            # Lazy KaTeX loader + equation DOM builder
│   ├── equation-data.ts        # Physics equation definitions per scene
│   ├── export.ts               # ZIP export (JSON, CSV, notebook, BibTeX)
│   ├── SceneManager.ts         # Scene lifecycle + tab switching
│   └── tours.ts                # Guided tour sequences
├── scenes/
│   ├── merger/MergerScene.ts   # Binary merger visualization
│   ├── sandbox/SandboxPanel.ts # Custom binary parameter panel
│   ├── blackhole/BlackHoleScene.ts  # Ray-traced black hole
│   └── nbody/NBodyScene.ts     # N-body gravitational simulator
├── shaders/
│   ├── spacetime.vert.glsl     # Grid deformation from binary masses
│   ├── spacetime.frag.glsl     # Grid lines, glow, distance fade
│   ├── blackhole.vert.glsl     # Fullscreen quad vertex shader
│   ├── blackhole.frag.glsl     # Schwarzschild ray marching
│   ├── blackhole-vr.vert.glsl  # VR stereo vertex shader (per-eye parallax)
│   └── blackhole-vr.frag.glsl  # VR ray marching + passthrough lensing
└── components/                 # React components (landing page)
    ├── SplashCursor.tsx
    ├── DecryptedText.tsx
    └── GlassCTA.tsx
```

## Getting started

```bash
git clone https://github.com/danielcanton/warplab.git
cd warplab
npm install
npm run dev     # Dev server at localhost:5173
npm run build   # Production build to dist/
```

## URL parameters

| Parameter | Values | Default |
|-----------|--------|---------|
| `scene` | `merger`, `sandbox`, `blackhole`, `nbody` | `merger` |
| `mode` | `explorer`, `student`, `researcher` | `explorer` |
| `embed` | `true` | `false` |
| `event` | any event name (e.g. `GW150914`) | first by SNR |

## Data source

All event data is fetched live from the [Gravitational Wave Open Science Center (GWOSC)](https://gwosc.org/) API. The waveforms are synthetic IMRPhenom approximations based on detected parameters — not raw detector strain.

## Contributing

Contributions welcome! Some areas that could use help:

- **Tidal deformation** — neutron star matter effects during BNS mergers
- **Accessibility** — screen reader support, keyboard navigation improvements
- **Mobile UX** — touch gesture refinements, responsive panel layouts
- **New scenes** — pulsar timing arrays, cosmic web structure

Open an issue or submit a PR.

## License

MIT

## Author

**Daniel Canton** — [dancanton.com](https://dancanton.com) · [X](https://x.com/coco_canton) · [LinkedIn](https://www.linkedin.com/in/danielcantonarg/)
