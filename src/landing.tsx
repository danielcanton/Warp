import { inject } from "@vercel/analytics";
inject();

import { createRoot } from "react-dom/client";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import GridDistortion from "./components/GridDistortion";
import DecryptedText from "./components/DecryptedText";
import GradientText from "./components/GradientText";
import GlassCTA from "./components/GlassCTA";
import SplashCursor from "./components/SplashCursor";
import StarBorder from "./components/StarBorder";
import SpotlightCard from "./components/SpotlightCard";
import Counter from "./components/Counter";
import "./landing.css";

const fadeUp = {
  initial: { opacity: 0, y: 20, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const fadeScale = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
};

const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

const viewFadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
};

// Minimal SVG icons — thin stroke, space/science aesthetic
const icons = {
  waveform: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16h4l3-10 4 20 4-14 4 8 3-4h6" />
    </svg>
  ),
  audio: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8 12v8M12 8v16M16 10v12M20 6v20M24 12v8" />
    </svg>
  ),
  layers: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4L4 10l12 6 12-6L16 4z" />
      <path d="M4 16l12 6 12-6" />
      <path d="M4 22l12 6 12-6" />
    </svg>
  ),
  globe: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="16" cy="16" r="12" />
      <ellipse cx="16" cy="16" rx="5" ry="12" />
      <path d="M4 16h24" />
      <path d="M6 9h20M6 23h20" />
    </svg>
  ),
  play: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="16" r="12" />
      <path d="M13 11l9 5-9 5V11z" />
    </svg>
  ),
  vr: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="10" width="26" height="12" rx="4" />
      <circle cx="11" cy="16" r="3" />
      <circle cx="21" cy="16" r="3" />
      <path d="M14 16h4" />
    </svg>
  ),
};

const features = [
  {
    icon: icons.waveform,
    title: "90+ Real Events",
    description:
      "Explore real gravitational wave detections — from binary black holes to neutron star mergers.",
    spotlight: "rgba(129, 140, 248, 0.15)" as const,
    hasCounter: true,
  },
  {
    icon: icons.audio,
    title: "Audio Sonification",
    description:
      "Hear spacetime ripple. Each event is converted to audible sound so you can listen to the cosmos.",
    spotlight: "rgba(192, 132, 252, 0.15)" as const,
  },
  {
    icon: icons.layers,
    title: "3 View Modes",
    description:
      "Switch between Explorer, Student, and Researcher — from casual browsing to full data.",
    spotlight: "rgba(34, 211, 238, 0.15)" as const,
  },
  {
    icon: icons.globe,
    title: "Universe Map",
    description:
      "See where each event happened in the sky. Zoom, rotate, and explore the gravitational wave catalog.",
    spotlight: "rgba(129, 140, 248, 0.15)" as const,
  },
  {
    icon: icons.play,
    title: "5 Interactive Scenes",
    description:
      "Watch mergers unfold in real-time 3D — inspiral, merge, and ringdown animated from the waveform.",
    spotlight: "rgba(192, 132, 252, 0.15)" as const,
  },
  {
    icon: icons.vr,
    title: "WebXR / VR Ready",
    description:
      "Step inside the simulation with any WebXR headset. Gravitational waves all around you.",
    spotlight: "rgba(34, 211, 238, 0.15)" as const,
  },
];

const useCases = [
  {
    heading: "Students",
    accent: "rgba(129, 140, 248, 0.15)",
    accentBorder: "border-indigo-400/20",
    description:
      "Explore general relativity hands-on. Visualize what textbook equations describe — black hole masses, spin, distance — and build intuition for spacetime curvature.",
  },
  {
    heading: "Educators",
    accent: "rgba(192, 132, 252, 0.15)",
    accentBorder: "border-purple-400/20",
    description:
      "Bring gravitational waves into the classroom. Use real LIGO data to demonstrate wave physics, astronomical scales, and the evidence for merging compact objects.",
  },
  {
    heading: "Researchers",
    accent: "rgba(34, 211, 238, 0.15)",
    accentBorder: "border-cyan-400/20",
    description:
      "Quickly preview any cataloged event with sonification and 3D waveform playback. Useful for outreach talks, paper illustrations, and sanity-checking parameters.",
  },
];

function CounterOnView({ value }: { value: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <div ref={ref} className="flex items-center gap-1">
      <Counter
        value={inView ? value : 0}
        fontSize={36}
        textColor="#818cf8"
        fontWeight="bold"
        gradientFrom="transparent"
        gradientTo="transparent"
      />
      <span className="text-3xl font-bold text-indigo-400">+</span>
    </div>
  );
}

