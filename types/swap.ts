import type { BridgeQuote, CostBreakdown } from './bridge';

export interface UserFee {
  token: 'USDC' | 'SOL';
  amount: number;
  valueUSD: number; // normalized value for comparison
}

export interface PreparedSwap {
  quote: BridgeQuote;
  transaction: Uint8Array; // serialized transaction bytes, ready for user signature
  userFee: UserFee;
  sponsorCosts: CostBreakdown;
  validUntil: Date;
  swapId: string;
}

export interface ExecutionResult {
  swapId: string;
  status: 'submitted' | 'failed';
  signature?: string;
  error?: string;
}

export interface SwapStatus {
  swapId: string;
  status: string;
  sourceChainTx?: string;
  destChainTx?: string;
  progress?: number; // 0-100
  error?: string;
}

export interface BalanceCheck {
  sufficient: boolean;
  currentBalance: bigint;
  requiredBalance: bigint;
  deficit?: bigint;
  decimals: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
