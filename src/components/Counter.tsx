import { MotionValue, motion, useSpring, useTransform } from 'motion/react';
import type React from 'react';
import { useEffect } from 'react';

type PlaceValue = number | '.';

interface NumberProps {
  mv: MotionValue<number>;
  number: number;
  height: number;
}

function Number({ mv, number, height }: NumberProps) {
  const y = useTransform(mv, latest => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) {
      memo -= 10 * height;
    }
    return memo;
  });

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  return <motion.span style={{ ...baseStyle, y }}>{number}</motion.span>;
}

function normalizeNearInteger(num: number): number {
  const nearest = Math.round(num);
  const tolerance = 1e-9 * Math.max(1, Math.abs(num));
  return Math.abs(num - nearest) < tolerance ? nearest : num;
}

function getValueRoundedToPlace(value: number, place: number): number {
  const scaled = value / place;
  return Math.floor(normalizeNearInteger(scaled));
}

interface DigitProps {
  place: PlaceValue;
  value: number;
  height: number;
  digitStyle?: React.CSSProperties;
}

function Digit({ place, value, height, digitStyle }: DigitProps) {
  if (place === '.') {
    return (
      <span
        className="relative inline-flex items-center justify-center"
        style={{ height, width: 'fit-content', ...digitStyle }}
      >
        .
      </span>
    );
  }

  const valueRoundedToPlace = getValueRoundedToPlace(value, place);
  const animatedValue = useSpring(valueRoundedToPlace);

  useEffect(() => {
    animatedValue.set(valueRoundedToPlace);
  }, [animatedValue, valueRoundedToPlace]);

  const defaultStyle: React.CSSProperties = {
    height,
    position: 'relative',
    width: '1ch',
    fontVariantNumeric: 'tabular-nums'
  };

  return (
    <span className="relative inline-flex overflow-hidden" style={{ ...defaultStyle, ...digitStyle }}>
      {Array.from({ length: 10 }, (_, i) => (
        <Number key={i} mv={animatedValue} number={i} height={height} />
      ))}
    </span>
  );
}

interface CounterProps {
  value: number;
  fontSize?: number;
  padding?: number;
  places?: PlaceValue[];
  gap?: number;
  textColor?: string;
  fontWeight?: React.CSSProperties['fontWeight'];
  gradientFrom?: string;
  gradientTo?: string;
}

export default function Counter({
  value,
  fontSize = 48,
  padding = 0,
  places = [...value.toString()].map((ch, i, a) => {
    if (ch === '.') return '.';
    const dotIndex = a.indexOf('.');
    const isInteger = dotIndex === -1;
    const exponent = isInteger ? a.length - i - 1 : i < dotIndex ? dotIndex - i - 1 : -(i - dotIndex);
    return 10 ** exponent;
  }),
  gap = 4,
  textColor = 'inherit',
  fontWeight = 'bold',
  gradientFrom = 'transparent',
  gradientTo = 'transparent',
}: CounterProps) {
  const height = fontSize + padding;

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        style={{
          fontSize,
          display: 'flex',
          gap,
          overflow: 'hidden',
          borderRadius: 4,
          lineHeight: 1,
          color: textColor,
          fontWeight,
        }}
      >
        {places.map(place => (
          <Digit key={place} place={place} value={value} height={height} />
        ))}
      </span>
      <span style={{ pointerEvents: 'none', position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <span style={{ height: 8, background: `linear-gradient(to bottom, ${gradientFrom}, ${gradientTo})` }} />
        <span style={{ height: 8, background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})` }} />
      </span>
    </span>
  );
}
