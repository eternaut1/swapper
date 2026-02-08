/**
 * @jest-environment node
 */

import {
  address,
  generateKeyPairSigner,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { TransactionBuilder } from '@/lib/transactions/TransactionBuilder';

// Mock solanaService
jest.mock('@/lib/solana', () => ({
  solanaService: {
    getRecentBlockhash: jest.fn().mockResolvedValue({
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 100,
    }),
  },
}));

describe('TransactionBuilder', () => {
  let builder: TransactionBuilder;
  let sponsor: KeyPairSigner;
  let userWallet: string;

  beforeEach(async () => {
    builder = new TransactionBuilder('https://api.devnet.solana.com');
    sponsor = await generateKeyPairSigner();
    userWallet = (await generateKeyPairSigner()).address;
  });

  // Helper: decode a serialized tx to inspect its compiled message
  function decodeTx(bytes: Uint8Array) {
    const decoded = getTransactionDecoder().decode(bytes);
    const message = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
    return { decoded, message };
  }

  describe('createFeeTransferInstructions', () => {
    it('should create SOL transfer instruction', async () => {
      const fee = { token: 'SOL' as const, amount: 0.001, valueUSD: 0.15 };
      const ixs = await builder.createFeeTransferInstructions(userWallet, sponsor.address, fee);

      // SOL transfer returns a single instruction
      expect(ixs).toHaveLength(1);
      const ix = ixs[0]!;
      // The instruction should target the System Program
      expect(ix.programAddress).toBe(SYSTEM_PROGRAM_ADDRESS);
      // Should have 2 accounts (source and destination)
      expect(ix.accounts).toHaveLength(2);
      expect(ix.accounts![0]!.address).toBe(userWallet);
      expect(ix.accounts![1]!.address).toBe(sponsor.address);
    });

    it('should create USDC transfer instructions', async () => {
      const fee = { token: 'USDC' as const, amount: 0.01, valueUSD: 0.01 };
      const ixs = await builder.createFeeTransferInstructions(userWallet, sponsor.address, fee);

      // USDC returns 2 instructions: createATA (idempotent) + transfer
      expect(ixs).toHaveLength(2);
      const transferIx = ixs[1]!;
      expect(transferIx.programAddress).toBe(TOKEN_PROGRAM_ADDRESS);
    });

    it('should correctly convert SOL amount to lamports', async () => {
      const fee = { token: 'SOL' as const, amount: 0.5, valueUSD: 75 };
      const ixs = await builder.createFeeTransferInstructions(userWallet, sponsor.address, fee);
      const ix = ixs[0]!;

      // SystemProgram.transfer data: u32 instruction type (4 bytes) + u64 lamports (8 bytes)
      const data = ix.data!;
      const lamports = Buffer.from(data).readBigUInt64LE(4);
      expect(lamports).toBe(BigInt(500_000_000));
    });
  });

  describe('buildSponsoredTransaction', () => {
    it('should set sponsor as fee payer', async () => {
      const fee = { token: 'SOL' as const, amount: 0.001, valueUSD: 0.15 };

      // Create a dummy bridge instruction using the kit noop signer
      const dest = (await generateKeyPairSigner()).address;
      const bridgeIx: Instruction = {
        programAddress: SYSTEM_PROGRAM_ADDRESS,
        accounts: [
          { address: address(userWallet), role: 3 /* writable signer */ },
          { address: dest, role: 1 /* writable */ },
        ],
        data: new Uint8Array([2, 0, 0, 0, ...new Uint8Array(8)]), // transfer 0
      };

      const txBytes = await builder.buildSponsoredTransaction(userWallet, sponsor, [bridgeIx], fee);

      // Fee payer is always staticAccounts[0]
      const { message } = decodeTx(txBytes);
      expect(message.staticAccounts[0]).toBe(sponsor.address);
    });

    it('should place fee instruction first', async () => {
      const fee = { token: 'SOL' as const, amount: 0.001, valueUSD: 0.15 };
      const dest = (await generateKeyPairSigner()).address;
      const bridgeIx: Instruction = {
        programAddress: SYSTEM_PROGRAM_ADDRESS,
        accounts: [
          { address: address(userWallet), role: 3 },
          { address: dest, role: 1 },
        ],
        data: new Uint8Array([2, 0, 0, 0, ...new Uint8Array(8)]),
      };

      const txBytes = await builder.buildSponsoredTransaction(userWallet, sponsor, [bridgeIx], fee);

      const { message } = decodeTx(txBytes);
      // Should have 2 instructions: fee transfer + bridge
      expect(message.instructions).toHaveLength(2);

      // First instruction should be SystemProgram (fee transfer)
      const firstIx = message.instructions[0]!;
      const programId = message.staticAccounts[firstIx.programAddressIndex];
      expect(programId).toBe(SYSTEM_PROGRAM_ADDRESS);
    });

    it('should have sponsor signature', async () => {
      const fee = { token: 'SOL' as const, amount: 0.001, valueUSD: 0.15 };
      const txBytes = await builder.buildSponsoredTransaction(userWallet, sponsor, [], fee);

      const { decoded } = decodeTx(txBytes);
      // Transaction should have signatures
      const signerAddresses = Object.keys(decoded.signatures);
      expect(signerAddresses.length).toBeGreaterThan(0);
    });
  });

  describe('validateNoFundLeak', () => {
    async function buildValidTxBytes(): Promise<Uint8Array> {
      const fee = { token: 'SOL' as const, amount: 0.001, valueUSD: 0.15 };
      const dest = (await generateKeyPairSigner()).address;
      const bridgeIx: Instruction = {
        programAddress: SYSTEM_PROGRAM_ADDRESS,
        accounts: [
          { address: address(userWallet), role: 3 },
          { address: dest, role: 1 },
        ],
        data: new Uint8Array([2, 0, 0, 0, ...new Uint8Array(8)]),
      };
      return builder.buildSponsoredTransaction(userWallet, sponsor, [bridgeIx], fee);
    }

    it('should pass for valid transaction with correct sponsor', async () => {
      const txBytes = await buildValidTxBytes();
      const result = builder.validateNoFundLeak(txBytes, sponsor.address);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when sponsor is not fee payer', async () => {
      const txBytes = await buildValidTxBytes();
      const wrongSponsor = (await generateKeyPairSigner()).address;
      const result = builder.validateNoFundLeak(txBytes, wrongSponsor);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Sponsor is not the fee payer of this transaction');
    });

    it('should fail for transaction with only 1 instruction', async () => {
      const fee = { token: 'SOL' as const, amount: 0.001, valueUSD: 0.15 };
      // Build with no bridge instructions (only fee transfer)
      const txBytes = await builder.buildSponsoredTransaction(userWallet, sponsor, [], fee);
      const result = builder.validateNoFundLeak(txBytes);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Transaction must have at least 2 instructions (fee + swap)');
    });

    it('should pass without sponsorAddress param (backwards compatible)', async () => {
      const txBytes = await buildValidTxBytes();
      const result = builder.validateNoFundLeak(txBytes);

      expect(result.isValid).toBe(true);
    });
  });

  describe('validateTransactionSize', () => {
    it('should validate a small transaction is within limits', async () => {
      const fee = { token: 'SOL' as const, amount: 0.001, valueUSD: 0.15 };
      const txBytes = await builder.buildSponsoredTransaction(userWallet, sponsor, [], fee);

      const result = builder.validateTransactionSize(txBytes);

      expect(result.valid).toBe(true);
      expect(result.size).toBeLessThan(1232);
      expect(result.maxSize).toBe(1232);
    });
  });

  describe('serializeTransaction / deserializeTransaction', () => {
    it('should roundtrip serialize and deserialize', async () => {
      const fee = { token: 'SOL' as const, amount: 0.001, valueUSD: 0.15 };
      const txBytes = await builder.buildSponsoredTransaction(userWallet, sponsor, [], fee);

      const serialized = builder.serializeTransaction(txBytes);
      const deserialized = builder.deserializeTransaction(serialized);

      // Roundtrip should produce identical bytes
      expect(Buffer.from(deserialized).toString('hex')).toBe(Buffer.from(txBytes).toString('hex'));
    });
  });
});