function Landing() {
  return (
    <div className="w-full bg-black text-white">
      {/* ═══════════════ HERO (existing, confined) ═══════════════ */}
      <section className="relative min-h-screen overflow-hidden">
        <GridDistortion />
        <SplashCursor
          DENSITY_DISSIPATION={3}
          VELOCITY_DISSIPATION={2}
          SPLAT_RADIUS={0.15}
          BACK_COLOR={{ r: 0, g: 0, b: 0 }}
          TRANSPARENT={true}
          SPLAT_FORCE={4000}
        />
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
          <motion.div
            className="mb-4"
            {...fadeUp}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          >
            <h1 className="text-5xl sm:text-6xl md:text-8xl font-bold tracking-tight">
              <GradientText
                colors={["#818cf8", "#c084fc", "#22d3ee", "#818cf8"]}
                animationSpeed={5}
              >
                <DecryptedText
                  text="WarpLab"
                  speed={60}
                  maxIterations={15}
                  characters="01∞∇∂∫Ωπ×÷±√∝∑∏∈∉⊂⊃∧∨¬∀∃"
                  className=""
                  encryptedClassName="opacity-50"
                  animateOn="view"
                  sequential
                  revealDirection="center"
                />
              </GradientText>
            </h1>
          </motion.div>
          <motion.p
            className="text-base sm:text-lg md:text-xl text-white/50 mb-12 text-center max-w-md font-light tracking-wide"
            {...fadeUp}
            transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
          >
            <DecryptedText
              text="Feel spacetime bend"
              speed={40}
              maxIterations={12}
              characters="·•○●◦◉◎"
              className="text-white/50"
              encryptedClassName="text-white/20"
              animateOn="view"
            />
          </motion.p>
          <motion.div
            {...fadeScale}
            transition={{ duration: 0.6, delay: 1.0, ease: "easeOut" }}
          >
            <StarBorder color="#818cf8" speed="6s" thickness={2}>
              <GlassCTA
                onClick={() => {
                  window.location.href = "/app.html";
                }}
              >
                Enter the Lab
              </GlassCTA>
            </StarBorder>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-10 left-1/2 -translate-x-1/2"
            {...fadeIn}
            transition={{ duration: 0.6, delay: 1.8, ease: "easeOut" }}
          >
            <div
              className="text-white/20 text-2xl"
              style={{ animation: "bounce-down 2s ease-in-out infinite" }}
            >
              ↓
            </div>
          </motion.div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bottom-vignette z-[5] pointer-events-none" />
      </section>

      {/* ═══════════════ WHAT IS THIS ═══════════════ */}
      <section className="py-24 sm:py-32 px-6">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          {...viewFadeUp}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            <GradientText
              colors={["#818cf8", "#c084fc", "#22d3ee", "#818cf8"]}
              animationSpeed={5}
            >
              What is WarpLab?
            </GradientText>
          </h2>
          <p className="text-lg sm:text-xl text-white/60 leading-relaxed">
            An interactive gravitational wave visualizer built with real data
            from LIGO, Virgo, and KAGRA. Watch black holes merge in 3D, hear
            the chirp, and explore the cosmos.
          </p>
        </motion.div>
      </section>

      {/* ═══════════════ FEATURES ═══════════════ */}
      <section className="py-24 sm:py-32 px-6">
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-center mb-16"
          {...viewFadeUp}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          Features
        </motion.h2>
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              {...viewFadeUp}
              transition={{
                duration: 0.5,
                delay: i * 0.1,
                ease: "easeOut",
              }}
            >
              <SpotlightCard
                className="p-8 h-full"
                spotlightColor={f.spotlight}
              >
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="text-white/40">{f.icon}</div>
                  {f.hasCounter ? (
                    <CounterOnView value={90} />
                  ) : (
                    <h3 className="text-lg font-semibold">{f.title}</h3>
                  )}
                  {f.hasCounter && (
                    <h3 className="text-lg font-semibold">Real Events</h3>
                  )}
                  <p className="text-sm text-white/45 leading-relaxed">
                    {f.description}
                  </p>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══════════════ USE CASES ═══════════════ */}
      <section className="py-24 sm:py-32 px-6">
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-center mb-16"
          {...viewFadeUp}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          Who is it for?
        </motion.h2>
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {useCases.map((uc, i) => (
            <motion.div
              key={uc.heading}
              {...viewFadeUp}
              transition={{
                duration: 0.5,
                delay: i * 0.12,
                ease: "easeOut",
              }}
            >
              <SpotlightCard
                className={`p-8 h-full border-t-2 ${uc.accentBorder}`}
                spotlightColor={uc.accent as `rgba(${number}, ${number}, ${number}, ${number})`}
              >
                <div className="flex flex-col items-center text-center gap-3">
                  <h3 className="text-xl font-semibold">{uc.heading}</h3>
                  <p className="text-sm text-white/45 leading-relaxed">
                    {uc.description}
                  </p>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══════════════ DATA SOURCE ═══════════════ */}
      <section className="py-16 px-6">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          {...viewFadeUp}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <p className="text-lg text-white/50">
            Built on open data from{" "}
            <span className="text-white/70 font-medium">
              LIGO / Virgo / KAGRA
            </span>{" "}
            via{" "}
            <a
              href="https://gwosc.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 font-medium underline underline-offset-4 decoration-white/20 hover:text-white/90 transition-colors"
            >
              GWOSC
            </a>
          </p>
          <p className="text-xs text-white/25 mt-2">
            Gravitational Wave Open Science Center
          </p>
        </motion.div>
      </section>

      {/* ═══════════════ FINAL CTA + FOOTER ═══════════════ */}
      <section className="py-24 sm:py-32 px-6">
        <div className="flex flex-col items-center gap-8">
          <motion.div
            {...viewFadeUp}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <StarBorder color="#818cf8" speed="6s" thickness={2}>
              <GlassCTA
                onClick={() => {
                  window.location.href = "/app.html";
                }}
              >
                Enter the Lab
              </GlassCTA>
            </StarBorder>
          </motion.div>

          <motion.a
            href="https://github.com/danielcanton/warplab"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/30 text-sm hover:text-white/60 transition-colors"
            {...viewFadeUp}
            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          >
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="currentColor"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Star on GitHub
          </motion.a>

          <motion.div
            className="flex flex-col items-center gap-2 pt-8"
            {...viewFadeUp}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          >
            <div className="text-white/20 text-[10px] sm:text-xs tracking-widest uppercase">
              Gravitational wave visualizer
            </div>
            <div className="flex items-center gap-3 sm:gap-4 text-white/25 text-[10px] sm:text-xs flex-wrap justify-center">
              <span>by Daniel Canton</span>
              <a
                href="https://dancanton.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                dancanton.com
              </a>
              <a
                href="https://x.com/coco_canton"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                X
              </a>
              <a
                href="https://www.linkedin.com/in/danielcantonarg/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                LinkedIn
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Landing />);
