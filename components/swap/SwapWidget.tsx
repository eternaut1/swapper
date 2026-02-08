'use client';

import { useSignTransaction } from '@solana/react';
import * as stylex from '@stylexjs/stylex';
import type { UiWalletAccount } from '@wallet-standard/react';
import { useCallback, useState } from 'react';
import { isAddress } from 'viem';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAutoQuote } from '@/hooks/useAutoQuote';
import { useChainTokens } from '@/hooks/useChainTokens';
import { useQuoteCountdown } from '@/hooks/useQuoteCountdown';
import { useSwap } from '@/hooks/useSwap';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import { useWalletContext } from '@/hooks/useWalletContext';
import { formatTokenAmount } from '@/lib/utils/format';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';
import { QuoteDetails } from './QuoteDetails';
import { SwapDirectionButton } from './SwapDirectionButton';
import { TokenInputPanel } from './TokenInputPanel';

const styles = stylex.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space['3xl'],
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
    width: '100%',
    maxWidth: '576px',
  },
  centered: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.md,
    paddingBlock: space.xl,
  },
  connectText: {
    color: colors.muted,
    fontSize: '14px',
    margin: 0,
  },
  errorMessage: {
    padding: space.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: colors.error,
    borderRadius: radii.md,
    fontSize: '14px',
  },
  successMessage: {
    padding: space.xl,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    color: colors.foreground,
    borderRadius: radii.md,
    fontSize: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
  successHeading: {
    margin: 0,
    color: '#10B981',
    fontSize: '18px',
    fontWeight: 600,
  },
  successText: {
    margin: 0,
  },
  successId: {
    margin: 0,
    fontSize: '12px',
    color: colors.muted,
  },
  link: {
    color: colors.primary,
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  cancelLink: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: colors.muted,
    fontSize: '14px',
    cursor: 'pointer',
    textAlign: 'center',
    padding: space.xs,
    fontFamily: 'inherit',
    ':hover': {
      color: colors.foreground,
    },
  },
});

const CHAINS = [
  { value: '1', label: 'Ethereum' },
  { value: '137', label: 'Polygon' },
  { value: '42161', label: 'Arbitrum' },
  { value: '10', label: 'Optimism' },
  { value: '8453', label: 'Base' },
];

export function SwapWidget() {
  const { account, connected } = useWalletContext();

  if (!connected || !account) {
    return (
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.centered)}>
          <p {...stylex.props(styles.connectText)}>Connect your wallet to start swapping</p>
        </div>
      </div>
    );
  }

  return <ConnectedSwapWidget account={account} />;
}

