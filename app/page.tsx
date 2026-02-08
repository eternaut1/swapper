import * as stylex from '@stylexjs/stylex';
import { SwapWidget } from '@/components/swap/SwapWidget';

const styles = stylex.create({
  main: {
    width: '100%',
    maxWidth: '576px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
});

export default function Home() {
  return (
    <main {...stylex.props(styles.main)}>
      <SwapWidget />
    </main>
  );
}
