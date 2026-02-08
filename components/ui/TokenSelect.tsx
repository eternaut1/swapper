'use client';

import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { colors, radii, space } from '../../styles/tokens/aero.stylex';

const styles = stylex.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
    position: 'relative',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: colors.muted,
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    height: '48px',
    paddingTop: '12px',
    paddingBottom: '12px',
    paddingLeft: '12px',
    paddingRight: {
      default: '20px',
      '@media (max-width: 600px)': '12px',
    },
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.full,
    border: 'none',
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
  triggerPlaceholderText: {
    display: {
      default: 'inline',
      '@media (max-width: 600px)': 'none',
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
    minWidth: {
      default: '280px',
      '@media (max-width: 600px)': 0,
    },
    width: {
      default: null,
      '@media (max-width: 600px)': 'calc(100vw - 64px)',
    },
    right: {
      default: null,
      '@media (max-width: 600px)': 0,
    },
    backgroundColor: colors.surface,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: radii.md,
    zIndex: 50,
    maxHeight: '280px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  searchInput: {
    width: '100%',
    padding: space.md,
    fontSize: '13px',
    color: colors.foreground,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderBottomWidth: '1px',
    borderStyle: 'solid',
    borderColor: colors.border,
    outline: 'none',
    fontFamily: 'inherit',
    '::placeholder': {
      color: colors.subtle,
    },
  },
  optionsList: {
    overflowY: 'auto',
    maxHeight: '232px',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    cursor: 'pointer',
    backgroundColor: {
      default: 'transparent',
      ':hover': colors.surfaceRaised,
    },
  },
  optionSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  optionLogo: {
    width: '24px',
    height: '24px',
    borderRadius: radii.full,
    objectFit: 'cover',
    flexShrink: 0,
  },
  optionLogoPlaceholder: {
    width: '24px',
    height: '24px',
    borderRadius: radii.full,
    backgroundColor: colors.surfaceOverlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    color: colors.muted,
    flexShrink: 0,
  },
  optionInfo: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    flex: 1,
  },
  optionSymbol: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.foreground,
  },
  optionName: {
    fontSize: '12px',
    color: colors.muted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  optionBalance: {
    fontSize: '14px',
    color: colors.muted,
    textAlign: 'right',
    flexShrink: 0,
  },
  noResults: {
    padding: space.lg,
    textAlign: 'center',
    fontSize: '13px',
    color: colors.muted,
  },
  selectedLogo: {
    width: '24px',
    height: '24px',
    borderRadius: radii.full,
    objectFit: 'cover',
    flexShrink: 0,
  },
});

export interface TokenOption {
  address: string;
  symbol: string;
  name: string;
  logoURI?: string;
  balance?: string;
}

interface TokenSelectProps {
  label?: string;
  value: string;
  onChange: (address: string) => void;
  options: TokenOption[];
  placeholder?: string;
  disabled?: boolean;
}

function ChevronDown() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
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

export function TokenSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select token',
  disabled = false,
}: TokenSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.address === value);

  const filtered = search
    ? options.filter(
        (o) =>
          o.symbol.toLowerCase().includes(search.toLowerCase()) ||
          o.name.toLowerCase().includes(search.toLowerCase()),
      )
    : options;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  const handleSelect = (address: string) => {
    onChange(address);
    setOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  const trigger = (
    <button
      type="button"
      {...stylex.props(styles.trigger, disabled && styles.triggerDisabled)}
      onClick={() => !disabled && setOpen(!open)}
      disabled={disabled}
    >
      {selected ? (
        <>
          {selected.logoURI && (
            // biome-ignore lint/performance/noImgElement: external dynamic URLs from token metadata
            <img
              {...stylex.props(styles.selectedLogo)}
              src={selected.logoURI}
              alt={selected.symbol}
            />
          )}
          <span>{selected.symbol}</span>
        </>
      ) : (
        <span {...stylex.props(styles.triggerPlaceholder)}>
          <span {...stylex.props(styles.triggerPlaceholderText)}>{placeholder}</span>
        </span>
      )}
      <span {...stylex.props(styles.chevron)}>
        <ChevronDown />
      </span>
    </button>
  );

  return (
    <div
      {...stylex.props(styles.container)}
      ref={containerRef}
      role="combobox"
      aria-expanded={open}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {label ? <span {...stylex.props(styles.label)}>{label}</span> : null}
      {trigger}
      {open && (
        <div {...stylex.props(styles.dropdown)}>
          <input
            ref={searchRef}
            {...stylex.props(styles.searchInput)}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or symbol..."
          />
          <div {...stylex.props(styles.optionsList)} role="listbox">
            {filtered.length === 0 ? (
              <div {...stylex.props(styles.noResults)}>No tokens found</div>
            ) : (
              filtered.map((token) => (
                <div
                  key={token.address}
                  {...stylex.props(styles.option, token.address === value && styles.optionSelected)}
                  role="option"
                  aria-selected={token.address === value}
                  tabIndex={0}
                  onClick={() => handleSelect(token.address)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(token.address);
                    }
                  }}
                >
                  {token.logoURI ? (
                    // biome-ignore lint/performance/noImgElement: external dynamic URLs from token metadata
                    <img
                      {...stylex.props(styles.optionLogo)}
                      src={token.logoURI}
                      alt={token.symbol}
                    />
                  ) : (
                    <div {...stylex.props(styles.optionLogoPlaceholder)}>
                      {token.symbol.charAt(0)}
                    </div>
                  )}
                  <div {...stylex.props(styles.optionInfo)}>
                    <span {...stylex.props(styles.optionSymbol)}>{token.symbol}</span>
                    <span {...stylex.props(styles.optionName)}>{token.name}</span>
                  </div>
                  {token.balance !== undefined && (
                    <span {...stylex.props(styles.optionBalance)}>{token.balance}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
