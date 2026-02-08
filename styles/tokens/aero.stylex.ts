import * as stylex from '@stylexjs/stylex';

export const colors = stylex.defineVars({
  // Primary accent
  primary: 'rgb(38, 96, 245)',
  primaryHover: 'rgb(30, 80, 220)',
  primaryMuted: 'rgba(38, 96, 245, 0.1)',

  // Backgrounds
  background: 'rgb(9, 14, 31)',
  surface: 'rgb(17, 22, 43)',
  surfaceRaised: 'rgb(27, 32, 57)',
  surfaceOverlay: 'rgb(37, 43, 72)',

  // Foreground / Text
  foreground: 'rgb(255, 255, 255)',
  muted: 'rgb(149, 156, 191)',
  subtle: 'rgb(68, 75, 108)',

  // Borders
  border: 'rgb(52, 60, 94)',
  borderSubtle: 'rgb(37, 43, 72)',

  // Status
  amber: '#F5A623',
  error: '#EF4444',
});

export const fonts = stylex.defineVars({
  sans: '"Inter", "InterVariable", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", monospace',
});

export const space = stylex.defineVars({
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  xxl: '24px',
  '3xl': '32px',
  '4xl': '48px',
  '5xl': '64px',
});

export const radii = stylex.defineVars({
  sm: '8px',
  md: '12px',
  lg: '16px',
  full: '9999px',
});

export const transitions = stylex.defineVars({
  fast: '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
});
