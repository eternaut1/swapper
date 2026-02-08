import * as stylex from '@stylexjs/stylex';
import { Suspense } from 'react';
import { SwapHistoryList } from '@/components/history/SwapHistoryList';
import { SwapHistorySkeleton } from '@/components/history/SwapHistorySkeleton';
import { colors, space } from '../../styles/tokens/aero.stylex';

const styles = stylex.create({
  content: {
    width: '100%',
    maxWidth: '576px',
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: colors.foreground,
    margin: 0,
  },
});

export default function HistoryPage() {
  return (
    <main {...stylex.props(styles.content)}>
      <h1 {...stylex.props(styles.title)}>History</h1>
      <Suspense fallback={<SwapHistorySkeleton />}>
        <SwapHistoryList />
      </Suspense>
    </main>
  );
}
