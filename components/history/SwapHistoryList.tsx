'use client';

import * as stylex from '@stylexjs/stylex';
import { useCallback, useEffect, useState } from 'react';
import { useWalletContext } from '@/hooks/useWalletContext';
import { formatTokenAmount } from '@/lib/utils/format';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

const CHAIN_META: Record<string, { name: string; explorerTx: string }> = {
  solana: { name: 'Solana', explorerTx: 'https://solscan.io/tx/' },
  '1': { name: 'Ethereum', explorerTx: 'https://etherscan.io/tx/' },
  '10': { name: 'Optimism', explorerTx: 'https://optimistic.etherscan.io/tx/' },
  '56': { name: 'BNB Chain', explorerTx: 'https://bscscan.com/tx/' },
  '137': { name: 'Polygon', explorerTx: 'https://polygonscan.com/tx/' },
  '8453': { name: 'Base', explorerTx: 'https://basescan.org/tx/' },
  '42161': { name: 'Arbitrum', explorerTx: 'https://arbiscan.io/tx/' },
  '43114': { name: 'Avalanche', explorerTx: 'https://snowtrace.io/tx/' },
};

function chainName(id: string): string {
  return CHAIN_META[id]?.name ?? `Chain ${id}`;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}

interface SwapEntry {
  id: string;
  createdAt: string;
  sourceChain: string;
  sourceToken: string;
  sourceAmount: string;
  destChain: string;
  destToken: string;
  destAmount: string;
  provider: string;
  status: string;
  userFeeToken: string;
  userFeeAmount: string;
  solanaSignature?: string | null;
  evmSignature?: string | null;
  sourceSymbol?: string;
  sourceDecimals?: number;
  destSymbol?: string;
  destDecimals?: number;
}

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingBlock: space.xl,
    paddingInline: {
      default: space.xxl,
      '@media (max-width: 600px)': space.lg,
    },
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pairLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.foreground,
  },
  status: {
    paddingBlock: space.xs,
    paddingInline: space.md,
    borderRadius: radii.full,
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  statusCompleted: {
    backgroundColor: colors.primaryMuted,
    color: colors.primary,
  },
  statusPending: {
    backgroundColor: 'rgba(245, 166, 35, 0.1)',
    color: colors.amber,
  },
  statusFailed: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: colors.error,
  },
  statsRow: {
    display: 'flex',
    gap: {
      default: space.xxl,
      '@media (max-width: 600px)': space.md,
    },
    flexWrap: {
      default: 'nowrap' as const,
      '@media (max-width: 600px)': 'wrap' as const,
    },
  },
  statCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
  },
  statLabel: {
    fontSize: '12px',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.foreground,
  },
  providerValue: {
    textTransform: 'capitalize',
  },
  linksRow: {
    display: 'flex',
    gap: space.lg,
    fontSize: '13px',
  },
  explorerLink: {
    color: colors.primary,
    textDecoration: 'none',
    ':hover': {
      textDecoration: 'underline',
    },
  },
  empty: {
    textAlign: 'center',
    padding: space['4xl'],
    color: colors.muted,
    fontSize: '14px',
  },
});

export function SwapHistoryList() {
  const { address, connected } = useWalletContext();
  const [swaps, setSwaps] = useState<SwapEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (wallet: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/history?wallet=${encodeURIComponent(wallet)}`);
      if (!res.ok) throw new Error('Failed to fetch history');
      const data = await res.json();
      setSwaps(data.swaps ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (address) {
      fetchHistory(address);
    } else {
      setSwaps([]);
    }
  }, [address, fetchHistory]);

  if (!connected) {
    return <div {...stylex.props(styles.empty)}>Connect your wallet to see swap history.</div>;
  }

  if (loading) {
    return null; // Suspense skeleton handles this via the parent
  }

  if (error) {
    return <div {...stylex.props(styles.empty)}>{error}</div>;
  }

  if (swaps.length === 0) {
    return (
      <div {...stylex.props(styles.empty)}>
        No swap history found. Complete your first swap to see it here.
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.list)}>
      {swaps.map((swap) => {
        const srcSymbol = swap.sourceSymbol ?? truncateAddress(swap.sourceToken);
        const srcAmount =
          swap.sourceDecimals != null
            ? formatTokenAmount(swap.sourceAmount, swap.sourceDecimals)
            : swap.sourceAmount;

        const dstSymbol = swap.destSymbol ?? truncateAddress(swap.destToken);
        const dstAmount =
          swap.destDecimals != null
            ? formatTokenAmount(swap.destAmount, swap.destDecimals)
            : swap.destAmount;

        const statusStyle =
          swap.status === 'COMPLETED'
            ? styles.statusCompleted
            : swap.status === 'FAILED'
              ? styles.statusFailed
              : styles.statusPending;

        const solExplorer = CHAIN_META['solana']?.explorerTx;
        const evmExplorer = CHAIN_META[swap.destChain]?.explorerTx;

        return (
          <div key={swap.id} {...stylex.props(styles.card)}>
            <div {...stylex.props(styles.headerRow)}>
              <span {...stylex.props(styles.pairLabel)}>
                {srcSymbol} → {dstSymbol}
              </span>
              <span {...stylex.props(styles.status, statusStyle)}>{formatStatus(swap.status)}</span>
            </div>

            <div {...stylex.props(styles.statsRow)}>
              <div {...stylex.props(styles.statCol)}>
                <span {...stylex.props(styles.statLabel)}>Sent</span>
                <span {...stylex.props(styles.statValue)}>
                  {srcAmount} {srcSymbol}
                </span>
              </div>
              <div {...stylex.props(styles.statCol)}>
                <span {...stylex.props(styles.statLabel)}>Received</span>
                <span {...stylex.props(styles.statValue)}>
                  {dstAmount} {dstSymbol}
                </span>
              </div>
              <div {...stylex.props(styles.statCol)}>
                <span {...stylex.props(styles.statLabel)}>Fee</span>
                <span {...stylex.props(styles.statValue)}>
                  {swap.userFeeToken === 'SOL'
                    ? 'None'
                    : `${swap.userFeeAmount} ${swap.userFeeToken}`}
                </span>
              </div>
            </div>

            <div {...stylex.props(styles.statsRow)}>
              <div {...stylex.props(styles.statCol)}>
                <span {...stylex.props(styles.statLabel)}>Route</span>
                <span {...stylex.props(styles.statValue)}>
                  {chainName(swap.sourceChain)} → {chainName(swap.destChain)}
                </span>
              </div>
              <div {...stylex.props(styles.statCol)}>
                <span {...stylex.props(styles.statLabel)}>Provider</span>
                <span {...stylex.props(styles.statValue, styles.providerValue)}>
                  {swap.provider}
                </span>
              </div>
              <div {...stylex.props(styles.statCol)}>
                <span {...stylex.props(styles.statLabel)}>Date</span>
                <span {...stylex.props(styles.statValue)}>
                  {new Date(swap.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {(swap.solanaSignature || swap.evmSignature) && (
              <div {...stylex.props(styles.linksRow)}>
                {swap.solanaSignature && (
                  <a
                    {...stylex.props(styles.explorerLink)}
                    href={`${solExplorer}${swap.solanaSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on Solscan
                  </a>
                )}
                {swap.evmSignature && evmExplorer && (
                  <a
                    {...stylex.props(styles.explorerLink)}
                    href={`${evmExplorer}${swap.evmSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on {chainName(swap.destChain)} Explorer
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
