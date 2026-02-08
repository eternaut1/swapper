'use client';

import * as stylex from '@stylexjs/stylex';
import { Spinner } from '@/components/ui/Spinner';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

const styles = stylex.create({
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: '50px',
    paddingInline: space.xxl,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'inherit',
    borderRadius: radii.full,
    border: 'none',
    cursor: 'pointer',
    transitionProperty: 'background-color, opacity',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    outline: 'none',
  },
  primary: {
    backgroundColor: colors.primary,
    color: colors.foreground,
    ':hover': {
      backgroundColor: colors.primaryHover,
    },
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    color: colors.foreground,
    ':hover': {
      backgroundColor: colors.surfaceOverlay,
    },
  },
  disabled: {
    backgroundColor: colors.surfaceRaised,
    color: colors.muted,
    cursor: 'not-allowed',
    opacity: 0.4,
  },
  fullWidth: {
    width: '100%',
  },
  loading: {
    opacity: 0.7,
    cursor: 'wait',
  },
});

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      {...stylex.props(
        styles.button,
        variant === 'primary' ? styles.primary : styles.secondary,
        disabled && styles.disabled,
        loading && styles.loading,
        fullWidth && styles.fullWidth,
      )}
      onClick={onClick}
      disabled={disabled || loading}
      type={type}
    >
      {loading && <Spinner size="sm" color="inherit" />}
      {children}
    </button>
  );
}
