// ---------------------------------------------------------------------------
// DeBridge DLN API response types
// Docs: https://dln.debridge.finance
// ---------------------------------------------------------------------------

/** GET /v1.0/dln/order/create-tx */
export interface DeBridgeCreateTxResponse {
  orderId?: string;
  estimation?: DeBridgeEstimation;
  order?: DeBridgeOrder;
  tx?: DeBridgeTx;
  estimatedTransactionFee?: DeBridgeTransactionFee;
  fixFee?: string | number;
  protocolFee?: string | number;
  srcChainOrderAuthorityAddress?: string;
}

export interface DeBridgeEstimation {
  srcChainTokenIn?: DeBridgeTokenAmount;
  dstChainTokenOut?: DeBridgeTokenAmount;
  costsDetails?: DeBridgeCostDetail[];
  /** Price impact in USD percentage (e.g. -0.08 means 0.08% loss) */
  usdPriceImpact?: number;
  /** Recommended slippage for this trade */
  recommendedSlippage?: number;
}

export interface DeBridgeTokenAmount {
  address?: string;
  chainId?: string | number;
  amount?: string;
  recommendedAmount?: string;
  approximateUsdValue?: number;
}

export interface DeBridgeCostDetail {
  payload?: {
    feeAmount?: string;
  };
}

export interface DeBridgeOrder {
  approximateFulfillmentDelay?: number;
}

export interface DeBridgeTx {
  data?: string;
}

export interface DeBridgeTransactionFee {
  details?: {
    txFee?: string | number;
    priorityFee?: string | number;
  };
}

/** GET /v1.0/dln/order/{id} */
export interface DeBridgeOrderStatusResponse {
  status?: string;
  orderId?: string;
  orderStruct?: {
    receiverDst?: string;
  };
  externalCallState?: string;
}

/** GET /v1.0/token-list */
export interface DeBridgeTokenListResponse {
  tokens?: Record<string, DeBridgeTokenEntry>;
}

export interface DeBridgeTokenEntry {
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  logoURI?: string;
}

// ---------------------------------------------------------------------------
// rawQuote shape stored by DeBridgeProvider
// ---------------------------------------------------------------------------

export interface DeBridgeRawQuote extends DeBridgeCreateTxResponse {
  dstChainTokenOutRecipient: string;
  _requestParams: {
    srcChainTokenIn: string;
    dstChainId: string;
    dstChainTokenOut: string;
  };
}
