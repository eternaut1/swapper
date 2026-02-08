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
  select: {
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
    cursor: 'pointer',
    transitionProperty: 'border-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ':focus': {
      borderColor: colors.primary,
    },
  },
});

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: SelectProps) {
  return (
    <div {...stylex.props(styles.container)}>
      {label ? (
        <label {...stylex.props(styles.label)}>
          {label}
          <select
            {...stylex.props(styles.select)}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <select
          {...stylex.props(styles.select)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
