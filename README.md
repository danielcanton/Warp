# WarpLab

**Feel spacetime bend.**

An interactive gravitational wave visualizer built with Three.js and WebGL. Every event shown is real — detected by [LIGO](https://www.ligo.caltech.edu/), [Virgo](https://www.virgo-gw.eu/), and [KAGRA](https://gwcenter.icrr.u-tokyo.ac.jp/en/).

**[Try it live at warplab.app](https://warplab.app)**

## What is this?

WarpLab lets you explore gravitational wave events — the ripples in spacetime produced when black holes and neutron stars collide. You can:

- **Watch mergers in 3D** — two compact objects spiral inward on a deforming spacetime grid, rendered with custom GLSL shaders
- **Hear the chirp** — audio sonification maps the gravitational waveform into human hearing range, synced to the visual playback
- **Explore the universe map** — a 3D scatter plot of all 90+ confirmed events at their cosmological distances, with Earth at the center
- **Learn the physics** — an educational help overlay explains every parameter in plain English

## Features

- Real-time spacetime deformation with vertex displacement shaders
- Physically-motivated inspiral-merger-ringdown waveform generation
- Web Audio API sonification tracking instantaneous frequency and amplitude
- 90+ real events from GWTC-1, GWTC-2, GWTC-2.1, and GWTC-3 catalogs
- Event filtering (BBH / BNS / NSBH), sorting (SNR / mass / distance / date), and search
- URL deep links (`?event=GW150914`)
- First-visit onboarding hints
- Cinematic intro zoom animation
- WebXR-ready (VR button)

## Tech Stack

- **Three.js** — 3D rendering, orbit controls, points system for universe map
- **Custom GLSL shaders** — spacetime grid deformation, additive-blended event dots
- **Web Audio API** — real-time chirp synthesis from waveform physics
- **postprocessing** — bloom and tone mapping
- **React** — landing page (Vite multi-page app)
- **Tailwind CSS v4** — landing page styling
- **TypeScript** — end to end
- **Vite** — build tooling

## Project Structure

```
src/
├── main.ts                  # App entry — scene, controls, UI, render loop
├── landing.tsx              # React landing page
├── landing.css              # Tailwind imports
├── lib/
│   ├── waveform.ts          # GWOSC API client, waveform generation, event types
│   ├── binary.ts            # Binary orbit system (inspiral + merger physics)
│   ├── audio.ts             # Gravitational wave sonification engine
│   └── universe-map.ts      # 3D scatter plot of all events
├── shaders/
│   ├── spacetime.vert.glsl  # Vertex shader — grid deformation from binary masses
│   └── spacetime.frag.glsl  # Fragment shader — grid lines, glow, distance fade
└── components/
    ├── SplashCursor.tsx      # WebGL2 fluid simulation cursor effect
    ├── DecryptedText.tsx     # Scramble-to-reveal text animation
    └── GlassCTA.tsx          # Glass pill button with cursor spotlight
```

## Getting Started

```bash
# Clone
git clone https://github.com/danielcanton/warplab.git
cd Warp

# Install
npm install

# Dev server
npm run dev

# Build
npm run build
```

## Data Source

All event data is fetched live from the [Gravitational Wave Open Science Center (GWOSC)](https://gwosc.org/) API. The waveforms are synthetic approximations based on the detected parameters — not the raw detector strain data.

## Contributing

Contributions welcome! Some areas that could use help:

- **Real waveform data** — integrate actual NR/surrogate waveforms from GWOSC strain files
- **More physics** — gravitational lensing visualization, tidal deformation for neutron stars
- **Mobile optimization** — touch controls, responsive layout improvements
- **Accessibility** — screen reader support, keyboard navigation for all controls
- **New visualizations** — dark matter halos, cosmic web structure, pulsar timing arrays

Open an issue or submit a PR. No contribution is too small.

## License

MIT

## Author

**Daniel Canton** — [dancanton.com](https://dancanton.com) · [X](https://x.com/coco_canton) · [LinkedIn](https://www.linkedin.com/in/danielcantonarg/)
