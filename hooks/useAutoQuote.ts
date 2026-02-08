import { useEffect, useRef } from 'react';
import { isAddress } from 'viem';

const DEBOUNCE_MS = 500;

interface AutoQuoteInputs {
  sourceToken: string;
  sourceAmount: string;
  destChain: string;
  destToken: string;
  destWallet: string;
}

interface AutoQuoteOptions {
  fetchQuote: () => Promise<void>;
  clearQuote: () => void;
  disabled: boolean;
}

export function useAutoQuote(inputs: AutoQuoteInputs, options: AutoQuoteOptions): void {
  const fetchRef = useRef(options.fetchQuote);
  fetchRef.current = options.fetchQuote;
  const clearRef = useRef(options.clearQuote);
  clearRef.current = options.clearQuote;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { sourceToken, sourceAmount, destChain, destToken, destWallet } = inputs;
  const { disabled } = options;

  useEffect(() => {
    // Clear stale quote immediately on any input change
    clearRef.current();

    // Clear pending debounce timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (disabled) return;

    // Validate all inputs
    if (!sourceToken || !sourceAmount || !destChain || !destToken || !destWallet) return;
    const amt = parseFloat(sourceAmount);
    if (Number.isNaN(amt) || amt <= 0) return;
    if (!isAddress(destWallet)) return;

    // All inputs valid — debounce the fetch
    let cancelled = false;

    timerRef.current = setTimeout(() => {
      if (!cancelled) {
        fetchRef.current().catch(() => {
          // Error handled in useSwap
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sourceToken, sourceAmount, destChain, destToken, destWallet, disabled]);
}
