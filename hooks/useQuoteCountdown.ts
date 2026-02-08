import { useEffect, useRef, useState } from 'react';
import type { BridgeQuote } from '@/types/bridge';

interface UseQuoteCountdownResult {
  secondsRemaining: number;
  isExpired: boolean;
}

export function useQuoteCountdown(
  quote: BridgeQuote | null,
  onExpired?: () => void,
): UseQuoteCountdownResult {
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;
  const firedRef = useRef(false);

  useEffect(() => {
    if (!quote?.validUntil) {
      setSecondsRemaining(0);
      firedRef.current = false;
      return;
    }

    firedRef.current = false;

    const calcRemaining = () => {
      const expiry = new Date(quote.validUntil).getTime();
      return Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
    };

    setSecondsRemaining(calcRemaining());

    const interval = setInterval(() => {
      const remaining = calcRemaining();
      setSecondsRemaining(remaining);
      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        clearInterval(interval);
        onExpiredRef.current?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [quote]);

  return {
    secondsRemaining,
    isExpired: secondsRemaining <= 0 && quote !== null,
  };
}
