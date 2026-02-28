import { useRef, useState } from "react";
import type { ReactNode, MouseEvent } from "react";

interface GlassCTAProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  spotlightColor?: string;
}

export default function GlassCTA({
  children,
  onClick,
  className = "",
  spotlightColor = "rgba(129, 140, 248, 0.35)",
}: GlassCTAProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={`
        relative overflow-hidden cursor-pointer
        rounded-full
        border border-white/[0.08]
        bg-white/[0.04] backdrop-blur-xl
        text-white text-lg font-medium tracking-wide
        transition-all duration-300
        hover:border-white/[0.15] hover:bg-white/[0.07]
        hover:shadow-[0_0_30px_rgba(129,140,248,0.15)]
        active:scale-[0.97]
        ${className}
      `}
      style={{ padding: "14px 36px" }}
    >
      {/* Spotlight follow */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out"
        style={{
          opacity,
          background: `radial-gradient(circle 120px at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%)`,
        }}
      />
      {/* Shimmer sweep on hover */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-700"
        style={{
          background:
            "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 55%, transparent 60%)",
          backgroundSize: "200% 100%",
          animation: opacity ? "shimmer 2.5s ease-in-out infinite" : "none",
        }}
      />
      {/* Content */}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
