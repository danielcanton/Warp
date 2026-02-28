import { inject } from "@vercel/analytics";
inject();

import { createRoot } from "react-dom/client";
import SplashCursor from "./components/SplashCursor";
import DecryptedText from "./components/DecryptedText";
import GradientText from "./components/GradientText";
import GlassCTA from "./components/GlassCTA";
import "./landing.css";

function Landing() {
  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden">
      {/* Fluid cursor background */}
      <SplashCursor
        BACK_COLOR={{ r: 0, g: 0, b: 0 }}
        DENSITY_DISSIPATION={3}
        VELOCITY_DISSIPATION={2}
        SPLAT_RADIUS={0.3}
        CURL={5}
      />

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        {/* Logo / Title */}
        <div className="mb-4">
          <h1 className="text-6xl sm:text-8xl font-bold tracking-tight">
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
        </div>

        {/* Tagline */}
        <p className="text-lg sm:text-xl text-white/50 mb-12 text-center max-w-md font-light tracking-wide">
          <DecryptedText
            text="Feel spacetime bend"
            speed={40}
            maxIterations={12}
            characters="·•○●◦◉◎"
            className="text-white/50"
            encryptedClassName="text-white/20"
            animateOn="view"
          />
        </p>

        {/* CTA */}
        <GlassCTA
          onClick={() => {
            window.location.href = "/app.html";
          }}
        >
          Enter the Lab
        </GlassCTA>

        {/* GitHub star */}
        <a
          href="https://github.com/danielcanton/warplab"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex items-center gap-2 text-white/30 text-sm hover:text-white/60 transition-colors"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          Star on GitHub
        </a>

        {/* Footer */}
        <div className="absolute bottom-6 sm:bottom-8 flex flex-col items-center gap-2 sm:gap-3 px-4">
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
              &#x1D54F;
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
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Landing />);
