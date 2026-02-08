'use client';

import * as stylex from '@stylexjs/stylex';
import { type UiWallet, type UiWalletAccount, useConnect } from '@wallet-standard/react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { AddressAvatar } from '@/components/ui/AddressAvatar';
import { useWalletContext } from '@/hooks/useWalletContext';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

const styles = stylex.create({
  container: {
    position: 'relative',
    display: 'inline-block',
  },
  connectButton: {
    backgroundColor: 'transparent',
    color: colors.foreground,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingBlock: space.sm,
    paddingInline: space.lg,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    fontFamily: 'inherit',
    transitionProperty: 'border-color, background-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ':hover': {
      borderColor: colors.primary,
    },
  },
  amberDot: {
    width: '8px',
    height: '8px',
    borderRadius: radii.full,
    backgroundColor: colors.amber,
    flexShrink: 0,
  },
  accountButton: {
    backgroundColor: colors.surfaceRaised,
    color: colors.foreground,
    border: 'none',
    borderRadius: radii.full,
    paddingBlock: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.lg,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    fontFamily: 'inherit',
    transitionProperty: 'background-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ':hover': {
      backgroundColor: colors.surfaceOverlay,
    },
  },
  addressText: {
    fontFamily: 'monospace',
    letterSpacing: '-0.02em',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: '0',
    marginTop: space.xs,
    backgroundColor: colors.surface,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: radii.md,
    minWidth: '200px',
    zIndex: 50,
    overflow: 'hidden',
  },
  dropdownAddress: {
    paddingBlock: space.sm,
    paddingInline: space.lg,
    fontSize: '12px',
    color: colors.muted,
    fontFamily: 'monospace',
    wordBreak: 'break-all',
    lineHeight: '1.4',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: colors.border,
  },
  walletItem: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    paddingBlock: space.sm,
    paddingInline: space.lg,
    width: '100%',
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.foreground,
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    ':hover': {
      backgroundColor: colors.surfaceRaised,
    },
  },
  walletIcon: {
    width: '24px',
    height: '24px',
    borderRadius: radii.sm,
  },
  disconnectItem: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    paddingBlock: space.sm,
    paddingInline: space.lg,
    width: '100%',
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.error,
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    ':hover': {
      backgroundColor: colors.surfaceRaised,
    },
  },
  noWalletsText: {
    color: colors.muted,
    fontSize: '13px',
    cursor: 'default',
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
  errorText: {
    color: colors.error,
    fontSize: '13px',
    cursor: 'default',
    lineHeight: '1.4',
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
  copyButton: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    paddingBlock: space.sm,
    paddingInline: space.lg,
    width: '100%',
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.muted,
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    ':hover': {
      backgroundColor: colors.surfaceRaised,
    },
  },
});

function WalletOption({
  wallet,
  onConnected,
  onError,
}: {
  wallet: UiWallet;
  onConnected: (account: UiWalletAccount) => void;
  onError: (message: string) => void;
}) {
  const [isConnecting, connect] = useConnect(wallet);

  const handleClick = async () => {
    try {
      const accounts = await connect();
      const first = accounts[0];
      if (first) {
        onConnected(first);
      } else {
        onError(`${wallet.name} did not return a Solana account. It may not support Solana.`);
      }
    } catch {
      onError(`Failed to connect ${wallet.name}. This wallet may not support Solana.`);
    }
  };

  return (
    <button {...stylex.props(styles.walletItem)} onClick={handleClick} disabled={isConnecting}>
      {wallet.icon && (
        <Image
          {...stylex.props(styles.walletIcon)}
          src={wallet.icon}
          alt={wallet.name}
          width={24}
          height={24}
          unoptimized
        />
      )}
      {isConnecting ? 'Connecting...' : wallet.name}
    </button>
  );
}

export function WalletButton() {
  const { address, connected, wallets, setSelectedAccount, disconnect } = useWalletContext();
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const handleCopy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (connected && address) {
    return (
      <div {...stylex.props(styles.container)} ref={containerRef}>
        <button
          {...stylex.props(styles.accountButton)}
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <AddressAvatar address={address} size={24} />
          <span {...stylex.props(styles.addressText)}>
            {address.slice(0, 4)}...{address.slice(-4)}
          </span>
        </button>
        {showDropdown && (
          <div {...stylex.props(styles.dropdown)}>
            <div {...stylex.props(styles.dropdownAddress)}>{address}</div>
            <button {...stylex.props(styles.copyButton)} onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy address'}
            </button>
            <button
              {...stylex.props(styles.disconnectItem)}
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.container)} ref={containerRef}>
      <button
        {...stylex.props(styles.connectButton)}
        onClick={() => {
          setShowDropdown(!showDropdown);
          setConnectError(null);
        }}
      >
        <span {...stylex.props(styles.amberDot)} />
        Connect
      </button>
      {showDropdown && (
        <div {...stylex.props(styles.dropdown)}>
          {connectError && (
            <div {...stylex.props(styles.walletItem, styles.errorText)}>{connectError}</div>
          )}
          {wallets.length === 0 && (
            <div {...stylex.props(styles.walletItem, styles.noWalletsText)}>
              No Solana wallets found. Install Phantom or Backpack to continue.
            </div>
          )}
          {wallets.map((wallet) => (
            <WalletOption
              key={wallet.name}
              wallet={wallet}
              onConnected={(account) => {
                setConnectError(null);
                setSelectedAccount(account);
                setShowDropdown(false);
              }}
              onError={setConnectError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
