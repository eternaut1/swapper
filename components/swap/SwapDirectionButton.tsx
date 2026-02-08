'use client';

import * as stylex from '@stylexjs/stylex';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

const styles = stylex.create({
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    paddingBlock: space.lg,
  },
  line: {
    flex: 1,
    height: '1px',
    backgroundColor: colors.border,
  },
  button: {
    width: '32px',
    height: '32px',
    borderRadius: radii.full,
    backgroundColor: colors.primaryMuted,
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transitionProperty: 'background-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    color: colors.primary,
    ':hover': {
      backgroundColor: 'rgba(38, 96, 245, 0.2)',
    },
  },
});

interface SwapDirectionButtonProps {
  onClick?: () => void;
}

export function SwapDirectionButton({ onClick }: SwapDirectionButtonProps) {
  return (
    <div {...stylex.props(styles.wrapper)}>
      <div {...stylex.props(styles.line)} />
      <button type="button" {...stylex.props(styles.button)} onClick={onClick}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M7 1L7 13M7 13L12 8M7 13L2 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div {...stylex.props(styles.line)} />
    </div>
  );
}
