export type TokenType = 'spl' | 'token-2022';

export interface AccountStatus {
  exists: boolean;
  balance: bigint;
  hasDust: boolean;
  isCloseable: boolean;
  owner: string;
}

export interface TokenInfo {
  mint: string;
  decimals: number;
  type: TokenType;
  transferFeeConfig?: TransferFeeConfig;
}

export interface TransferFeeConfig {
  transferFeeBasisPoints: number;
  maximumFee: bigint;
}

export interface ATAInfo {
  address: string;
  needsCreation: boolean;
  rentCost: number;
}

export interface TokenBalanceInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  uiBalance: string;
  logoURI?: string;
}
