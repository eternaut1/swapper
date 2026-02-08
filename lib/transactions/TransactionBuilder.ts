import 'server-only';
import {
  type Address,
  address,
  appendTransactionMessageInstructions,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  decompileTransactionMessage,
  getAddressDecoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getTransactionEncoder,
  type Instruction,
  type KeyPairSigner,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { getTransferSolInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import bs58 from 'bs58';
import { SOLANA_RPC_URL, USDC_MINT } from '@/lib/config/constants';
import { solanaService } from '@/lib/solana';
import type { UserFee, ValidationResult } from '@/types/swap';

// Address Lookup Table account header size (bytes)
const ALT_HEADER_SIZE = 56;

export class TransactionBuilder {
  private rpc: ReturnType<typeof createSolanaRpc>;

  constructor(rpcUrl: string = SOLANA_RPC_URL) {
    this.rpc = createSolanaRpc(rpcUrl);
  }

  /**
   * Replace the blockhash in a serialized transaction with a fresh one from our RPC.
   * Operates directly on raw bytes to preserve Address Lookup Tables, account
   * ordering, signer roles, and all other transaction metadata.
   *
   * This is needed because provider APIs (e.g. DeBridge) return transactions
   * with blockhashes from their own RPC nodes, which our RPC may not recognise.
   */
  async replaceBlockhash(txBytes: Uint8Array): Promise<Uint8Array> {
    const { blockhash } = await solanaService.getRecentBlockhash();

    // Decode to find the current blockhash
    const decoded = getTransactionDecoder().decode(txBytes);
    const compiledMsg = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
    const oldBlockhash = compiledMsg.lifetimeToken as string;

    if (oldBlockhash === blockhash) return txBytes;

    // Convert blockhashes to raw 32-byte arrays
    const oldBytes = bs58.decode(oldBlockhash);
    const newBytes = bs58.decode(blockhash);

    // Calculate exact byte offset of the blockhash in the raw transaction.
    //
    // Wire layout:
    //   [compact-u16 numSigs] [64 B × numSigs] [message bytes]
    //
    // v0 message layout:
    //   [1 B prefix 0x80] [3 B header] [compact-u16 numAccounts] [32 B × numAccounts] [32 B blockhash] …
    //
    // legacy message layout:
    //   [3 B header] [compact-u16 numAccounts] [32 B × numAccounts] [32 B blockhash] …
    const numSigs = Object.keys(decoded.signatures).length;
    const sigsCompact = numSigs < 128 ? 1 : numSigs < 16384 ? 2 : 3;
    const msgStart = sigsCompact + numSigs * 64;

    // Detect versioned (v0) vs legacy by inspecting the first message byte
    const isV0 = (txBytes[msgStart]! & 0x80) !== 0;
    const prefixLen = isV0 ? 1 : 0;
    const headerLen = 3;

    const numAccounts = compiledMsg.staticAccounts.length;
    const accountsCompact = numAccounts < 128 ? 1 : numAccounts < 16384 ? 2 : 3;

    const blockhashOffset = msgStart + prefixLen + headerLen + accountsCompact + numAccounts * 32;

    // Sanity check: the bytes at the calculated offset should match the old blockhash
    const existing = txBytes.slice(blockhashOffset, blockhashOffset + 32);
    if (!existing.every((b, i) => b === oldBytes[i])) {
      throw new Error('Blockhash offset mismatch — raw bytes do not match decoded blockhash');
    }

    // Replace the 32-byte blockhash in place
    const result = new Uint8Array(txBytes);
    result.set(newBytes, blockhashOffset);
    return result;
  }

  /**
   * Build a sponsored transaction where sponsor pays all fees
   * CRITICAL: Fee transfer instruction must be FIRST
   */
  async buildSponsoredTransaction(
    userWallet: string,
    sponsorSigner: KeyPairSigner,
    bridgeInstructions: Instruction[],
    userFee: UserFee,
  ): Promise<Uint8Array> {
    // 1. Create fee transfer instructions (ATA creation + transfer, MUST BE FIRST)
    const feeInstructions = await this.createFeeTransferInstructions(
      userWallet,
      sponsorSigner.address,
      userFee,
      sponsorSigner,
    );

    // 2. Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await solanaService.getRecentBlockhash();

    // 3. Build transaction message with sponsor as fee payer signer
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(sponsorSigner, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash, lastValidBlockHeight }, m),
      (m) => appendTransactionMessageInstructions([...feeInstructions, ...bridgeInstructions], m),
    );

    // 4. Partially sign (sponsor signs, user's noop signer leaves empty slot)
    const signed = await partiallySignTransactionMessageWithSigners(message);

    return new Uint8Array(getTransactionEncoder().encode(signed));
  }

  /**
   * Create fee transfer instructions.
   * User transfers USDC/SOL fee to sponsor.
   * In sponsored mode, sponsor pays SOL rent for any ATA creation.
   */
  async createFeeTransferInstructions(
    from: string,
    to: string,
    fee: UserFee,
    sponsorSigner?: KeyPairSigner,
  ): Promise<Instruction[]> {
    // User is a signer of the fee transfer but signs externally (via wallet)
    const userSigner = createNoopSigner(address(from));

    if (fee.token === 'SOL') {
      // Native SOL transfer
      const lamports = Math.ceil(fee.amount * 1_000_000_000);

      return [
        getTransferSolInstruction({
          source: userSigner,
          destination: address(to),
          amount: lamports,
        }),
      ];
    }

    // USDC token transfer
    const usdcMint = address(USDC_MINT);

    // Get associated token accounts
    const [fromAta] = await findAssociatedTokenPda({
      mint: usdcMint,
      owner: address(from),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const [toAta] = await findAssociatedTokenPda({
      mint: usdcMint,
      owner: address(to),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    // In sponsored mode, sponsor pays SOL rent for ATA creation.
    // Otherwise user pays (direct mode / fallback).
    const ataPayer = sponsorSigner ?? userSigner;

    // Create destination ATA if it doesn't exist (idempotent — no-op if it already exists)
    const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: ataPayer,
      owner: address(to),
      mint: usdcMint,
      ata: toAta,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    // USDC has 6 decimals
    const amount = Math.ceil(fee.amount * 1_000_000);

    const transferIx = getTransferInstruction({
      source: fromAta,
      destination: toAta,
      authority: userSigner,
      amount,
    });

    return [createAtaIx, transferIx];
  }

  /**
   * Add fee transfer instruction to an existing provider transaction.
   * Decompiles the provider tx, prepends fee collection, recompiles with sponsor as fee payer.
   *
   * @param solAdvanceLamports  If > 0, a SOL transfer from sponsor → user is prepended
   *   so the user has enough SOL for provider-internal rent (e.g. DeBridge order PDA).
   */
  async addFeeTransferToTransaction(
    providerTxBytes: Uint8Array,
    userWallet: string,
    sponsorSigner: KeyPairSigner,
    userFee: UserFee,
    solAdvanceLamports: number = 0,
  ): Promise<Uint8Array> {
    // 1. Create fee transfer instructions (ATA creation + USDC transfer)
    const feeInstructions = await this.createFeeTransferInstructions(
      userWallet,
      sponsorSigner.address,
      userFee,
      sponsorSigner,
    );

    // 1b. If provider needs SOL from user (e.g. DeBridge order rent),
    // advance that amount from sponsor → user BEFORE bridge instructions.
    const prefixInstructions: Instruction[] = [];
    if (solAdvanceLamports > 0) {
      prefixInstructions.push(
        getTransferSolInstruction({
          source: sponsorSigner,
          destination: address(userWallet),
          amount: solAdvanceLamports,
        }),
      );
    }

    // 2. Decode the provider transaction
    const decoded = getTransactionDecoder().decode(providerTxBytes);

    // 3. Decode the compiled message
    const compiledMsg = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);

    // 4. Resolve address lookup tables (only present in v0 transactions)
    const addressTableLookups =
      'addressTableLookups' in compiledMsg
        ? (compiledMsg as { addressTableLookups?: readonly { lookupTableAddress: Address }[] })
            .addressTableLookups
        : undefined;
    const lookupTableMap = await this.resolveAddressLookupTables(addressTableLookups);

    // 5. Decompile to extract existing instructions
    const decompiledMsg = decompileTransactionMessage(compiledMsg, {
      addressesByLookupTableAddress: lookupTableMap,
    });

    const bridgeInstructions = decompiledMsg.instructions;

    // 6. Build new message: [SOL advance] [fee instructions] [bridge instructions]
    const { blockhash, lastValidBlockHeight } = await solanaService.getRecentBlockhash();

    const newMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(sponsorSigner, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash, lastValidBlockHeight }, m),
      (m) =>
        appendTransactionMessageInstructions(
          [...prefixInstructions, ...feeInstructions, ...bridgeInstructions],
          m,
        ),
    );

    // 7. Partially sign (sponsor signs, user's noop signer leaves empty slot)
    const signed = await partiallySignTransactionMessageWithSigners(newMessage);

    return new Uint8Array(getTransactionEncoder().encode(signed));
  }

  /**
   * Resolve address lookup tables referenced by a compiled message
   * Returns a map of lookup table address -> list of addresses stored in that table
   */
  private async resolveAddressLookupTables(
    lookups: readonly { lookupTableAddress: Address }[] | undefined,
  ): Promise<Record<Address, Address[]>> {
    if (!lookups || lookups.length === 0) {
      return {};
    }

    const result: Record<string, Address[]> = {};
    const addrDecoder = getAddressDecoder();

    for (const lookup of lookups) {
      const tableAddr = lookup.lookupTableAddress;
      const accountInfo = await this.rpc
        .getAccountInfo(tableAddr, {
          encoding: 'base64',
          commitment: 'confirmed',
        })
        .send();

      if (!accountInfo.value) continue;

      const data = Buffer.from((accountInfo.value.data as readonly [string, string])[0], 'base64');
      const addresses: Address[] = [];
      for (let i = ALT_HEADER_SIZE; i + 32 <= data.length; i += 32) {
        addresses.push(addrDecoder.decode(new Uint8Array(data.subarray(i, i + 32))));
      }
      result[tableAddr] = addresses;
    }

    return result;
  }

  /**
   * Rebuild a provider transaction for direct mode (user pays gas, no sponsor).
   * Decompiles provider tx, rebuilds with user as fee payer and fresh blockhash.
   * No fee transfer instructions, no sponsor signature.
   */
  async rebuildForDirectMode(providerTxBytes: Uint8Array, userWallet: string): Promise<Uint8Array> {
    // 1. Decode the provider transaction
    const decoded = getTransactionDecoder().decode(providerTxBytes);
    const compiledMsg = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);

    // 2. Resolve address lookup tables (v0 transactions)
    const addressTableLookups =
      'addressTableLookups' in compiledMsg
        ? (compiledMsg as { addressTableLookups?: readonly { lookupTableAddress: Address }[] })
            .addressTableLookups
        : undefined;
    const lookupTableMap = await this.resolveAddressLookupTables(addressTableLookups);

    // 3. Decompile to extract bridge instructions
    const decompiledMsg = decompileTransactionMessage(compiledMsg, {
      addressesByLookupTableAddress: lookupTableMap,
    });

    // 4. Rebuild with user as fee payer, fresh blockhash, bridge instructions only
    const userSigner = createNoopSigner(address(userWallet));
    const { blockhash, lastValidBlockHeight } = await solanaService.getRecentBlockhash();

    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(userSigner, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash, lastValidBlockHeight }, m),
      (m) => appendTransactionMessageInstructions(decompiledMsg.instructions, m),
    );

    // 5. Partially sign — user's noop signer leaves slot for wallet to fill
    const signed = await partiallySignTransactionMessageWithSigners(message);
    return new Uint8Array(getTransactionEncoder().encode(signed));
  }

  /**
   * Validate transaction doesn't leak funds
   * Ensures:
   * 1. Sponsor is fee payer
   * 2. Fee transfer is first instruction
   * 3. No unauthorized account modifications
   */
  validateNoFundLeak(serializedTx: Uint8Array, sponsorAddress?: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const decoded = getTransactionDecoder().decode(serializedTx);
      const message = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);

      // Check sponsor is fee payer (index 0 in staticAccounts is always fee payer)
      if (sponsorAddress) {
        const feePayer = message.staticAccounts[0];
        if (!feePayer || feePayer !== sponsorAddress) {
          errors.push('Sponsor is not the fee payer of this transaction');
        }
      }

      const instructions = message.instructions;

      if (instructions.length < 2) {
        errors.push('Transaction must have at least 2 instructions (fee + swap)');
      }

      // First instruction should be fee-related: ATA creation (AssociatedTokenProgram),
      // SystemProgram.transfer (SOL fee), or Token.transfer (USDC fee)
      const firstInstruction = instructions[0];
      if (!firstInstruction) {
        errors.push('Transaction has no instructions');
        return { isValid: false, errors, warnings };
      }

      const programAddrIndex = firstInstruction.programAddressIndex;
      const programId = message.staticAccounts[programAddrIndex];
      if (!programId) {
        errors.push('Cannot find program ID for first instruction');
        return { isValid: false, errors, warnings };
      }

      const isSystemTransfer = programId === SYSTEM_PROGRAM_ADDRESS;
      const isTokenTransfer =
        programId === TOKEN_PROGRAM_ADDRESS || programId === TOKEN_2022_PROGRAM_ADDRESS;
      const isAtaCreation = programId === ASSOCIATED_TOKEN_PROGRAM_ADDRESS;

      if (!isSystemTransfer && !isTokenTransfer && !isAtaCreation) {
        errors.push(
          'First instruction must be fee-related (SystemProgram, TokenProgram, or AssociatedTokenProgram)',
        );
      }

      // Additional validation: Check for suspicious patterns
      if (instructions.length > 20) {
        warnings.push('Transaction has unusually high instruction count');
      }

      // Check for duplicate instructions (potential attack)
      const instructionHashes = new Set<string>();
      for (const ix of instructions) {
        const dataHex = ix.data ? Buffer.from(new Uint8Array(ix.data)).toString('hex') : '';
        const indices = ix.accountIndices ? ix.accountIndices.join(',') : '';
        const hash = `${ix.programAddressIndex}-${indices}-${dataHex}`;
        if (instructionHashes.has(hash)) {
          warnings.push('Duplicate instruction detected');
        }
        instructionHashes.add(hash);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error}`],
        warnings,
      };
    }
  }

  /**
   * Add user signature to a partially-signed transaction
   */
  addUserSignature(
    serializedTx: Uint8Array,
    userSignature: Uint8Array,
    userAddress: string,
  ): Uint8Array {
    // Decode to find user's signer index
    const decoded = getTransactionDecoder().decode(serializedTx);
    const signerAddresses = Object.keys(decoded.signatures);
    const userIndex = signerAddresses.indexOf(userAddress);

    if (userIndex === -1) {
      throw new Error('User public key not found in transaction');
    }

    // Modify raw bytes: set 64-byte signature at the user's index
    // Wire format: [compact-u16 numSigs] [sig0 64B] [sig1 64B] ... [message]
    const result = new Uint8Array(serializedTx);
    const sigOffset = 1 + userIndex * 64; // compact-u16 for small counts = 1 byte
    result.set(userSignature.slice(0, 64), sigOffset);

    return result;
  }

  /**
   * Simulate transaction before sending
   */
  async simulateTransaction(serializedTx: Uint8Array): Promise<{
    success: boolean;
    fee?: number;
    logs?: string[];
    error?: string;
  }> {
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
          error: JSON.stringify(result.value.err, (_k, v) =>
            typeof v === 'bigint' ? v.toString() : v,
          ),
          logs: result.value.logs || [],
        };
      }

      return {
        success: true,
        fee: Number(result.value.unitsConsumed || 0),
        logs: result.value.logs || [],
      };
    } catch (error) {
      return {
        success: false,
        error: `Simulation failed: ${error}`,
      };
    }
  }

  /**
   * Serialize transaction for transmission
   */
  serializeTransaction(serializedTx: Uint8Array): Buffer {
    return Buffer.from(serializedTx);
  }

  /**
   * Deserialize transaction from buffer
   */
  deserializeTransaction(buffer: Buffer): Uint8Array {
    return new Uint8Array(buffer);
  }

  /**
   * Get transaction size in bytes
   */
  getTransactionSize(serializedTx: Uint8Array): number {
    return serializedTx.length;
  }

  /**
   * Validate transaction size is within limits
   */
  validateTransactionSize(serializedTx: Uint8Array): {
    valid: boolean;
    size: number;
    maxSize: number;
  } {
    const size = serializedTx.length;
    const maxSize = 1232; // Solana transaction size limit

    return {
      valid: size <= maxSize,
      size,
      maxSize,
    };
  }
}

// Export singleton instance
export const transactionBuilder = new TransactionBuilder();
