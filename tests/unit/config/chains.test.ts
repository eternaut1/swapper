import { getChain, getEVMChains, SUPPORTED_CHAINS } from '@/lib/config/chains';

describe('chains', () => {
  describe('SUPPORTED_CHAINS', () => {
    it('has 6 supported chains', () => {
      expect(Object.keys(SUPPORTED_CHAINS)).toHaveLength(6);
    });

    it('includes Solana with correct config', () => {
      const solana = SUPPORTED_CHAINS['7565164'];
      expect(solana).toBeDefined();
      expect(solana.name).toBe('Solana');
      expect(solana.type).toBe('svm');
      expect(solana.nativeCurrency.symbol).toBe('SOL');
      expect(solana.nativeCurrency.decimals).toBe(9);
    });

    it('includes Ethereum with correct config', () => {
      const eth = SUPPORTED_CHAINS['1'];
      expect(eth).toBeDefined();
      expect(eth.name).toBe('Ethereum');
      expect(eth.type).toBe('evm');
      expect(eth.nativeCurrency.decimals).toBe(18);
    });

    it('all chains have required fields', () => {
      for (const chain of Object.values(SUPPORTED_CHAINS)) {
        expect(chain.id).toBeTruthy();
        expect(chain.name).toBeTruthy();
        expect(chain.type).toMatch(/^(svm|evm)$/);
        expect(chain.explorerUrl).toMatch(/^https:\/\//);
        expect(chain.nativeCurrency.symbol).toBeTruthy();
        expect(chain.nativeCurrency.decimals).toBeGreaterThan(0);
      }
    });
  });

  describe('getChain', () => {
    it('returns chain config for valid ID', () => {
      const chain = getChain('137');
      expect(chain).toBeDefined();
      expect(chain!.name).toBe('Polygon');
    });

    it('returns undefined for invalid ID', () => {
      expect(getChain('999999')).toBeUndefined();
    });
  });

  describe('getEVMChains', () => {
    it('returns only EVM chains (excludes Solana)', () => {
      const evmChains = getEVMChains();
      expect(evmChains).toHaveLength(5);
      expect(evmChains.every((c) => c.type === 'evm')).toBe(true);
      expect(evmChains.find((c) => c.name === 'Solana')).toBeUndefined();
    });

    it('includes all expected EVM chains', () => {
      const names = getEVMChains().map((c) => c.name);
      expect(names).toContain('Ethereum');
      expect(names).toContain('Polygon');
      expect(names).toContain('Arbitrum One');
      expect(names).toContain('Optimism');
      expect(names).toContain('Base');
    });
  });
});
