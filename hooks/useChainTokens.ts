import { useEffect, useRef, useState } from 'react';
import type { TokenConfig } from '@/lib/config/tokens';

interface UseChainTokensResult {
  tokens: TokenConfig[];
  loading: boolean;
}

export function useChainTokens(chainId: string): UseChainTokensResult {
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, TokenConfig[]>>(new Map());

  useEffect(() => {
    if (!chainId) {
      setTokens([]);
      return;
    }

    // Return cached result if available
    const cached = cacheRef.current.get(chainId);
    if (cached) {
      setTokens(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/tokens?chainId=${chainId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && data.tokens) {
          cacheRef.current.set(chainId, data.tokens);
          setTokens(data.tokens);
        }
      })
      .catch(() => {
        // Non-critical — tokens list may just be empty
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chainId]);

  return { tokens, loading };
}
