'use client';

import * as stylex from '@stylexjs/stylex';
import { ChainBadge } from '@/components/ui/ChainBadge';
import type { ChainOption } from '@/components/ui/ChainSelect';
import { ChainSelect } from '@/components/ui/ChainSelect';
import { Spinner } from '@/components/ui/Spinner';
import type { TokenOption } from '@/components/ui/TokenSelect';
import { TokenSelect } from '@/components/ui/TokenSelect';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

const shimmer = stylex.keyframes({
  '0%': { backgroundPosition: '-200% 0' },
  '100%': { backgroundPosition: '200% 0' },
});

const styles = stylex.create({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  panelLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.foreground,
  },
  balanceArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  balanceText: {
    fontSize: '12px',
    color: colors.muted,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    borderWidth: 0,
    outline: 'none',
    padding: 0,
    fontFamily: 'inherit',
  },
  balanceClickable: {
    ':hover': {
      color: colors.primary,
    },
  },
  bordered: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: {
      default: space.xl,
      '@media (max-width: 600px)': space.md,
    },
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
  },
  amountWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    minWidth: 0,
  },
  amountInput: {
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 0,
    outline: 'none',
    color: colors.foreground,
    fontSize: {
      default: '30px',
      '@media (max-width: 600px)': '22px',
    },
    fontWeight: 600,
    fontFamily: 'inherit',
    padding: 0,
    minWidth: 0,
    textAlign: 'right',
    '::placeholder': {
      color: colors.subtle,
    },
  },
  amountReadOnly: {
    cursor: 'default',
  },
  amountSkeleton: {
    width: '120px',
    height: '32px',
    borderRadius: radii.sm,
    background: `linear-gradient(90deg, ${colors.surfaceRaised} 25%, ${colors.surfaceOverlay} 50%, ${colors.surfaceRaised} 75%)`,
    backgroundSize: '200% 100%',
    animationName: shimmer,
    animationDuration: '1.5s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    marginLeft: 'auto',
  },
  tokenSelectWrapper: {
    flexShrink: 0,
  },
  chainWrapper: {
    flexShrink: 0,
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: space.lg,
  },
  tokenSkeleton: {
    width: '120px',
    height: '48px',
    borderRadius: radii.full,
    background: `linear-gradient(90deg, ${colors.surfaceRaised} 25%, ${colors.surfaceOverlay} 50%, ${colors.surfaceRaised} 75%)`,
    backgroundSize: '200% 100%',
    animationName: shimmer,
    animationDuration: '1.5s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    flexShrink: 0,
  },
});

interface TokenInputPanelProps {
  label: string;
  amount: string;
  onAmountChange?: (val: string) => void;
  tokenValue: string;
  onTokenChange: (address: string) => void;
  tokenOptions: TokenOption[];
  tokenPlaceholder?: string;
  tokenDisabled?: boolean;
  balance?: string;
  balanceLoading?: boolean;
  onBalanceClick?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  amountLoading?: boolean;
  panelLoading?: boolean;
  chainBadge?: string;
  chainValue?: string;
  onChainChange?: (chainId: string) => void;
  chainOptions?: ChainOption[];
}

export function TokenInputPanel({
  label,
  amount,
  onAmountChange,
  tokenValue,
  onTokenChange,
  tokenOptions,
  tokenPlaceholder = 'Select token',
  tokenDisabled = false,
  balance,
  balanceLoading = false,
  onBalanceClick,
  disabled = false,
  readOnly = false,
  amountLoading = false,
  panelLoading = false,
  chainBadge,
  chainValue,
  onChainChange,
  chainOptions,
}: TokenInputPanelProps) {
  if (panelLoading) {
    return (
      <div {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.labelRow)}>
          <span {...stylex.props(styles.panelLabel)}>{label}</span>
        </div>
        <div {...stylex.props(styles.bordered)}>
          <div {...stylex.props(styles.loadingRow)}>
            <div {...stylex.props(styles.tokenSkeleton)} />
            <div {...stylex.props(styles.amountSkeleton)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.labelRow)}>
        <span {...stylex.props(styles.panelLabel)}>{label}</span>
        {balance !== undefined && (
          <div {...stylex.props(styles.balanceArea)}>
            <button
              type="button"
              {...stylex.props(styles.balanceText, onBalanceClick && styles.balanceClickable)}
              onClick={onBalanceClick}
              disabled={!onBalanceClick}
            >
              Balance: {balance}
            </button>
            {balanceLoading && <Spinner size="sm" color="muted" />}
          </div>
        )}
      </div>
      <div {...stylex.props(styles.bordered)}>
        {chainBadge && (
          <div {...stylex.props(styles.chainWrapper)}>
            <ChainBadge chainId={chainBadge} />
          </div>
        )}
        {chainOptions && chainOptions.length > 0 && onChainChange && (
          <div {...stylex.props(styles.chainWrapper)}>
            <ChainSelect
              value={chainValue ?? ''}
              onChange={onChainChange}
              options={chainOptions}
              placeholder="Chain"
              disabled={disabled}
            />
          </div>
        )}
        <div {...stylex.props(styles.tokenSelectWrapper)}>
          <TokenSelect
            value={tokenValue}
            onChange={onTokenChange}
            options={tokenOptions}
            placeholder={tokenPlaceholder}
            disabled={tokenDisabled || disabled}
          />
        </div>
        <div {...stylex.props(styles.amountWrapper)}>
          {amountLoading ? (
            <div {...stylex.props(styles.amountSkeleton)} />
          ) : (
            <input
              {...stylex.props(styles.amountInput, readOnly && styles.amountReadOnly)}
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={onAmountChange ? (e) => onAmountChange(e.target.value) : undefined}
              placeholder="0"
              disabled={disabled}
              readOnly={readOnly}
            />
          )}
        </div>
      </div>
    </div>
  );
}
