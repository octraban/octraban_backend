# Octraban — Backend

Human-readable Soroban contract explorer. Decodes raw XDR into plain English:

> "Address GABC... swapped 100 USDC → 98.7 XLM on StellarSwap at ledger 4521983."

## 🟢 Live on Testnet

The Octraban Soroban contracts this backend indexes are **deployed and verifiable on the Stellar test network**:

| Contract                | Contract ID                                                | Stellar Explorer                                                                                                    |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Explorer / registry** | `CBKPNRQ4D3KTAAE7MMJ4HL6JNF2J2EBG2PSSRW4YHOMHTRHUU734CFWJ` | [View ↗](https://stellar.expert/explorer/testnet/contract/CBKPNRQ4D3KTAAE7MMJ4HL6JNF2J2EBG2PSSRW4YHOMHTRHUU734CFWJ) |
| **Ticket**              | `CDX3V6OE72KUIEEJTBLFCQZFXZCAKOYWYXK2KPRM57M6FLZFAVUSVL42` | [View ↗](https://stellar.expert/explorer/testnet/contract/CDX3V6OE72KUIEEJTBLFCQZFXZCAKOYWYXK2KPRM57M6FLZFAVUSVL42) |

> **Network:** `Test SDF Network ; September 2015` · **RPC:** `https://soroban-testnet.stellar.org`
> Contracts live in the [octraban_contract](https://github.com/octraban/octraban_contract) repo.

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

| Method | Path                                    | Description                                                 |
| ------ | --------------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/v1/transactions`                  | List transactions (filter: `contract`, `account`, `status`) |
| GET    | `/api/v1/transactions/:hash`            | Transaction detail + events                                 |
| GET    | `/api/v1/events`                        | List events (filter: `contract`, `type`)                    |
| GET    | `/api/v1/events/:id`                    | Event detail                                                |
| GET    | `/api/v1/contracts`                     | List registered contracts                                   |
| GET    | `/api/v1/contracts/:address`            | Contract detail + recent txs/events                         |
| POST   | `/api/v1/contracts`                     | Register contract ABI metadata                              |
| GET    | `/api/v1/wallets/:address/transactions` | Wallet transaction history                                  |
| GET    | `/api/v1/wallets/:address/events`       | Wallet event history                                        |
| GET    | `/api/v1/tokens`                        | List SEP-41 tokens                                          |
| GET    | `/api/v1/tokens/:address`               | Token detail                                                |
| GET    | `/api/v1/tokens/:address/transfers`     | Token transfer history                                      |
| GET    | `/health`                               | Health check                                                |

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

| Variable                   | Default         | Description                   |
| -------------------------- | --------------- | ----------------------------- |
| `DATABASE_URL`             | —               | PostgreSQL connection string  |
| `STELLAR_NETWORK`          | `testnet`       | `testnet` or `mainnet`        |
| `STELLAR_RPC_URL`          | testnet RPC     | Soroban RPC endpoint          |
| `HORIZON_URL`              | testnet Horizon | Horizon API endpoint          |
| `NETWORK_PASSPHRASE`       | testnet         | Network passphrase            |
| `INDEXER_START_LEDGER`     | `0`             | Ledger to start indexing from |
| `INDEXER_POLL_INTERVAL_MS` | `5000`          | Polling interval              |
| `INDEXER_BATCH_SIZE`       | `100`           | Ledgers per batch             |

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

## Two-service architecture (API on :3000 vs. indexer on :3001)

`octraban_backend` ships **two independent, separately-runnable Node processes**. They are not
interchangeable — new contributors should read this section before deciding what to run.

|                    | API service                                                                                                                                                                    | Indexer service                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Entrypoint**     | `src/index.ts` (`httpServer.listen(config.port, ...)`)                                                                                                                         | `indexer/src/index.js` → `indexer/src/api.js` (`server.listen(PORT, ...)`)                                                                       |
| **Run with**       | `npm run dev` / `npm start` (root)                                                                                                                                             | `cd indexer && npm run dev` / `npm start`                                                                                                        |
| **Port**           | `3000` (`PORT` env, root `.env`)                                                                                                                                               | `3001` (`PORT` env, `indexer/.env`)                                                                                                              |
| **Responsibility** | Registers contract ABIs, serves GraphQL/billing/WebSocket features, and runs an _in-process_ copy of the TS indexer (`src/indexer/`) that also writes to the same Postgres DB. | Polls Soroban RPC for ledgers/events, decodes them, persists them to Postgres, and serves the REST/GraphQL API that the frontend actually calls. |
| **Depends on**     | PostgreSQL (Prisma, `DATABASE_URL`), optional Redis (rate-limit store), Soroban RPC                                                                                            | PostgreSQL (`pg`, `DATABASE_URL`), optional Redis (`REDIS_URL`, caching/pub-sub), Soroban RPC (`SOROBAN_RPC_URL`)                                |

> **The frontend (`octraban_frontend`) queries the indexer service on `:3001`**, not the API
> service on `:3000`. `src/index.ts` is a second, largely independent API — running it is
> optional for a working explorer UI, but the two processes share the same Postgres database.

### Data flow

```
Soroban RPC  →  indexer (indexer/src/index.js)  →  PostgreSQL  →  indexer API :3001  →  frontend
                                                         ↑
                                        src/index.ts (API :3000, optional, same DB)
```

### Running both locally

```bash
# 1. Indexer service — what the frontend needs (:3001)
cd indexer
cp .env.example .env   # set DATABASE_URL, SOROBAN_RPC_URL
npm install
npm run dev             # or: npm start

# 2. API service — optional, ABI registry / GraphQL / billing (:3000)
cd ..
cp .env.example .env    # set DATABASE_URL, TESTNET_RPC_URL, etc.
npm install
npx prisma migrate dev
npm run dev              # start API server
npm run index             # start the in-process TS indexer poller (separate terminal)
```

## Docker Compose — service naming and the `indexer` alias (issue #18)

The `octraban_frontend` nginx configuration proxies all `/api/` traffic to a Docker host
named **`indexer`** on port `3001`:

```nginx
location /api/ { proxy_pass http://indexer:3001; }
```

This repository's `docker-compose.yml` defines per-network services named
`indexer-testnet`, `indexer-mainnet`, and `indexer-devnet`. To make the frontend's proxy
target resolve correctly without renaming the services, each indexer service declares a
**Docker network alias** of `indexer` on the default Compose network:

```yaml
indexer-testnet:
  networks:
    default:
      aliases:
        - indexer
```

This means a frontend container joined to the same Compose network can always reach the
active indexer at `http://indexer:3001`, regardless of which network profile is active.

### Starting the full stack for local development (testnet — the default)

```bash
# Copy and configure environment variables
cp .env.example .env
# Set at minimum: POSTGRES_PASSWORD

# Start the testnet stack (db + api + indexer)
docker compose up

# The indexer is now reachable as both:
#   http://indexer-testnet:3001   (service name)
#   http://indexer:3001            (alias — what the frontend uses)
```

For mainnet or devnet, activate the corresponding profile:

```bash
docker compose --profile mainnet up
docker compose --profile devnet   up
```

> **Note for frontend contributors:** Set `VITE_INDEXER_URL=http://localhost:3001` when
> running the frontend outside Docker. Inside a shared Compose network, use
> `http://indexer:3001`.
