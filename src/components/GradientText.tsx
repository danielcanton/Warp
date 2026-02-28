import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { motion, useMotionValue, useAnimationFrame, useTransform } from "motion/react";

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  colors?: string[];
  animationSpeed?: number;
  direction?: "horizontal" | "vertical" | "diagonal";
}

export default function GradientText({
  children,
  className = "",
  colors = ["#818cf8", "#c084fc", "#22d3ee", "#818cf8"],
  animationSpeed = 6,
  direction = "horizontal",
}: GradientTextProps) {
  const progress = useMotionValue(0);
  const elapsedRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const duration = animationSpeed * 1000;

  useAnimationFrame((time) => {
    if (lastTimeRef.current === null) {
      lastTimeRef.current = time;
      return;
    }
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;
    elapsedRef.current += dt;

    const fullCycle = duration * 2;
    const t = elapsedRef.current % fullCycle;
    if (t < duration) {
      progress.set((t / duration) * 100);
    } else {
      progress.set(100 - ((t - duration) / duration) * 100);
    }
  });

  const backgroundPosition = useTransform(progress, (p) => `${p}% 50%`);

  const gradientColors = [...colors, colors[0]].join(", ");
  const gradientAngle =
    direction === "horizontal" ? "to right" : direction === "vertical" ? "to bottom" : "to bottom right";

  const gradientStyle = {
    backgroundImage: `linear-gradient(${gradientAngle}, ${gradientColors})`,
    backgroundSize: "300% 100%",
    backgroundRepeat: "repeat" as const,
  };

  return (
    <motion.span
      className={`inline-block text-transparent bg-clip-text ${className}`}
      style={{
        ...gradientStyle,
        backgroundPosition,
        WebkitBackgroundClip: "text",
      }}
    >
      {children}
    </motion.span>
  );
}
