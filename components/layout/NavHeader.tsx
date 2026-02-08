'use client';

import * as stylex from '@stylexjs/stylex';
import Link from 'next/link';
import { WalletButton } from '@/components/wallet/WalletButton';
import { colors, space } from '../../styles/tokens/aero.stylex';

const styles = stylex.create({
  header: {
    width: '100%',
    maxWidth: '576px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBlock: space.xxl,
  },
  logo: {
    fontSize: '18px',
    fontWeight: 700,
    color: colors.foreground,
    letterSpacing: '-0.02em',
    textDecoration: 'none',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: space.lg,
  },
  navLink: {
    fontSize: '14px',
    fontWeight: 500,
    color: colors.muted,
    textDecoration: 'none',
    transitionProperty: 'color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ':hover': {
      color: colors.foreground,
    },
  },
});

export function NavHeader() {
  return (
    <header {...stylex.props(styles.header)}>
      <Link href="/" {...stylex.props(styles.logo)}>
        Swapper
      </Link>
      <div {...stylex.props(styles.right)}>
        <Link href="/history" {...stylex.props(styles.navLink)}>
          History
        </Link>
        <WalletButton />
      </div>
    </header>
  );
}
