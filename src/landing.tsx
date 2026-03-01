import { inject } from "@vercel/analytics";
inject();

import { createRoot } from "react-dom/client";
import { motion } from "motion/react";
import GridDistortion from "./components/GridDistortion";
import DecryptedText from "./components/DecryptedText";
import GradientText from "./components/GradientText";
import GlassCTA from "./components/GlassCTA";
import SplashCursor from "./components/SplashCursor";
import StarBorder from "./components/StarBorder";
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

function Landing() {
  return (
    <div className="relative h-screen bg-black text-white overflow-hidden">
      {/* Spacetime grid distortion background */}
      <GridDistortion />

      {/* Fluid simulation overlay — responds to touch on mobile */}
      <SplashCursor
        DENSITY_DISSIPATION={3}
        VELOCITY_DISSIPATION={2}
        SPLAT_RADIUS={0.15}
        BACK_COLOR={{ r: 0, g: 0, b: 0 }}
        TRANSPARENT={true}
        SPLAT_FORCE={4000}
      />

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
        {/* Logo / Title */}
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

        {/* Tagline */}
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

        {/* CTA — StarBorder wrapping GlassCTA */}
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

        {/* GitHub star */}
        <motion.a
          href="https://github.com/danielcanton/warplab"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex items-center gap-2 text-white/30 text-sm hover:text-white/60 transition-colors"
          {...fadeIn}
          transition={{ duration: 0.6, delay: 1.3, ease: "easeOut" }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          Star on GitHub
        </motion.a>

        {/* Footer with bottom vignette for readability */}
        <motion.div
          className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2 sm:gap-3 px-4 pb-[env(safe-area-inset-bottom)]"
          {...fadeIn}
          transition={{ duration: 0.6, delay: 1.5, ease: "easeOut" }}
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

      {/* Bottom vignette gradient for footer readability */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bottom-vignette z-[5] pointer-events-none" />
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Landing />);
