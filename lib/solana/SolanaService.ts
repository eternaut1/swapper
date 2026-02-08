import { address, createSolanaRpc } from '@solana/kit';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
  LAMPORTS_PER_SOL,
  RENT_EXEMPT_LAMPORTS,
  SOL_MINT,
  SOLANA_RPC_URL,
} from '@/lib/config/constants';
import type { TokenConfig } from '@/lib/config/tokens';
import { logger } from '@/lib/utils/logger';
import type {
  AccountStatus,
  ATAInfo,
  TokenBalanceInfo,
  TokenInfo,
  TokenType,
  TransferFeeConfig,
} from '@/types/solana';
import type { BalanceCheck } from '@/types/swap';

function formatUiBalance(raw: string, decimals: number): string {
  if (decimals === 0) return raw;
  const padded = raw.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, -decimals) || '0';
  const fracPart = padded.slice(-decimals).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

export class SolanaService {
  private rpc: ReturnType<typeof createSolanaRpc>;

  constructor(rpcUrl: string = SOLANA_RPC_URL) {
    this.rpc = createSolanaRpc(rpcUrl);
  }

  /**
   * Detect if token is SPL or Token-2022 by checking mint account owner
   */
  async getTokenType(mintAddress: string): Promise<TokenType> {
    try {
      const accountInfo = await this.rpc
        .getAccountInfo(address(mintAddress), { encoding: 'base64', commitment: 'confirmed' })
        .send();

      if (!accountInfo.value) {
        throw new Error(`Mint account not found: ${mintAddress}`);
      }

      if (accountInfo.value.owner === TOKEN_2022_PROGRAM_ADDRESS) return 'token-2022';
      if (accountInfo.value.owner === TOKEN_PROGRAM_ADDRESS) return 'spl';

      throw new Error(`Unknown token program for ${mintAddress}: ${accountInfo.value.owner}`);
    } catch (error) {
      throw new Error(`Failed to determine token type for ${mintAddress}: ${error}`);
    }
  }

  /**
   * Get token information including transfer fees
   */
  async getTokenInfo(mintAddress: string): Promise<TokenInfo> {
    const addr = address(mintAddress);
    const accountInfo = await this.rpc
      .getAccountInfo(addr, { encoding: 'base64', commitment: 'confirmed' })
      .send();

    if (!accountInfo.value) {
      throw new Error(`Mint account not found: ${mintAddress}`);
    }

    const owner = accountInfo.value.owner;
    const tokenType: TokenType = owner === TOKEN_2022_PROGRAM_ADDRESS ? 'token-2022' : 'spl';

    // Decode raw mint data — decimals at offset 44 (1 byte) in SPL/Token-2022 mint layout
    const data = Buffer.from((accountInfo.value.data as readonly [string, string])[0], 'base64');
    const decimals = data[44]!;

    let transferFeeConfig: TransferFeeConfig | undefined;
    if (tokenType === 'token-2022') {
      transferFeeConfig = this.parseTransferFeeExtension(data);
    }

    return {
      mint: mintAddress,
      decimals,
      type: tokenType,
      transferFeeConfig,
    };
  }

  /**
   * Calculate transfer fee for Token-2022
   */
  async getTransferFee(mintAddress: string, amount: bigint): Promise<bigint> {
    const tokenInfo = await this.getTokenInfo(mintAddress);

    if (tokenInfo.type !== 'token-2022' || !tokenInfo.transferFeeConfig) {
      return BigInt(0);
    }

    const { transferFeeBasisPoints, maximumFee } = tokenInfo.transferFeeConfig;
    const fee = (amount * BigInt(transferFeeBasisPoints)) / BigInt(10000);
    return fee > maximumFee ? maximumFee : fee;
  }

  /**
   * Check account status (balance, dust, closeable)
   */
  async checkAccountStatus(tokenAccountAddress: string): Promise<AccountStatus> {
    try {
      const addr = address(tokenAccountAddress);
      const result = await this.rpc
        .getAccountInfo(addr, {
          encoding: 'jsonParsed' as 'base64',
          commitment: 'confirmed',
        })
        .send();

      if (!result.value) {
        return {
          exists: false,
          balance: BigInt(0),
          hasDust: false,
          isCloseable: true,
          owner: '11111111111111111111111111111111',
        };
      }

      const data = result.value.data as unknown as {
        parsed?: { info?: Record<string, unknown> };
      };
      const info = data?.parsed?.info;
      if (!info) {
        throw new Error('Failed to parse token account data');
      }

      const tokenAmount = info['tokenAmount'] as { amount: string };
      const balance = BigInt(tokenAmount.amount);
      const owner = info['owner'] as string;
      const hasDust = balance > BigInt(0) && balance < BigInt(1000);
      const isCloseable = balance === BigInt(0);

      return { exists: true, balance, hasDust, isCloseable, owner };
    } catch (error) {
      throw new Error(`Failed to check account status: ${error}`);
    }
  }

