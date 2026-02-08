import { env } from './env';

export const SOLANA_CHAIN_ID = '7565164'; // Used by DeBridge
export const RELAY_SOLANA_CHAIN_ID = 792703809; // Relay uses a different chain ID for Solana

// Fee configuration — Number() guards against SKIP_ENV_VALIDATION passing raw strings
export const FEE_VOLATILITY_BUFFER = Number(env.FEE_VOLATILITY_BUFFER ?? 0.15);
export const MAX_QUOTE_DRIFT = Number(env.MAX_QUOTE_DRIFT ?? 0.02);
export const QUOTE_EXPIRY_SECONDS = Number(env.QUOTE_EXPIRY_SECONDS ?? 30);

// Solana constants
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const RENT_EXEMPT_LAMPORTS = 2_039_280; // Typical rent-exempt minimum for token accounts

// Token addresses (mainnet)
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOL_MINT = 'So11111111111111111111111111111111111111112'; // Wrapped SOL
export const NATIVE_SOL = 'native'; // Native SOL identifier
// Both Relay and DeBridge use the System Program address for native SOL
export const NATIVE_SOL_ADDRESS = '11111111111111111111111111111111';

// RPC configuration
export const SOLANA_RPC_URL = env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
export const SOLANA_WS_URL = env.SOLANA_RPC_WEBSOCKET_URL;

// Bridge provider URLs
export const RELAY_API_URL = env.RELAY_API_URL;
export const DEBRIDGE_API_URL = env.DEBRIDGE_API_URL;

// API / HTTP
export const API_TIMEOUT_MS = 30_000;

// Quote validity — derived from QUOTE_EXPIRY_SECONDS for consistency
export const QUOTE_VALIDITY_MS = QUOTE_EXPIRY_SECONDS * 1000;

// Default estimated bridge durations (seconds) when API doesn't provide one
export const DEFAULT_DEBRIDGE_DURATION_SECS = 180;
export const DEFAULT_RELAY_DURATION_SECS = 300;

// Solana base fee — protocol constant: 5000 lamports per signature
export const SOLANA_BASE_FEE_LAMPORTS = 5_000;

// DeBridge order rent: the DLN program transfers SOL from the user via CPI
// to create the on-chain order PDA.  In sponsored mode the sponsor must
// advance this amount to the user before the bridge instruction runs.
// Observed value: 17,115,840 lamports (~0.0171 SOL).  Rent is deterministic
// for a given account data size, so a small buffer suffices.
export const DEBRIDGE_ORDER_RENT_LAMPORTS = 18_000_000;

// Swap monitoring
export const MONITOR_POLL_INTERVAL_MS = 5_000;
export const MONITOR_MAX_ATTEMPTS = 60; // 5 minutes at MONITOR_POLL_INTERVAL_MS

// Platform fees (can be 0 for no platform fee)
export const PLATFORM_FEE_BPS = 0; // 0 basis points = no fee
