'use client';

import * as stylex from '@stylexjs/stylex';
import { useMemo } from 'react';
import { radii } from '../../styles/tokens/aero.stylex';

const styles = stylex.create({
  avatar: {
    borderRadius: radii.full,
    flexShrink: 0,
    overflow: 'hidden',
  },
});

interface AddressAvatarProps {
  address: string;
  size?: number;
}

function addressToSeeds(address: string): number[] {
  const clean = address.replace(/[^a-zA-Z0-9]/g, '');
  const seeds: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    seeds.push(parseInt(clean.slice(i, i + 2), 36) || 0);
  }
  return seeds;
}

function seedToHsl(seed: number, index: number): string {
  const hue = (seed * 137 + index * 53) % 360;
  const sat = 55 + (seed % 30);
  const light = 45 + (seed % 20);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

export function AddressAvatar({ address, size = 32 }: AddressAvatarProps) {
  const svg = useMemo(() => {
    const seeds = addressToSeeds(address);

    const c1 = seedToHsl(seeds[0] ?? 0, 0);
    const c2 = seedToHsl(seeds[2] ?? 0, 1);
    const c3 = seedToHsl(seeds[4] ?? 0, 2);
    const c4 = seedToHsl(seeds[6] ?? 0, 3);

    const angle = ((seeds[1] ?? 0) * 7) % 360;
    const rad = (angle * Math.PI) / 180;
    const x1 = 50 + 50 * Math.cos(rad);
    const y1 = 50 + 50 * Math.sin(rad);
    const x2 = 50 - 50 * Math.cos(rad);
    const y2 = 50 - 50 * Math.sin(rad);

    const blobs = [
      {
        cx: 20 + ((seeds[3] ?? 0) % 60),
        cy: 20 + ((seeds[5] ?? 0) % 60),
        r: 25 + ((seeds[7] ?? 0) % 20),
        color: c3,
      },
      {
        cx: 20 + ((seeds[8] ?? 0) % 60),
        cy: 20 + ((seeds[9] ?? 0) % 60),
        r: 20 + ((seeds[10] ?? 0) % 25),
        color: c4,
      },
    ];

    const id = `av-${address.slice(-6)}`;

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`${id}-bg`} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}>
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <circle cx="50" cy="50" r="50" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}-clip)`}>
          <rect width="100" height="100" fill={`url(#${id}-bg)`} />
          {blobs.map((blob) => (
            <circle
              key={`${blob.cx}-${blob.cy}`}
              cx={blob.cx}
              cy={blob.cy}
              r={blob.r}
              fill={blob.color}
              opacity={0.6}
            />
          ))}
        </g>
      </svg>
    );
  }, [address, size]);

  return (
    <span
      {...stylex.props(styles.avatar)}
      style={{ width: size, height: size, display: 'inline-flex' }}
    >
      {svg}
    </span>
  );
}
