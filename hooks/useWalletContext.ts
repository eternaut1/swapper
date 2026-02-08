'use client';

import { useSelectedWalletAccount } from '@solana/react';

export function useWalletContext() {
  const [selectedAccount, setSelectedAccount, wallets] = useSelectedWalletAccount();

  return {
    account: selectedAccount ?? null,
    address: selectedAccount?.address ?? null,
    connected: !!selectedAccount,
    wallets,
    setSelectedAccount,
    disconnect: () => setSelectedAccount(undefined),
  };
}
