import * as stylex from '@stylexjs/stylex';
import { colors } from '../styles/tokens/aero.stylex';

const spin = stylex.keyframes({
  from: {
    transform: 'rotate(0deg)',
  },
  to: {
    transform: 'rotate(360deg)',
  },
});

const styles = stylex.create({
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  spinner: {
    width: '48px',
    height: '48px',
    borderWidth: '4px',
    borderStyle: 'solid',
    borderColor: colors.border,
    borderTopColor: colors.primary,
    borderRadius: '50%',
    animationName: spin,
    animationDuration: '0.8s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
});

export default function Loading() {
  return (
    <div {...stylex.props(styles.container)}>
      <div {...stylex.props(styles.spinner)} />
    </div>
  );
}