  /**
   * Get or check if ATA needs to be created
   */
  async getOrCreateATA(walletAddress: string, mintAddress: string): Promise<ATAInfo> {
    const tokenType = await this.getTokenType(mintAddress);
    const programId =
      tokenType === 'token-2022' ? TOKEN_2022_PROGRAM_ADDRESS : TOKEN_PROGRAM_ADDRESS;

    // Derive ATA address using PDA
    const { findAssociatedTokenPda } = await import('@solana-program/token');
    const [ataAddr] = await findAssociatedTokenPda({
      mint: address(mintAddress),
      owner: address(walletAddress),
      tokenProgram: programId,
    });

    const accountInfo = await this.rpc
      .getAccountInfo(ataAddr, { encoding: 'base64', commitment: 'confirmed' })
      .send();

    return {
      address: ataAddr,
      needsCreation: !accountInfo.value,
      rentCost: !accountInfo.value ? RENT_EXEMPT_LAMPORTS : 0,
    };
  }

  /**
   * Validate if wallet has sufficient balance for swap + fees
   */
  async validateBalance(
    walletAddress: string,
    tokenAddress: string,
    requiredAmount: bigint,
  ): Promise<BalanceCheck> {
    try {
      // Native SOL: check wallet balance directly instead of wrapped SOL ATA
      if (tokenAddress === SOL_MINT) {
        const solBalance = BigInt(await this.getSolBalance(walletAddress));
        const sufficient = solBalance >= requiredAmount;
        return {
          sufficient,
          currentBalance: solBalance,
          requiredBalance: requiredAmount,
          deficit: sufficient ? BigInt(0) : requiredAmount - solBalance,
          decimals: 9,
        };
      }

      const tokenInfo = await this.getTokenInfo(tokenAddress);
      const ataInfo = await this.getOrCreateATA(walletAddress, tokenAddress);

      if (!ataInfo.address) {
        return {
          sufficient: false,
          currentBalance: BigInt(0),
          requiredBalance: requiredAmount,
          deficit: requiredAmount,
          decimals: tokenInfo.decimals,
        };
      }

      const accountStatus = await this.checkAccountStatus(ataInfo.address);

      if (!accountStatus.exists) {
        return {
          sufficient: false,
          currentBalance: BigInt(0),
          requiredBalance: requiredAmount,
          deficit: requiredAmount,
          decimals: tokenInfo.decimals,
        };
      }

      const currentBalance = accountStatus.balance;
      let effectiveRequired = requiredAmount;
      if (tokenInfo.transferFeeConfig) {
        const transferFee = await this.getTransferFee(tokenAddress, requiredAmount);
        effectiveRequired = requiredAmount + transferFee;
      }

      const sufficient = currentBalance >= effectiveRequired;

      return {
        sufficient,
        currentBalance,
        requiredBalance: effectiveRequired,
        deficit: sufficient ? BigInt(0) : effectiveRequired - currentBalance,
        decimals: tokenInfo.decimals,
      };
    } catch (error) {
      throw new Error(`Failed to validate balance: ${error}`);
    }
  }

  /**
   * Get SOL balance for a wallet (in lamports)
   */
  async getSolBalance(walletAddress: string): Promise<number> {
    const result = await this.rpc
      .getBalance(address(walletAddress), { commitment: 'confirmed' })
      .send();
    return Number(result.value);
  }

  /**
   * Get token balance for a wallet
   */
  async getTokenBalance(walletAddress: string, mintAddress: string): Promise<bigint> {
    try {
      const ataInfo = await this.getOrCreateATA(walletAddress, mintAddress);

      if (ataInfo.needsCreation) {
        return BigInt(0);
      }

      const accountStatus = await this.checkAccountStatus(ataInfo.address);
      return accountStatus.balance;
    } catch (error) {
      logger.error(
        'Failed to get token balance:',
        error instanceof Error ? error : { error: String(error) },
      );
      return BigInt(0);
    }
  }

