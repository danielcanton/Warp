import type { ReactNode, CSSProperties } from "react";

interface StarBorderProps {
  className?: string;
  children?: ReactNode;
  color?: string;
  speed?: CSSProperties["animationDuration"];
  thickness?: number;
  onClick?: () => void;
}

export default function StarBorder({
  className = "",
  color = "white",
  speed = "6s",
  thickness = 1,
  children,
  onClick,
}: StarBorderProps) {
  return (
    <button
      className={`relative inline-block overflow-hidden rounded-[20px] cursor-pointer ${className}`}
      style={{ padding: `${thickness}px 0` }}
      onClick={onClick}
    >
      <div
        className="absolute w-[300%] h-[50%] opacity-70 bottom-[-11px] right-[-250%] rounded-full animate-star-movement-bottom z-0"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div
        className="absolute w-[300%] h-[50%] opacity-70 top-[-10px] left-[-250%] rounded-full animate-star-movement-top z-0"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div className="relative z-[1] bg-gradient-to-b from-black to-gray-900 border border-gray-800 text-white text-center text-base py-5 px-12 rounded-[20px]">
        {children}
      </div>
    </button>
  );
}
