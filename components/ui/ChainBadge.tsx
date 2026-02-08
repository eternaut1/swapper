'use client';

import * as stylex from '@stylexjs/stylex';
import { ChainIcon } from '@/components/ui/ChainSelect';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

const styles = stylex.create({
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    height: '48px',
    paddingTop: '12px',
    paddingBottom: '12px',
    paddingLeft: '12px',
    paddingRight: '20px',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.full,
    fontSize: '14px',
    fontWeight: 600,
    color: colors.foreground,
    flexShrink: 0,
  },
});

const CHAIN_NAMES: Record<string, string> = {
  solana: 'Solana',
  '1': 'Ethereum',
  '137': 'Polygon',
  '42161': 'Arbitrum',
  '10': 'Optimism',
  '8453': 'Base',
};

export function ChainBadge({ chainId }: { chainId: string }) {
  const name = CHAIN_NAMES[chainId] ?? chainId;
  return (
    <div {...stylex.props(styles.badge)}>
      <ChainIcon chainId={chainId} />
      <span>{name}</span>
    </div>
  );
}
