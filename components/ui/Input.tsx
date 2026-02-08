'use client';

import * as stylex from '@stylexjs/stylex';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

const styles = stylex.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: colors.muted,
  },
  input: {
    width: '100%',
    padding: space.md,
    fontSize: '14px',
    color: colors.foreground,
    backgroundColor: colors.background,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: radii.md,
    outline: 'none',
    fontFamily: 'inherit',
    transitionProperty: 'border-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ':focus': {
      borderColor: colors.primary,
    },
    '::placeholder': {
      color: colors.subtle,
    },
  },
  error: {
    borderColor: colors.error,
  },
  errorMessage: {
    fontSize: '12px',
    color: colors.error,
  },
});

interface InputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  error?: string;
  disabled?: boolean;
}

export function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  disabled = false,
}: InputProps) {
  return (
    <div {...stylex.props(styles.container)}>
      {label ? (
        <label {...stylex.props(styles.label)}>
          {label}
          <input
            {...stylex.props(styles.input, error ? styles.error : null)}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
          />
        </label>
      ) : (
        <input
          {...stylex.props(styles.input, error ? styles.error : null)}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
      {error && <span {...stylex.props(styles.errorMessage)}>{error}</span>}
    </div>
  );
}
