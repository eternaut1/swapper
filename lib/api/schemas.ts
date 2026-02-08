import { isAddress as isEvmAddress } from 'viem';
import { z } from 'zod';
import { ValidationError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Reusable refinements
// ---------------------------------------------------------------------------

const evmAddress = z.string().refine(isEvmAddress, 'Invalid EVM address');
const solanaAddress = z.string().min(32, 'Invalid Solana address').max(44);
const positiveAmountString = z
  .string()
  .min(1, 'Amount is required')
  .refine((v) => {
    const n = Number(v);
    return !Number.isNaN(n) && n > 0;
  }, 'Amount must be a positive number');

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const quoteSchema = z.object({
  sourceToken: solanaAddress,
  sourceAmount: positiveAmountString,
  destChain: z.string().min(1, 'Destination chain is required'),
  destToken: evmAddress,
  userWallet: solanaAddress,
  destWallet: evmAddress,
});

export const executeSchema = z.object({
  quote: z.record(z.string(), z.unknown()),
  userWallet: solanaAddress,
  feeToken: z.enum(['USDC', 'SOL']).default('USDC'),
});

export const confirmSchema = z.object({
  swapId: z.string().min(1, 'Swap ID is required'),
  signedTransaction: z.string().min(1, 'Signed transaction is required'),
});

export const balancesQuerySchema = z.object({
  wallet: solanaAddress,
});

export const historyQuerySchema = z.object({
  wallet: z.string().min(1, 'Wallet is required'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// Parse helper — converts ZodError → ValidationError
// ---------------------------------------------------------------------------

export function parseRequest<T>(data: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  throw new ValidationError(messages.join('; '));
}
