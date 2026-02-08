'use client';

import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { formatTokenAmount } from '@/lib/utils/format';
import type { BridgeQuote } from '@/types/bridge';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

const styles = stylex.create({
  container: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.lg,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    userSelect: 'none',
    borderWidth: 0,
    width: '100%',
    fontFamily: 'inherit',
  },
  headerText: {
    fontSize: '14px',
    color: colors.muted,
  },
  chevron: {
    fontSize: '14px',
    color: colors.muted,
    transitionProperty: 'transform',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  chevronOpen: {
    transform: 'rotate(180deg)',
  },
  body: {
    paddingInline: space.lg,
    paddingBottom: space.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
  },
  rowLabel: {
    color: colors.muted,
  },
  rowValue: {
    color: colors.foreground,
    fontWeight: 500,
  },
  countdown: {
    color: colors.amber,
  },
  slippageWarning: {
    color: colors.error,
    fontWeight: 600,
  },
  slippageBanner: {
    padding: space.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: radii.sm,
    fontSize: '13px',
    color: colors.error,
  },
});

interface QuoteDetailsProps {
  quote: BridgeQuote;
  sourceSymbol?: string;
  sourceDecimals?: number;
  destSymbol?: string;
  destDecimals?: number;
  secondsRemaining: number;
  feeToken?: 'USDC' | 'SOL';
}

export function QuoteDetails({
  quote,
  sourceSymbol,
  sourceDecimals,
  destSymbol,
  destDecimals,
  secondsRemaining,
  feeToken = 'USDC',
}: QuoteDetailsProps) {
  const [open, setOpen] = useState(false);

  let rateText = '';
  if (sourceDecimals !== undefined && destDecimals !== undefined && sourceSymbol && destSymbol) {
    const srcNum = Number(quote.sourceAmount) / 10 ** sourceDecimals;
    const dstNum = Number(quote.destAmount) / 10 ** destDecimals;
    if (srcNum > 0) {
      const rate = dstNum / srcNum;
      const rateFormatted =
        rate < 0.001
          ? rate.toExponential(2)
          : rate.toLocaleString('en-US', { maximumFractionDigits: 6, minimumFractionDigits: 0 });
      rateText = `1 ${sourceSymbol} ≈ ${rateFormatted} ${destSymbol}`;
    }
  }

  // Use provider-reported price impact (already an absolute percentage)
  const priceImpact = quote.priceImpact ?? null;

  const formattedDest =
    destDecimals !== undefined
      ? formatTokenAmount(quote.destAmount, destDecimals)
      : quote.destAmount;

  return (
    <div {...stylex.props(styles.container)}>
      <button type="button" {...stylex.props(styles.header)} onClick={() => setOpen(!open)}>
        <span {...stylex.props(styles.headerText)}>{rateText || 'Swap Details'}</span>
        <span {...stylex.props(styles.chevron, open && styles.chevronOpen)}>&#9662;</span>
      </button>
      {open && (
        <div {...stylex.props(styles.body)}>
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.rowLabel)}>You receive</span>
            <span {...stylex.props(styles.rowValue)}>
              {formattedDest} {destSymbol || ''}
            </span>
          </div>
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.rowLabel)}>Provider</span>
            <span {...stylex.props(styles.rowValue)}>{quote.provider}</span>
          </div>
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.rowLabel)}>Fee</span>
            <span {...stylex.props(styles.rowValue)}>
              {feeToken === 'SOL'
                ? 'Gas only (no platform fee)'
                : quote.estimatedCosts?.userFeeUsdc
                  ? `${quote.estimatedCosts.userFeeUsdc} USDC`
                  : 'N/A'}
            </span>
          </div>
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.rowLabel)}>Estimated time</span>
            <span {...stylex.props(styles.rowValue)}>
              ~{Math.ceil(quote.estimatedDuration / 60)} min
            </span>
          </div>
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.rowLabel)}>Quote expires in</span>
            <span {...stylex.props(styles.rowValue, secondsRemaining <= 5 && styles.countdown)}>
              {secondsRemaining}s
            </span>
          </div>
          {priceImpact !== null && priceImpact > 0.1 && (
            <div {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.rowLabel)}>Price impact</span>
              <span {...stylex.props(styles.rowValue, priceImpact > 1 && styles.slippageWarning)}>
                -{priceImpact.toFixed(2)}%
              </span>
            </div>
          )}
          {priceImpact !== null && priceImpact > 3 && (
            <div {...stylex.props(styles.slippageBanner)}>
              High slippage: you are losing ~{priceImpact.toFixed(1)}% on this swap. Consider
              reducing the amount or trying again later.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
