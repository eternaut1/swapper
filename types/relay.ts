// ---------------------------------------------------------------------------
// Relay API response types
// Docs: https://api.relay.link
// ---------------------------------------------------------------------------

/** POST /quote/v2 */
export interface RelayQuoteResponse {
  details?: RelayQuoteDetails;
  steps?: RelayStep[];
  fees?: RelayFees;
}

export interface RelayQuoteDetails {
  currencyOut?: {
    amount?: string;
  };
  timeEstimate?: number;
  /** Swap-only price impact (excludes fees) */
  swapImpact?: {
    usd?: string;
    percent?: string;
  };
  /** Total impact including fees */
  totalImpact?: {
    usd?: string;
    percent?: string;
  };
}

export interface RelayStep {
  requestId?: string;
  items?: RelayStepItem[];
}

export interface RelayStepItem {
  data?: {
    instructions?: RelayInstruction[];
  };
}

export interface RelayInstruction {
  programId?: string;
  keys?: RelayAccountKey[];
  data?: string;
}

export interface RelayAccountKey {
  pubkey?: string;
  isSigner?: boolean;
  isWritable?: boolean;
}

export interface RelayFees {
  relayer?: {
    amount?: string;
  };
}

/** GET /intents/status/v3 */
export interface RelayStatusResponse {
  status?: string;
  originTxHash?: string;
  inTxHash?: string;
  destinationTxHash?: string;
  outTxHash?: string;
  step?: string;
  error?: string;
  message?: string;
}

/** GET /chains */
export interface RelayChainsResponse {
  chains?: RelayChain[];
}

export interface RelayChain {
  id?: number | string;
  disabled?: boolean;
  currency?: RelayCurrency;
  erc20Currencies?: RelayCurrency[];
}

export interface RelayCurrency {
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  supportsBridging?: boolean;
}

// ---------------------------------------------------------------------------
// rawQuote shape stored by RelayProvider
// ---------------------------------------------------------------------------

export interface RelayRawQuote extends RelayQuoteResponse {
  _requestParams: {
    originCurrency: string;
    destinationCurrency: string;
    originChainId: number;
    destinationChainId: number;
    user: string;
    recipient: string;
  };
}
