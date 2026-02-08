'use client';

import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

/* ── Chain logo SVGs ─────────────────────────────────────────────── */

function SolanaLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="10" cy="10" r="10" fill="#000" />
      <defs>
        <linearGradient id="sol-g" x1="3" y1="15" x2="17" y2="5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF" />
          <stop offset="0.5" stopColor="#14F195" />
          <stop offset="1" stopColor="#00D1FF" />
        </linearGradient>
      </defs>
      <path
        d="M5.5 12.8h7.6c.15 0 .23.18.12.28l-1.5 1.5c-.05.05-.12.08-.19.08H4c-.15 0-.23-.18-.12-.28l1.5-1.5a.27.27 0 01.12-.08z"
        fill="url(#sol-g)"
      />
      <path
        d="M5.5 5.34h7.6c.15 0 .23.18.12.28l-1.5 1.5c-.05.05-.12.08-.19.08H4c-.15 0-.23-.18-.12-.28l1.5-1.5A.27.27 0 015.5 5.34z"
        fill="url(#sol-g)"
      />
      <path
        d="M11.68 9.04H4.08c-.15 0-.23.18-.12.28l1.5 1.5c.05.05.12.08.19.08h7.47c.15 0 .23-.18.12-.28l-1.5-1.5a.27.27 0 00-.06-.08z"
        fill="url(#sol-g)"
      />
    </svg>
  );
}

function EthereumLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="10" cy="10" r="10" fill="#627EEA" />
      <path d="M10 3v5.2l4.4 2-4.4-7.2z" fill="#fff" fillOpacity="0.6" />
      <path d="M10 3L5.6 10.2l4.4-2V3z" fill="#fff" />
      <path d="M10 13.6v3.8l4.4-6.1-4.4 2.3z" fill="#fff" fillOpacity="0.6" />
      <path d="M10 17.4v-3.8L5.6 11.3l4.4 6.1z" fill="#fff" />
      <path d="M10 12.8l4.4-2.6L10 8.2v4.6z" fill="#fff" fillOpacity="0.2" />
      <path d="M5.6 10.2l4.4 2.6V8.2l-4.4 2z" fill="#fff" fillOpacity="0.6" />
    </svg>
  );
}

function PolygonLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="10" cy="10" r="10" fill="#8247E5" />
      <path
        d="M13.2 8.4c-.3-.17-.67-.17-.97 0l-1.6.93-.93.52-1.6.93c-.3.17-.67.17-.97 0l-1.24-.73c-.3-.17-.48-.5-.48-.85V7.87c0-.35.18-.67.48-.85l1.23-.7c.3-.18.67-.18.97 0l1.23.7c.3.18.48.5.48.85v.93l.93-.54v-.96c0-.35-.18-.67-.48-.85L8.2 5.3c-.3-.17-.67-.17-.97 0L5.14 6.45c-.3.18-.48.5-.48.85v2.25c0 .35.18.67.48.85l2.1 1.2c.3.17.67.17.97 0l1.6-.9.93-.55 1.6-.9c.3-.17.67-.17.97 0l1.23.7c.3.18.48.5.48.85v1.37c0 .35-.18.67-.48.85l-1.2.7c-.3.18-.67.18-.97 0l-1.23-.7c-.3-.18-.48-.5-.48-.85v-.9l-.93.54v.93c0 .35.18.67.48.85l2.1 1.2c.3.17.67.17.97 0l2.1-1.2c.3-.18.48-.5.48-.85V9.4c0-.35-.18-.67-.48-.85l-2.13-1.15z"
        fill="#fff"
      />
    </svg>
  );
}

function ArbitrumLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="10" cy="10" r="10" fill="#213147" />
      <path
        d="M11.2 7.8l1.9 3.1.7-1.1-1.6-2.6c-.15-.23-.5-.23-.65 0l-.35.6zm2.3 5l.8-1.3-2.05-3.35-.8 1.3L13.5 12.8z"
        fill="#28A0F0"
      />
      <path d="M10 14l3.5-2.1.3.5-3.5 2.1-.3-.5z" fill="#28A0F0" />
      <path d="M6.2 12.8l2.1-3.35-.8-1.3-2.05 3.35.75 1.3z" fill="#fff" />
      <path d="M8.85 7.8c-.15-.23-.5-.23-.65 0L6.6 9.8l.7 1.1 1.9-3.1-.35-.6v.6z" fill="#fff" />
      <path d="M10 14l-3.5-2.1.3.5L10 14.5l3.2-2.1.3-.5L10 14z" fill="#fff" />
    </svg>
  );
}

function OptimismLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="10" cy="10" r="10" fill="#FF0420" />
      <path
        d="M7.4 12.3c-.95 0-1.7-.32-2.2-.95-.5-.63-.72-1.5-.63-2.58.1-1.1.45-2 1.06-2.65.62-.65 1.43-.98 2.42-.98.6 0 1.1.13 1.5.38.4.25.7.6.88 1.05.18.44.24.95.18 1.52h-1.35c.04-.5-.04-.9-.24-1.18-.2-.28-.52-.42-.98-.42-.5 0-.92.2-1.25.6-.33.4-.53.96-.6 1.68-.07.7.03 1.23.3 1.58.27.35.66.52 1.16.52.43 0 .8-.13 1.1-.4.3-.27.5-.64.6-1.1h1.35c-.15.8-.5 1.43-1.04 1.88-.55.44-1.22.66-2.03.66zm5.02-.14l.55-4.88h1.3l-.1.88c.2-.34.44-.6.72-.77.28-.17.6-.25.96-.25l-.18 1.36c-.4-.02-.76.07-1.06.28-.3.21-.48.52-.55.93l-.32 2.45h-1.32z"
        fill="#fff"
      />
    </svg>
  );
}

function BaseLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="10" cy="10" r="10" fill="#0052FF" />
      <path
        d="M10 16c3.3 0 6-2.7 6-6s-2.7-6-6-6c-3.1 0-5.6 2.3-6 5.3h7.9v1.4H4c.4 3 2.9 5.3 6 5.3z"
        fill="#fff"
      />
    </svg>
  );
}

const CHAIN_LOGOS: Record<string, (props: { size?: number }) => React.ReactElement> = {
  solana: SolanaLogo,
  '1': EthereumLogo,
  '137': PolygonLogo,
  '42161': ArbitrumLogo,
  '10': OptimismLogo,
  '8453': BaseLogo,
};

export function ChainIcon({ chainId, size = 20 }: { chainId: string; size?: number }) {
  const Logo = CHAIN_LOGOS[chainId];
  if (Logo) return <Logo size={size} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill="#666" />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="white"
        fontSize={size * 0.45}
        fontWeight={700}
      >
        ?
      </text>
    </svg>
  );
}

export interface ChainOption {
  value: string;
  label: string;
}

interface ChainSelectProps {
  value: string;
  onChange: (chainId: string) => void;
  options: ChainOption[];
  placeholder?: string;
  disabled?: boolean;
}

const styles = stylex.create({
  container: {
    position: 'relative',
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    height: '48px',
    paddingTop: '12px',
    paddingBottom: '12px',
    paddingLeft: '12px',
    paddingRight: '20px',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.full,
    borderWidth: 0,
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'inherit',
    color: colors.foreground,
    transitionProperty: 'background-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    flexShrink: 0,
    ':hover': {
      backgroundColor: colors.surfaceOverlay,
    },
  },
  triggerDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  triggerPlaceholder: {
    color: colors.muted,
  },
  chevron: {
    flexShrink: 0,
    color: colors.muted,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: space.xs,
    minWidth: '200px',
    backgroundColor: colors.surface,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: radii.md,
    zIndex: 50,
    overflow: 'hidden',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
    paddingLeft: space.lg,
    paddingRight: space.lg,
    cursor: 'pointer',
    backgroundColor: {
      default: 'transparent',
      ':hover': colors.surfaceRaised,
    },
  },
  optionSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  optionLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: colors.foreground,
  },
});

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChainSelect({
  value,
  onChange,
  options,
  placeholder = 'Chain',
  disabled = false,
}: ChainSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (chainId: string) => {
    onChange(chainId);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div
      {...stylex.props(styles.container)}
      ref={containerRef}
      role="combobox"
      aria-expanded={open}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        {...stylex.props(styles.trigger, disabled && styles.triggerDisabled)}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        {selected ? (
          <>
            <ChainIcon chainId={selected.value} />
            <span>{selected.label}</span>
          </>
        ) : (
          <span {...stylex.props(styles.triggerPlaceholder)}>{placeholder}</span>
        )}
        <span {...stylex.props(styles.chevron)}>
          <ChevronDown />
        </span>
      </button>
      {open && (
        <div {...stylex.props(styles.dropdown)} role="listbox">
          {options.map((chain) => (
            <div
              key={chain.value}
              {...stylex.props(styles.option, chain.value === value && styles.optionSelected)}
              role="option"
              aria-selected={chain.value === value}
              tabIndex={0}
              onClick={() => handleSelect(chain.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(chain.value);
                }
              }}
            >
              <ChainIcon chainId={chain.value} size={24} />
              <span {...stylex.props(styles.optionLabel)}>{chain.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
