import { useRef, useState } from 'react';
import { executeSwapAction, prepareSwapAction } from '@/app/actions/swap';
import type { BridgeQuote } from '@/types/bridge';

interface SwapState {
  loading: boolean;
  error: string | null;
  quote: BridgeQuote | null;
  swapId: string | null;
  signature: string | null;
  status: string | null;
}

export function useSwap(
  address: string | null,
  signTransaction:
    | ((input: { transaction: Uint8Array }) => Promise<{ signedTransaction: Uint8Array }>)
    | null,
) {
  const [state, setState] = useState<SwapState>({
    loading: false,
    error: null,
    quote: null,
    swapId: null,
    signature: null,
    status: null,
  });

  const requestIdRef = useRef(0);

  const getQuote = async (params: {
    sourceToken: string;
    sourceAmount: string;
    destChain: string;
    destToken: string;
    destWallet: string;
  }) => {
    if (!address) {
      setState((prev) => ({ ...prev, error: 'Wallet not connected' }));
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          userWallet: address,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to get quote');
      }

      // Discard stale response if a newer request was made
      if (currentRequestId !== requestIdRef.current) return;

      setState((prev) => ({
        ...prev,
        quote: data.bestQuote,
        loading: false,
      }));

      return data.bestQuote;
    } catch (error: unknown) {
      if (currentRequestId !== requestIdRef.current) return;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        loading: false,
      }));
      throw error;
    }
  };

  const executeSwap = async (quote: BridgeQuote, feeToken: 'USDC' | 'SOL' = 'USDC') => {
    if (!address || !signTransaction) {
      setState((prev) => ({ ...prev, error: 'Wallet not connected or does not support signing' }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Step 1: Prepare swap using Server Action
      const prepareData = await prepareSwapAction(quote, address, feeToken);

      if (!prepareData.success || !prepareData.transaction || !prepareData.swapId) {
        throw new Error(prepareData.error || 'Failed to prepare swap');
      }

      // Step 2: Sign transaction (raw bytes, no VersionedTransaction)
      const txBytes = new Uint8Array(Buffer.from(prepareData.transaction, 'base64'));
      const { signedTransaction } = await signTransaction({ transaction: txBytes });

      // Step 3: Execute swap using Server Action
      const confirmData = await executeSwapAction(
        prepareData.swapId,
        Buffer.from(signedTransaction).toString('base64'),
      );

      if (!confirmData.success || !confirmData.swapId || !confirmData.signature) {
        throw new Error(confirmData.error || 'Failed to execute swap');
      }

      setState((prev) => ({
        ...prev,
        swapId: confirmData.swapId ?? null,
        signature: confirmData.signature ?? null,
        status: confirmData.status ?? null,
        loading: false,
      }));

      return confirmData;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute swap';
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        loading: false,
      }));
      throw error;
    }
  };

  const getStatus = async (swapId: string) => {
    try {
      const response = await fetch(`/api/status/${swapId}`);
      const data = await response.json();

      if (data.success) {
        setState((prev) => ({ ...prev, status: data.status }));
        return data;
      }
    } catch (_error) {
      // Status polling failure is non-critical
    }
  };

  const reset = () => {
    setState({
      loading: false,
      error: null,
      quote: null,
      swapId: null,
      signature: null,
      status: null,
    });
  };

  const clearQuote = () => {
    setState((prev) => ({ ...prev, quote: null }));
  };

  return {
    ...state,
    getQuote,
    executeSwap,
    getStatus,
    reset,
    clearQuote,
  };
}