  /**
   * Get all token balances for a wallet.
   * Returns every non-zero SPL / Token-2022 account plus native SOL.
   * Uses 3 RPC calls total (SOL balance + SPL accounts + Token-2022 accounts).
   *
   * @param knownTokens Optional metadata for enrichment (symbol, name, logo).
   *   Tokens not in this list are still returned — with the mint address as symbol.
   */
  async getWalletTokenBalances(
    walletAddress: string,
    knownTokens: TokenConfig[] = [],
  ): Promise<TokenBalanceInfo[]> {
    const walletAddr = address(walletAddress);

    // Build a lookup map: mint address (lowercase) -> TokenConfig (for metadata only)
    const metadataMap = new Map<string, TokenConfig>();
    for (const token of knownTokens) {
      metadataMap.set(token.address.toLowerCase(), token);
    }

    // Fetch SOL balance + all SPL/Token-2022 accounts in parallel.
    // SPL query must succeed — if it fails (e.g. RPC rate limit), throw so the
    // client retries instead of showing incomplete data.
    // Token-2022 is optional (most wallets don't have these).
    const [balanceResult, splAccounts, token2022Accounts] = await Promise.all([
      this.rpc.getBalance(walletAddr, { commitment: 'confirmed' }).send(),
      this.rpc
        .getTokenAccountsByOwner(
          walletAddr,
          { programId: TOKEN_PROGRAM_ADDRESS },
          { encoding: 'jsonParsed' as 'base64', commitment: 'confirmed' },
        )
        .send(),
      this.rpc
        .getTokenAccountsByOwner(
          walletAddr,
          { programId: TOKEN_2022_PROGRAM_ADDRESS },
          { encoding: 'jsonParsed' as 'base64', commitment: 'confirmed' },
        )
        .send()
        .catch(() => ({ value: [] as unknown[] })),
    ]);

    const results: TokenBalanceInfo[] = [];

    // Always include native SOL
    const solLamports = Number(balanceResult.value);
    const solBalance = solLamports.toString();
    const solUi = (solLamports / LAMPORTS_PER_SOL).toFixed(9).replace(/\.?0+$/, '');
    const solMeta = metadataMap.get(SOL_MINT.toLowerCase());
    results.push({
      address: SOL_MINT,
      symbol: solMeta?.symbol || 'SOL',
      name: solMeta?.name || 'Solana',
      decimals: 9,
      balance: solBalance,
      uiBalance: solUi,
      logoURI: solMeta?.logoURI,
    });

    // Process all token accounts (SPL + Token-2022)
    const allAccounts = [
      ...(splAccounts.value as unknown[]),
      ...(token2022Accounts.value as unknown[]),
    ];
    const seen = new Set<string>();

    for (const account of allAccounts) {
      const acc = account as {
        account: { data: { parsed?: { info?: Record<string, unknown> } } };
      };
      const parsed = acc?.account?.data?.parsed?.info;
      if (!parsed) continue;

      const mint = parsed['mint'] as string;
      const mintLower = mint.toLowerCase();

      // Skip duplicates
      if (seen.has(mintLower)) continue;
      seen.add(mintLower);

      const tokenAmount = parsed['tokenAmount'] as {
        amount?: string;
        decimals?: number;
        uiAmountString?: string;
      };
      const rawBalance: string = tokenAmount?.amount || '0';
      if (rawBalance === '0') continue;

      const decimals: number = tokenAmount?.decimals ?? 0;
      const uiStr: string = tokenAmount?.uiAmountString || formatUiBalance(rawBalance, decimals);

      // Enrich with metadata if available, otherwise use mint address
      const meta = metadataMap.get(mintLower);
      results.push({
        address: mint,
        symbol: meta?.symbol || `${mint.slice(0, 4)}...${mint.slice(-4)}`,
        name: meta?.name || mint,
        decimals,
        balance: rawBalance,
        uiBalance: uiStr,
        logoURI: meta?.logoURI,
      });
    }

    // Sort: non-zero balances first (descending by raw balance length then value), then zero
    results.sort((a, b) => {
      if (a.balance === '0' && b.balance !== '0') return 1;
      if (a.balance !== '0' && b.balance === '0') return -1;
      return b.balance.length - a.balance.length || b.balance.localeCompare(a.balance);
    });

    return results;
  }

