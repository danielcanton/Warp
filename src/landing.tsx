import { createRoot } from "react-dom/client";
import SplashCursor from "./components/SplashCursor";
import DecryptedText from "./components/DecryptedText";
import StarBorder from "./components/StarBorder";
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
            <DecryptedText
              text="WarpLab"
              speed={60}
              maxIterations={15}
              characters="01∞∇∂∫Ωπ×÷±√∝∑∏∈∉⊂⊃∧∨¬∀∃"
              className="text-white"
              encryptedClassName="text-indigo-400/70"
              animateOn="view"
              sequential
              revealDirection="center"
            />
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
        <StarBorder
          color="#818cf8"
          speed="4s"
          thickness={2}
          onClick={() => {
            window.location.href = "/app.html";
          }}
        >
          <span className="text-lg font-medium tracking-wide px-4">
            Enter the Lab
          </span>
        </StarBorder>

        {/* Footer */}
        <div className="absolute bottom-8 flex flex-col items-center gap-3">
          <div className="text-white/20 text-xs tracking-widest uppercase">
            Gravitational wave visualizer
          </div>
          <div className="flex items-center gap-4 text-white/25 text-xs">
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
              href="https://x.com/dancanton_"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              &#x1D54F;
            </a>
            <a
              href="https://linkedin.com/in/danielcanton"
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
