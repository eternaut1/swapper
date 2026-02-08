'use client';

import * as stylex from '@stylexjs/stylex';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

const pulse = stylex.keyframes({
  '0%': {
    opacity: 1,
  },
  '50%': {
    opacity: 0.5,
  },
  '100%': {
    opacity: 1,
  },
});

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.md,
  },
  item: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingBlock: space.xl,
    paddingInline: space.xxl,
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeleton: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
    animationName: pulse,
    animationDuration: '1.5s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  skeletonTitle: {
    height: '18px',
    width: '140px',
  },
  skeletonBadge: {
    height: '24px',
    width: '80px',
    borderRadius: radii.full,
  },
  statsRow: {
    display: 'flex',
    gap: space.xxl,
  },
  statCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
  },
  skeletonLabel: {
    height: '12px',
    width: '50px',
  },
  skeletonValue: {
    height: '16px',
    width: '80px',
  },
});

export function SwapHistorySkeleton() {
  return (
    <div {...stylex.props(styles.list)}>
      {Array.from({ length: 5 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list never reorders
        <div key={i} {...stylex.props(styles.item)}>
          <div {...stylex.props(styles.headerRow)}>
            <div {...stylex.props(styles.skeleton, styles.skeletonTitle)} />
            <div {...stylex.props(styles.skeleton, styles.skeletonBadge)} />
          </div>
          <div {...stylex.props(styles.statsRow)}>
            <div {...stylex.props(styles.statCol)}>
              <div {...stylex.props(styles.skeleton, styles.skeletonLabel)} />
              <div {...stylex.props(styles.skeleton, styles.skeletonValue)} />
            </div>
            <div {...stylex.props(styles.statCol)}>
              <div {...stylex.props(styles.skeleton, styles.skeletonLabel)} />
              <div {...stylex.props(styles.skeleton, styles.skeletonValue)} />
            </div>
            <div {...stylex.props(styles.statCol)}>
              <div {...stylex.props(styles.skeleton, styles.skeletonLabel)} />
              <div {...stylex.props(styles.skeleton, styles.skeletonValue)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