function ConnectedSwapWidget({ account }: { account: UiWalletAccount }) {
  const signTransaction = useSignTransaction(account, 'solana:mainnet');
  const { quote, loading, error, signature, swapId, getQuote, executeSwap, reset, clearQuote } =
    useSwap(account.address, signTransaction);
  const {
    tokens: walletTokens,
    loading: balancesLoading,
    initialLoading: balancesInitialLoading,
  } = useTokenBalances();

  const sourceTokenOptions = balancesInitialLoading
    ? []
    : walletTokens.map((t) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        logoURI: t.logoURI,
        balance: t.uiBalance,
      }));

  const [sourceToken, setSourceToken] = useState('');
  const [sourceAmount, setSourceAmount] = useState('');
  const [destChain, setDestChain] = useState('');
  const [destToken, setDestToken] = useState('');
  const [destWallet, setDestWallet] = useState('');
  const [feeToken, setFeeToken] = useState<'USDC' | 'SOL'>('USDC');

  const { tokens: chainTokens, loading: chainTokensLoading } = useChainTokens(destChain);
  const destTokenOptions = chainTokens.map((t) => ({
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    logoURI: t.logoURI,
  }));

  const sourceTokenInfo = walletTokens.find((t) => t.address === sourceToken);
  const destTokenInfo = chainTokens.find((t) => t.address === destToken);

  const formattedDestAmount =
    quote && destTokenInfo?.decimals
      ? formatTokenAmount(quote.destAmount, destTokenInfo.decimals)
      : (quote?.destAmount ?? '');

  const handleGetQuote = useCallback(async () => {
    if (!sourceToken || !sourceAmount || !destChain || !destToken || !destWallet) return;
    const amt = parseFloat(sourceAmount);
    if (Number.isNaN(amt) || amt <= 0) return;
    if (!isAddress(destWallet)) return;

    try {
      await getQuote({
        sourceToken,
        sourceAmount,
        destChain,
        destToken,
        destWallet,
      });
    } catch (_err) {
      // Error is handled in hook
    }
  }, [sourceToken, sourceAmount, destChain, destToken, destWallet, getQuote]);

  useAutoQuote(
    { sourceToken, sourceAmount, destChain, destToken, destWallet },
    { fetchQuote: handleGetQuote, clearQuote, disabled: !!swapId },
  );

  const { secondsRemaining, isExpired } = useQuoteCountdown(quote, handleGetQuote);

  const validationError = (() => {
    if (!sourceToken || !sourceAmount || !destChain || !destToken || !destWallet) return null;
    const amt = parseFloat(sourceAmount);
    if (Number.isNaN(amt) || amt <= 0) return 'Amount must be greater than 0';
    if (!isAddress(destWallet)) return 'Invalid destination wallet address';
    return null;
  })();

  const handleExecuteSwap = async () => {
    if (!quote) return;

    try {
      await executeSwap(quote, feeToken);
    } catch (_err) {
      // Error is handled in hook
    }
  };

  const handleReset = () => {
    reset();
    setSourceToken('');
    setSourceAmount('');
    setDestChain('');
    setDestToken('');
    setDestWallet('');
  };

  const handleFillMax = () => {
    if (sourceTokenInfo?.uiBalance) {
      setSourceAmount(sourceTokenInfo.uiBalance);
    }
  };

  const getButtonConfig = (): { label: string; disabled: boolean; onClick: () => void } => {
    if (loading) return { label: 'Loading...', disabled: true, onClick: () => {} };
    if (!sourceToken) return { label: 'Select a token', disabled: true, onClick: () => {} };
    if (!sourceAmount) return { label: 'Enter an amount', disabled: true, onClick: () => {} };
    if (!destChain) return { label: 'Select destination chain', disabled: true, onClick: () => {} };
    if (!destToken) return { label: 'Select destination token', disabled: true, onClick: () => {} };
    if (!destWallet)
      return { label: 'Enter destination wallet', disabled: true, onClick: () => {} };
    if (validationError) return { label: validationError, disabled: true, onClick: () => {} };
    if (!quote) return { label: 'Fetching quote...', disabled: true, onClick: () => {} };
    if (isExpired)
      return { label: 'Quote expired — Refreshing...', disabled: true, onClick: () => {} };
    return {
      label: `Swap (${secondsRemaining}s)`,
      disabled: false,
      onClick: handleExecuteSwap,
    };
  };

  const buttonConfig = getButtonConfig();

  if (signature && swapId) {
    return (
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.successMessage)}>
          <h3 {...stylex.props(styles.successHeading)}>Swap Submitted!</h3>
          <p {...stylex.props(styles.successText)}>
            Transaction:{' '}
            <a
              {...stylex.props(styles.link)}
              href={`https://solscan.io/tx/${signature}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {signature.slice(0, 8)}...{signature.slice(-8)}
            </a>
          </p>
          <p {...stylex.props(styles.successId)}>Swap ID: {swapId}</p>
        </div>

        <Button onClick={handleReset} fullWidth>
          Start New Swap
        </Button>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.card)}>
      {error && <div {...stylex.props(styles.errorMessage)}>{error}</div>}

      <TokenInputPanel
        label="Sell"
        amount={sourceAmount}
        onAmountChange={setSourceAmount}
        tokenValue={sourceToken}
        onTokenChange={setSourceToken}
        tokenOptions={sourceTokenOptions}
        tokenPlaceholder="Select token"
        balance={sourceTokenInfo?.uiBalance}
        balanceLoading={balancesLoading && !balancesInitialLoading}
        onBalanceClick={sourceTokenInfo ? handleFillMax : undefined}
        disabled={loading}
        panelLoading={balancesInitialLoading}
        chainBadge="solana"
      />

      <SwapDirectionButton />

      <TokenInputPanel
        label="Buy"
        amount={formattedDestAmount}
        readOnly
        amountLoading={loading && !quote}
        tokenValue={destToken}
        onTokenChange={setDestToken}
        tokenOptions={destTokenOptions}
        tokenPlaceholder={
          chainTokensLoading
            ? 'Loading tokens...'
            : destChain
              ? 'Search token...'
              : 'Select chain first'
        }
        tokenDisabled={!destChain}
        disabled={loading}
        chainValue={destChain}
        onChainChange={(v) => {
          setDestChain(v);
          setDestToken('');
        }}
        chainOptions={CHAINS}
      />

      <Input
        label="Destination Wallet"
        value={destWallet}
        onChange={setDestWallet}
        placeholder="0x..."
        disabled={loading}
      />

      {quote && !isExpired && (
        <>
          <QuoteDetails
            quote={quote}
            sourceSymbol={sourceTokenInfo?.symbol}
            sourceDecimals={sourceTokenInfo?.decimals}
            destSymbol={destTokenInfo?.symbol}
            destDecimals={destTokenInfo?.decimals}
            secondsRemaining={secondsRemaining}
            feeToken={feeToken}
          />

          <Select
            label="Pay Fee With"
            value={feeToken}
            onChange={(v) => setFeeToken(v as 'USDC' | 'SOL')}
            options={[
              { value: 'USDC', label: 'USDC — Sponsored (recommended)' },
              { value: 'SOL', label: 'SOL — Pay gas directly' },
            ]}
          />
        </>
      )}

      <Button
        onClick={buttonConfig.onClick}
        loading={loading}
        disabled={buttonConfig.disabled}
        fullWidth
      >
        {buttonConfig.label}
      </Button>

      {quote && (
        <button type="button" {...stylex.props(styles.cancelLink)} onClick={handleReset}>
          Cancel
        </button>
      )}
    </div>
  );
}
