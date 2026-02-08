export interface ChainConfig {
  id: string;
  name: string;
  type: 'svm' | 'evm';
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrl?: string;
  explorerUrl: string;
}

export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  // Solana
  '7565164': {
    id: '7565164',
    name: 'Solana',
    type: 'svm',
    nativeCurrency: {
      name: 'SOL',
      symbol: 'SOL',
      decimals: 9,
    },
    explorerUrl: 'https://solscan.io',
  },

  // Ethereum
  '1': {
    id: '1',
    name: 'Ethereum',
    type: 'evm',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    explorerUrl: 'https://etherscan.io',
  },

  // Polygon
  '137': {
    id: '137',
    name: 'Polygon',
    type: 'evm',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
    explorerUrl: 'https://polygonscan.com',
  },

  // Arbitrum
  '42161': {
    id: '42161',
    name: 'Arbitrum One',
    type: 'evm',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    explorerUrl: 'https://arbiscan.io',
  },

  // Optimism
  '10': {
    id: '10',
    name: 'Optimism',
    type: 'evm',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    explorerUrl: 'https://optimistic.etherscan.io',
  },

  // Base
  '8453': {
    id: '8453',
    name: 'Base',
    type: 'evm',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    explorerUrl: 'https://basescan.org',
  },
};

export function getChain(chainId: string): ChainConfig | undefined {
  return SUPPORTED_CHAINS[chainId];
}

export function getEVMChains(): ChainConfig[] {
  return Object.values(SUPPORTED_CHAINS).filter((chain) => chain.type === 'evm');
}
