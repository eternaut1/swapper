'use client';

import { SelectedWalletAccountContextProvider, useSelectedWalletAccount } from '@solana/react';
import { type UiWallet, type UiWalletAccount, useConnect } from '@wallet-standard/react';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'selectedSolanaWallet';

function isSolanaWallet(wallet: UiWallet): boolean {
  return wallet.chains.some((chain) => chain.startsWith('solana:'));
}

/**
 * Calls connect() on a previously-authorised wallet and reports the first
 * account back.  Rendered only when auto-reconnect is needed.
 */
function ReconnectBridge({
  wallet,
  onConnected,
  onFailed,
}: {
  wallet: UiWallet;
  onConnected: (account: UiWalletAccount) => void;
  onFailed: () => void;
}) {
  const [, connect] = useConnect(wallet);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    connect()
      .then((accounts) => {
        const first = accounts[0];
        if (first) onConnected(first);
        else onFailed();
      })
      .catch(() => onFailed());
  }, [connect, onConnected, onFailed]);

  return null;
}

/**
 * Auto-reconnects to a previously-selected wallet on page reload.
 *
 * SelectedWalletAccountContextProvider stores a composite key in the format
 * "WalletName:address" via stateSync.  On reload it can restore the selection
 * only if the wallet already exposes matching accounts — which requires
 * connect() to have been called.  This component bridges that gap.
 */
function AutoReconnect() {
  const [selectedAccount, setSelectedAccount, wallets] = useSelectedWalletAccount();
  const [target, setTarget] = useState<UiWallet | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // Already connected or already attempted
    if (selectedAccount || ran.current) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      ran.current = true;
      return;
    }

    // The provider stores "WalletName:address" — extract the wallet name
    const walletName = stored.split(':')[0];
    if (!walletName) {
      ran.current = true;
      return;
    }

    // Wait until the wallet registers (may be async)
    const wallet = wallets.find((w) => w.name === walletName);
    if (!wallet) return;

    ran.current = true;

    // If the wallet already exposes accounts (auto-approved), select immediately
    const existing = wallet.accounts[0];
    if (existing) {
      setSelectedAccount(existing);
      return;
    }

    // Otherwise trigger an explicit connect()
    setTarget(wallet);
  }, [selectedAccount, wallets, setSelectedAccount]);

  const handleConnected = useCallback(
    (account: UiWalletAccount) => {
      setSelectedAccount(account);
      setTarget(null);
    },
    [setSelectedAccount],
  );

  const handleFailed = useCallback(() => setTarget(null), []);

  if (!target) return null;
  return <ReconnectBridge wallet={target} onConnected={handleConnected} onFailed={handleFailed} />;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <SelectedWalletAccountContextProvider
      filterWallets={isSolanaWallet}
      stateSync={{
        getSelectedWallet: () =>
          typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null,
        storeSelectedWallet: (key) => localStorage.setItem(STORAGE_KEY, key),
        deleteSelectedWallet: () => localStorage.removeItem(STORAGE_KEY),
      }}
    >
      <AutoReconnect />
      {children}
    </SelectedWalletAccountContextProvider>
  );
}
