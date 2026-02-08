'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWalletContext } from '@/hooks/useWalletContext';
import type { TokenBalanceInfo } from '@/types/solana';

const REFRESH_INTERVAL = 30_000; // 30 seconds
const MAX_RETRIES = 5;
const RETRY_DELAY = 3_000; // 3 seconds

export function useTokenBalances() {
  const { address, connected } = useWalletContext();
  const [tokens, setTokens] = useState<TokenBalanceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track whether we've ever successfully fetched balances for this wallet.
  // Until this is true, the UI should show a loading state — not stale/fallback data.
  const hasLoadedRef = useRef(false);

  // `initialLoading` is true until the first successful fetch completes.
  // Different from `loading` which toggles on every refresh cycle.
  const [initialLoading, setInitialLoading] = useState(connected);

  const fetchBalances = useCallback(
    async (retryCount = 0) => {
      if (!address || !connected) {
        setTokens([]);
        hasLoadedRef.current = false;
        setInitialLoading(false);
        return;
      }

      // Only set loading on the first call, not on retries (avoids flashing)
      if (retryCount === 0) {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(`/api/balances?wallet=${address}`);
        const data = await response.json();

        if (data.success) {
          setTokens(data.tokens);
          hasLoadedRef.current = true;
          setInitialLoading(false);
          setLoading(false);
          return;
        }

        // API returned an error
        setError(data.error || 'Failed to fetch balances');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch balances');
      }

      // If we get here, the fetch failed. Retry if initial load hasn't succeeded yet.
      if (!hasLoadedRef.current && retryCount < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
        return fetchBalances(retryCount + 1);
      }

      // Exhausted retries — stop loading indicator, keep tokens empty.
      // The 30s periodic refresh will pick it up eventually.
      if (!hasLoadedRef.current) {
        setInitialLoading(false);
      }
      setLoading(false);
    },
    [address, connected],
  );

  // When wallet connects or address changes, mark initial loading immediately
  useEffect(() => {
    // `address` is intentionally in deps to reset loading state on wallet switch
    void address;
    if (connected) {
      setInitialLoading(true);
      hasLoadedRef.current = false;
    } else {
      setInitialLoading(false);
    }
  }, [connected, address]);

  // Fetch on connect and wallet change
  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // Periodic refresh
  useEffect(() => {
    if (!connected) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(fetchBalances, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [connected, fetchBalances]);

  return {
    tokens,
    loading,
    initialLoading,
    error,
    refetch: fetchBalances,
  };
}
