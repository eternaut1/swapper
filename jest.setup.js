import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

// Polyfill TextEncoder/TextDecoder for Solana (needed in Node/Jest environment)
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill fetch for price oracle calls
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ solana: { usd: 150 } }), // Mock SOL price
  }),
);

// Mock environment variables
process.env.SPONSOR_WALLET_PRIVATE_KEY =
  '5JcfLxGKQuarwKTw1MBY4QfvZAQKNjHvUvAMC7f8J7g1PxQv6ycLMTN9Qw3Wj9Jf8K7g1PxQv6ycLMTN9Qw3Wj9';
process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.RELAY_API_URL = 'https://api.relay.link';
process.env.DEBRIDGE_API_URL = 'https://dln.debridge.finance/v1.0';
