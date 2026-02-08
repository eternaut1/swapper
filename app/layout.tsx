import * as stylex from '@stylexjs/stylex';
import type { Metadata } from 'next';
import { NavHeader } from '@/components/layout/NavHeader';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { colors } from '../styles/tokens/aero.stylex';
import './globals.css';

export const metadata: Metadata = {
  title: 'Swapper - Sponsored SVM to EVM Bridge',
  description: 'Bridge tokens from Solana to EVM chains with sponsored transactions',
};

const styles = stylex.create({
  body: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingInline: '16px',
    backgroundColor: colors.background,
  },
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body {...stylex.props(styles.body)}>
        <WalletProvider>
          <NavHeader />
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
