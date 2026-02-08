[![CI](https://github.com/eternaut1/swapper/actions/workflows/ci.yml/badge.svg)](https://github.com/eternaut1/swapper/actions/workflows/ci.yml)

**[Live Demo](https://swapper-production.up.railway.app)**

# Swapper - Sponsored SVM to EVM Bridge

A bridge-agnostic, fully off-chain cross-chain swap system that supports bridging tokens from Solana (SVM) to EVM chains using Relay and DeBridge providers.

## Features

- **Bridge-Agnostic Design** - Easily extensible to support additional providers
- **Sponsored Transactions** - All Solana-side costs are sponsored
- **Economic Guarantees** - Sponsor never has net loss
- **SPL & Token-2022 Support** - Handles transfer fees, dust accounts, and uncloseable accounts
- **Multi-Provider Quotes** - Aggregates quotes from Relay and DeBridge
- **Fee Optimization** - Users pay USDC (preferred) or SOL fees
- **Swap History** - Track all swaps via Prisma database
- **Production-Ready UI** - Built with Next.js 16, React 19, TypeScript, and StyleX

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Frontend (Next.js)              │
│   - SwapWidget                          │
│   - Wallet Connection                   │
│   - StyleX UI Components                │
└─────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────┐
│        API Routes (Next.js)             │
│   - /api/quote                          │
│   - /api/execute                        │
│   - /api/execute/confirm                │
│   - /api/status/[id]                    │
│   - /api/history                        │
│   - /api/balances                       │
│   - /api/health                         │
└─────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────┐
│         Service Layer                   │
│   - SwapOrchestrator                    │
│   - FeeCalculator & Validator           │
│   - SolanaService (SPL/Token-2022)      │
│   - TransactionBuilder                  │
└─────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────┐
│    Bridge Provider Abstraction          │
│   - IBridgeProvider Interface           │
│   - RelayProvider                       │
│   - DeBridgeProvider                    │
│   - ProviderRegistry                    │
└─────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────┐
│   External Services & Storage           │
│   - Relay API                           │
│   - DeBridge API                        │
│   - Pyth on-chain oracle (SOL/USD)      │
│   - Prisma DB (PostgreSQL)              │
│   - Solana RPC                          │
└─────────────────────────────────────────┘
```

## Setup Instructions

### Prerequisites

- Node.js 18+ or Bun
- Docker & Docker Compose (for PostgreSQL)
- Solana wallet with funds (for sponsor)

### 1. Install Dependencies

```bash
bun install
```

### 2. Start PostgreSQL via Docker Compose

```bash
docker compose up -d
```

This starts a PostgreSQL 17 instance with the default credentials configured in `.env.example`. The data is persisted in a Docker volume (`pgdata`).

To stop the database:

```bash
docker compose down        # stop containers (data preserved)
docker compose down -v     # stop and delete volume (data lost)
```

### 3. Environment Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` with your configuration.

#### Required Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SPONSOR_WALLET_PRIVATE_KEY` | Base58-encoded Solana keypair for sponsoring transactions |

#### Optional Variables (defaults provided)

| Variable | Default | Description |
|---|---|---|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |
| `SOLANA_RPC_WEBSOCKET_URL` | - | Solana WebSocket endpoint |
| `RELAY_API_URL` | `https://api.relay.link` | Relay bridge API base URL |
| `RELAY_API_KEY` | - | Optional Relay API key for higher rate limits |
| `DEBRIDGE_API_URL` | `https://dln.debridge.finance` | DeBridge DLN API base URL |
| `FEE_VOLATILITY_BUFFER` | `0.15` | Price volatility buffer (15%) |
| `MAX_QUOTE_DRIFT` | `0.02` | Maximum acceptable quote drift (2%) |
| `QUOTE_EXPIRY_SECONDS` | `30` | Quote validity period in seconds |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | `development` | Node environment |

#### Docker Compose Variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `swapper` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `swapper` | PostgreSQL password |
| `POSTGRES_DB` | `swapper` | PostgreSQL database name |

### 4. Database Setup

Generate Prisma client and push schema:

```bash
bun db:generate
bun db:push
```

### 5. Run Development Server

```bash
bun dev
```

Visit [http://localhost:3000](http://localhost:3000)

## How It Works

### User Flow

1. **Connect Wallet** - User connects Solana wallet (Phantom, etc.)
2. **Input Swap Details**
   - Select source token (SPL/Token-2022)
   - Enter amount
   - Select destination chain (Ethereum, Polygon, etc.)
   - Enter destination token address
   - Enter destination wallet address

3. **Get Quote**
   - Quotes auto-fetch when all inputs are valid (500ms debounce)
   - System fetches quotes from all providers (Relay, DeBridge)
   - Calculates fees (sponsor costs + buffer)
   - Displays best quote with provider info

4. **Execute Swap**
   - System builds sponsored transaction
   - Fee transfer instruction added first (critical!)
   - User signs transaction
   - Sponsor co-signs and submits
   - System monitors status

5. **Monitor Progress**
   - Real-time status updates
   - Source and destination transaction links
   - Completion notification

### Economic Guarantees

**Critical:** The fee transfer MUST be the first instruction in every transaction.

1. **User Fee Calculation**:
   ```
   totalFee = (sponsorCosts + volatilityBuffer + platformFee)

   where:
   - sponsorCosts = gas + priority fees + rent
   - volatilityBuffer = 15% (configurable)
   - platformFee = 0% (configurable)
   ```

2. **Pre-Execution Validation**:
   - Quote hasn't expired
   - Price drift within acceptable range (2%)
   - User fee covers sponsor costs
   - User has sufficient balance

3. **Transaction Structure**:
   ```
   1. User pays fee to sponsor (FIRST!)
   2. Bridge swap instructions

   If ANY instruction fails, entire transaction reverts
   Ensures sponsor never pays without receiving fee
   ```

## API Endpoints

All error responses follow a consistent format:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "errorCode": "MACHINE_READABLE_CODE"
}
```

Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `QUOTE_ERROR`, `INSUFFICIENT_BALANCE`, `FEE_ERROR`, `BRIDGE_ERROR`, `TRANSACTION_ERROR`, `CONFIG_ERROR`, `PRICE_ORACLE_ERROR`, `INTERNAL_ERROR`.

### POST /api/quote
Get quotes from all providers.

**Request:**
```json
{
  "sourceToken": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "sourceAmount": "100",
  "destChain": "1",
  "destToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "userWallet": "...",
  "destWallet": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "quotes": [...],
  "bestQuote": {...},
  "recommendedQuote": {...}
}
```

### POST /api/execute
Prepare swap transaction.

**Request:**
```json
{
  "quote": {...},
  "userWallet": "...",
  "feeToken": "USDC"
}
```

**Response:**
```json
{
  "success": true,
  "swapId": "...",
  "transaction": "base64_encoded_tx",
  "userFee": {...},
  "sponsorCosts": {...},
  "validUntil": "2024-..."
}
```

### POST /api/execute/confirm
Execute signed transaction.

**Request:**
```json
{
  "swapId": "...",
  "signedTransaction": "base64_encoded_signed_tx"
}
```

**Response:**
```json
{
  "success": true,
  "swapId": "...",
  "status": "submitted",
  "signature": "..."
}
```

### GET /api/status/[id]
Get swap status.

**Response:**
```json
{
  "success": true,
  "status": {
    "swapId": "...",
    "status": "completed",
    "sourceChainTx": "...",
    "destChainTx": "...",
    "progress": 100
  }
}
```

### GET /api/balances?wallet=...
Get wallet token balances.

### GET /api/history?wallet=...&limit=50
Get swap history and statistics.

### GET /api/health
Health check.

## Adding a New Bridge Provider

1. Create a new provider class implementing `IBridgeProvider`:

```typescript
export class NewBridgeProvider implements IBridgeProvider {
  name = 'newbridge';

  async supportsRoute(params): Promise<boolean> { ... }
  async getQuote(params: QuoteParams): Promise<BridgeQuote> { ... }
  async validateQuote(quote: BridgeQuote): Promise<QuoteValidation> { ... }
  async buildTransaction(quote, sponsor, userWallet): Promise<Uint8Array> { ... }
  async getStatus(orderId: string): Promise<ExecutionStatus> { ... }
  async estimateCosts(params: QuoteParams): Promise<CostBreakdown> { ... }
}
```

2. Register in `lib/swap/SwapOrchestrator.ts` (`getSwapOrchestrator()`):

```typescript
providerRegistry.register(new NewBridgeProvider());
```

The provider will automatically be included in quote aggregation.

## Scripts

```bash
# Development
bun dev              # Start dev server
bun build            # Build for production
bun start            # Start production server

# Database
bun db:generate      # Generate Prisma client
bun db:push          # Push schema to database
bun db:studio        # Open Prisma Studio

# Testing
bun test             # Run unit tests
bun test:watch       # Run tests in watch mode
bun test:e2e         # Run E2E tests (requires running dev server)

# Docker
docker compose up -d   # Start PostgreSQL
docker compose down    # Stop PostgreSQL
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI**: React 19 + StyleX (Meta)
- **Database**: PostgreSQL + Prisma 7
- **Blockchain**: @solana/kit v6, @solana/react, SPL Token, Token-2022
- **Wallet**: @wallet-standard/react
- **Price Oracle**: Pyth on-chain oracle (SOL/USD)
- **Validation**: Zod 4 + @t3-oss/env-nextjs
- **Testing**: Jest (unit) + Playwright (E2E)
- **Package Manager**: Bun

## Project Structure

```
swapper/
├── app/                    # Next.js app directory
│   ├── api/               # API routes (quote, execute, status, etc.)
│   ├── actions/           # Server actions
│   ├── history/           # History page
│   ├── layout.tsx         # Root layout (wallet provider + nav)
│   └── page.tsx           # Home page (swap widget)
├── lib/                    # Core business logic
│   ├── bridges/           # Bridge provider abstraction
│   ├── solana/            # Solana RPC service (SPL + Token-2022)
│   ├── fees/              # Fee calculation & validation
│   ├── swap/              # Swap orchestrator
│   ├── transactions/      # Transaction builder
│   ├── config/            # Configuration, constants, env
│   ├── db/                # Prisma client & repositories
│   ├── middleware/         # Rate limiter
│   ├── utils/             # Logger, retry, formatting
│   └── errors.ts          # Error type hierarchy
├── hooks/                  # React hooks (useSwap, useAutoQuote, etc.)
├── components/             # React components
│   ├── swap/              # Swap widget & token panels
│   ├── wallet/            # Wallet provider & connect button
│   ├── history/           # Swap history list
│   ├── layout/            # Nav header
│   └── ui/                # Reusable UI components
├── types/                  # TypeScript type definitions
├── styles/                 # StyleX tokens & themes
├── prisma/                 # Database schema
├── proxy.ts               # Next.js proxy (rate limiting, security headers)
├── tests/
│   ├── unit/              # Unit tests (Jest)
│   └── e2e/               # E2E tests (Playwright)
└── docker-compose.yml      # PostgreSQL setup
```
