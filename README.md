# Octraban — Backend

Human-readable Soroban contract explorer. Decodes raw XDR into plain English:
> "Address GABC... swapped 100 USDC → 98.7 XLM on StellarSwap at ledger 4521983."

## Stack
- **Node.js + Express + TypeScript**
- **PostgreSQL + Prisma ORM**
- **Stellar SDK** — Soroban RPC + XDR decoding
- **Docker Compose** — one-command setup

## Architecture

```
src/
├── index.ts              # Express app entry
├── config.ts             # Env config
├── db.ts                 # Prisma client
├── api/
│   ├── router.ts         # Route aggregator
│   ├── transactions.ts   # GET /transactions
│   ├── events.ts         # GET /events
│   ├── contracts.ts      # GET/POST /contracts (ABI registry)
│   ├── wallets.ts        # GET /wallets/:address
│   └── tokens.ts         # GET /tokens (SEP-41)
└── indexer/
    ├── rpc.ts            # Stellar RPC client
    ├── registry.ts       # ABI registry + SEP-41 built-in ABI
    ├── decoder.ts        # XDR → human-readable decoder
    ├── indexer.ts        # Ledger polling loop
    └── run.ts            # Indexer entry point
```

## Quick Start

### With Docker (recommended)
```bash
cp .env.example .env
docker compose up
```

### Local development
```bash
cp .env.example .env
# edit .env with your DB URL and RPC endpoint

npm install
npx prisma migrate dev
npm run seed          # seed known contracts (StellarSwap etc.)
npm run dev           # start API server
npm run index         # start indexer (separate terminal)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/transactions` | List transactions (filter: `contract`, `account`, `status`) |
| GET | `/api/v1/transactions/:hash` | Transaction detail + events |
| GET | `/api/v1/events` | List events (filter: `contract`, `type`) |
| GET | `/api/v1/events/:id` | Event detail |
| GET | `/api/v1/contracts` | List registered contracts |
| GET | `/api/v1/contracts/:address` | Contract detail + recent txs/events |
| POST | `/api/v1/contracts` | Register contract ABI metadata |
| GET | `/api/v1/wallets/:address/transactions` | Wallet transaction history |
| GET | `/api/v1/wallets/:address/events` | Wallet event history |
| GET | `/api/v1/tokens` | List SEP-41 tokens |
| GET | `/api/v1/tokens/:address` | Token detail |
| GET | `/api/v1/tokens/:address/transfers` | Token transfer history |
| GET | `/health` | Health check |

## Registering a Contract ABI

```bash
curl -X POST http://localhost:3000/api/v1/contracts \
  -H "Content-Type: application/json" \
  -d '{
    "address": "CXXX...",
    "name": "MyDEX",
    "abi": {
      "functions": [{
        "name": "swap",
        "inputs": [
          { "name": "from", "type": "address" },
          { "name": "amount_in", "type": "i128" },
          { "name": "amount_out", "type": "i128" }
        ],
        "humanTemplate": "{from} swapped {amount_in} → {amount_out} on MyDEX"
      }]
    }
  }'
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `STELLAR_NETWORK` | `testnet` | `testnet` or `mainnet` |
| `STELLAR_RPC_URL` | testnet RPC | Soroban RPC endpoint |
| `HORIZON_URL` | testnet Horizon | Horizon API endpoint |
| `NETWORK_PASSPHRASE` | testnet | Network passphrase |
| `INDEXER_START_LEDGER` | `0` | Ledger to start indexing from |
| `INDEXER_POLL_INTERVAL_MS` | `5000` | Polling interval |
| `INDEXER_BATCH_SIZE` | `100` | Ledgers per batch |

## Mainnet Config

```env
STELLAR_NETWORK=mainnet
STELLAR_RPC_URL=https://mainnet.stellar.validationcloud.io/v1/<API_KEY>
HORIZON_URL=https://horizon.stellar.org
NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
```

## Octraban service topology

This repository is the **backend** tier of the Octraban stack, split across three repos:

- **octraban_frontend** — Vite/React explorer UI. Reads from the indexer via `VITE_INDEXER_URL` (default `http://localhost:3001`).
- **octraban_backend** (this repo) — the API service plus the **indexer** (under `indexer/`) that ingests on-chain data.
  - API service: `PORT=3000`
  - Indexer API: `PORT=3001` (what the frontend queries)
- **octraban_contract** — Soroban smart contracts (explorer, ticket) deployed to **testnet**.

### Local wiring
1. Start the indexer (`indexer/`) → serves on `:3001`.
2. Start the API (root) → serves on `:3000`.
3. Point the frontend at the indexer: `VITE_INDEXER_URL=http://localhost:3001`.
4. Set `TESTNET_RPC_URL=https://soroban-testnet.stellar.org` for chain access.
