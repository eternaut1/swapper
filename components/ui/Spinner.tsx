'use client';

import * as stylex from '@stylexjs/stylex';
import { colors } from '../../styles/tokens/aero.stylex';

const spin = stylex.keyframes({
  '0%': { transform: 'rotate(0deg)' },
  '100%': { transform: 'rotate(360deg)' },
});

const styles = stylex.create({
  spinner: {
    display: 'inline-block',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderTopColor: 'currentColor',
    borderRadius: '50%',
    animationName: spin,
    animationDuration: '0.6s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
    flexShrink: 0,
  },
  sm: {
    width: '12px',
    height: '12px',
    borderWidth: '1.5px',
  },
  md: {
    width: '16px',
    height: '16px',
    borderWidth: '2px',
  },
  lg: {
    width: '24px',
    height: '24px',
    borderWidth: '2.5px',
  },
  muted: {
    color: colors.muted,
  },
  primary: {
    color: colors.primary,
  },
  inherit: {
    color: 'currentColor',
  },
});

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'muted' | 'primary' | 'inherit';
}

export function Spinner({ size = 'sm', color = 'muted' }: SpinnerProps) {
  return (
    <output
      {...stylex.props(
        styles.spinner,
        size === 'sm' ? styles.sm : size === 'md' ? styles.md : styles.lg,
        color === 'muted' ? styles.muted : color === 'primary' ? styles.primary : styles.inherit,
      )}
      aria-label="Loading"
    />
  );
}
