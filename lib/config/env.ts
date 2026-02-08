import 'server-only';
/**
 * Modern type-safe environment variables using @t3-oss/env-nextjs
 * This properly validates env vars and separates client/server concerns
 */

import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  /**
   * Server-side environment variables
   * These are only available on the server and never sent to the client
   */
  server: {
    // Database
    DATABASE_URL: z.string().url().optional(), // Optional for build time

    // Solana
    SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
    SOLANA_RPC_WEBSOCKET_URL: z.string().url().optional(),
    SPONSOR_WALLET_PRIVATE_KEY: z.string().min(1).optional(), // Optional for build time

    // Bridge APIs
    RELAY_API_URL: z.string().url().default('https://api.relay.link'),
    RELAY_API_KEY: z.string().optional(),
    DEBRIDGE_API_URL: z.string().url().default('https://dln.debridge.finance'),

    // Application settings
    FEE_VOLATILITY_BUFFER: z.coerce.number().default(0.15),
    MAX_QUOTE_DRIFT: z.coerce.number().default(0.02),
    QUOTE_EXPIRY_SECONDS: z.coerce.number().int().default(30),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // Node environment
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  },

  /**
   * Client-side environment variables
   * These are exposed to the browser and must be prefixed with NEXT_PUBLIC_
   */
  client: {
    // Add any public env vars here, e.g.:
    // NEXT_PUBLIC_APP_URL: z.string().url(),
  },

  /**
   * Destructure all variables from `process.env` here
   * This is required for the validation to work properly
   */
  runtimeEnv: {
    // Server
    DATABASE_URL: process.env['DATABASE_URL'],
    SOLANA_RPC_URL: process.env['SOLANA_RPC_URL'],
    SOLANA_RPC_WEBSOCKET_URL: process.env['SOLANA_RPC_WEBSOCKET_URL'],
    SPONSOR_WALLET_PRIVATE_KEY: process.env['SPONSOR_WALLET_PRIVATE_KEY'],
    RELAY_API_URL: process.env['RELAY_API_URL'],
    RELAY_API_KEY: process.env['RELAY_API_KEY'],
    DEBRIDGE_API_URL: process.env['DEBRIDGE_API_URL'],
    FEE_VOLATILITY_BUFFER: process.env['FEE_VOLATILITY_BUFFER'],
    MAX_QUOTE_DRIFT: process.env['MAX_QUOTE_DRIFT'],
    QUOTE_EXPIRY_SECONDS: process.env['QUOTE_EXPIRY_SECONDS'],
    LOG_LEVEL: process.env['LOG_LEVEL'],
    NODE_ENV: process.env['NODE_ENV'],

    // Client (none yet)
  },

  /**
   * Skip validation only if explicitly requested via SKIP_ENV_VALIDATION
   * This ensures defaults are still applied during build
   */
  skipValidation: !!process.env['SKIP_ENV_VALIDATION'],

  /**
   * Makes it so that empty strings are treated as undefined.
   * Recommended for cleaner environment variable handling
   */
  emptyStringAsUndefined: true,
});