  /**
   * Fetch recent median priority fee from the cluster (lamports per compute unit).
   * Uses getRecentPrioritizationFees and returns the median of the last slot's fees,
   * or 0 if no recent priority fees exist.
   */
  async getRecentPriorityFee(): Promise<number> {
    const result = await this.rpc.getRecentPrioritizationFees().send();

    // Filter to non-zero fees, take the median
    const fees = result
      .map((entry) => Number(entry.prioritizationFee))
      .filter((f) => f > 0)
      .sort((a, b) => a - b);

    if (fees.length === 0) return 0;
    return fees[Math.floor(fees.length / 2)]!;
  }

  /**
   * Simulate transaction to estimate actual fees
   */
  async simulateTransaction(
    serializedTx: Uint8Array,
  ): Promise<{ success: boolean; fee: number; error?: string }> {
    try {
      const base64Tx = Buffer.from(serializedTx).toString('base64');
      const result = await this.rpc
        .simulateTransaction(base64Tx as Parameters<typeof this.rpc.simulateTransaction>[0], {
          encoding: 'base64',
          commitment: 'confirmed',
        })
        .send();

      if (result.value.err) {
        return {
          success: false,
          fee: 0,
          error: JSON.stringify(result.value.err),
        };
      }

      return {
        success: true,
        fee: Number(result.value.unitsConsumed || 0),
      };
    } catch (error) {
      return {
        success: false,
        fee: 0,
        error: `Simulation failed: ${error}`,
      };
    }
  }

  /**
   * Get recent blockhash for transactions
   */
  async getRecentBlockhash() {
    const result = await this.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();

    return {
      blockhash: result.value.blockhash,
      lastValidBlockHeight: result.value.lastValidBlockHeight,
    };
  }

  /**
   * Send and confirm transaction
   */
  async sendAndConfirmTransaction(
    serializedTx: Uint8Array,
  ): Promise<{ signature: string; success: boolean; error?: string }> {
    try {
      const base64Tx = Buffer.from(serializedTx).toString('base64');
      const signature = await this.rpc
        .sendTransaction(base64Tx as Parameters<typeof this.rpc.sendTransaction>[0], {
          encoding: 'base64',
          skipPreflight: false,
          maxRetries: BigInt(3),
        })
        .send();

      // Poll for confirmation
      const maxAttempts = 30;
      const pollInterval = 2000;

      for (let i = 0; i < maxAttempts; i++) {
        const statuses = await this.rpc.getSignatureStatuses([signature]).send();
        const status = statuses.value[0];

        if (status) {
          if (status.err) {
            return {
              signature,
              success: false,
              error: JSON.stringify(status.err),
            };
          }
          if (
            status.confirmationStatus === 'confirmed' ||
            status.confirmationStatus === 'finalized'
          ) {
            return { signature, success: true };
          }
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      return {
        signature,
        success: false,
        error: 'Transaction confirmation timeout',
      };
    } catch (error) {
      return {
        signature: '',
        success: false,
        error: `Failed to send transaction: ${error}`,
      };
    }
  }

  /**
   * Parse Token-2022 TransferFeeConfig extension from raw mint account data
   */
  private parseTransferFeeExtension(data: Buffer): TransferFeeConfig | undefined {
    try {
      // Token-2022 mint base = 82 bytes, then 1 byte account type
      let offset = 83;

      while (offset + 4 <= data.length) {
        const extType = data.readUInt16LE(offset);
        const extLen = data.readUInt16LE(offset + 2);

        if (extType === 1) {
          // TransferFeeConfig extension found
          // Layout: auth1(32) + auth2(32) + withheld(8) + older(epoch:8+max:8+bps:2) + newer(epoch:8+max:8+bps:2)
          const extDataStart = offset + 4;
          const newerOffset = extDataStart + 32 + 32 + 8 + 18; // 90 bytes in

          if (newerOffset + 18 <= data.length) {
            // newer TransferFee: epoch(8) + maximum_fee(8) + basis_points(2)
            const maxFee = data.readBigUInt64LE(newerOffset + 8);
            const basisPoints = data.readUInt16LE(newerOffset + 16);

            return {
              transferFeeBasisPoints: basisPoints,
              maximumFee: maxFee,
            };
          }
        }

        offset += 4 + extLen;
      }
    } catch {
      // Failed to parse extension data
    }

    return undefined;
  }
}

// Export singleton instance
export const solanaService = new SolanaService();
