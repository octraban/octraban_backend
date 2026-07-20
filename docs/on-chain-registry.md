# On-Chain Registry Contract — Design Decision

## Background

The [octraban_contract](https://github.com/octraban/octraban_contract) repository deploys two
Soroban contracts to the Stellar test network:

| Contract                | Contract ID                                                |
| ----------------------- | ---------------------------------------------------------- |
| **Explorer / registry** | `CBKPNRQ4D3KTAAE7MMJ4HL6JNF2J2EBG2PSSRW4YHOMHTRHUU734CFWJ` |
| **Ticket**              | `CDX3V6OE72KUIEEJTBLFCQZFXZCAKOYWYXK2KPRM57M6FLZFAVUSVL42` |

The explorer contract exposes functions including `register_contract`, `submit_event`,
`get_events`, and `get_contract`. Before this document, the relationship between that on-chain
contract and this backend's off-chain registry and indexer was undefined.

---

## Decision: On-Chain Contract Is a Read-Augmented Mirror

The **off-chain Postgres database is the primary store of truth** for this backend. The
on-chain registry contract is treated as a **read-augmented, verifiable mirror** — not the
primary source. The reasons:

1. **Performance** — On-chain RPC reads add latency. The frontend needs sub-100 ms API
   responses. Postgres can serve that; Soroban RPC cannot be the hot path.
2. **Cost and storage** — Soroban contract storage has TTL and fee constraints. Storing the
   full decoded event history on-chain is not economically viable.
3. **Auditability** — The on-chain registry provides a tamper-evident anchor. Consumers who
   distrust the Postgres layer can independently verify contract registrations against the
   on-chain `get_contract` results.

### What the indexer reads from the chain

At startup (and on cache miss), the indexer can call `get_contract` on the on-chain registry
to **bootstrap or verify a contract's metadata** before falling back to the off-chain store.

The `REGISTRY_CONTRACT_ID_<NETWORK>` environment variable (see `.env.example`) enables or
disables this read path — if the variable is unset the indexer skips the on-chain lookup and
uses only the off-chain database (safe default for local development without RPC access).

### What the indexer does NOT do

- It does **not** call `submit_event` to mirror decoded events on-chain. The volume of
  decoded events would exceed practical Soroban storage limits and generate significant fee
  spend. Submitting events on-chain is out of scope for this backend.
- It does **not** treat the on-chain registry as the sole authoritative source for ABI
  metadata. ABIs registered via the API (`POST /api/v1/contracts`) are stored in Postgres
  and are not automatically pushed on-chain.

---

## Configuration

Add the following variables to your `.env` (or `indexer/.env`):

```env
# On-chain registry contract ID per network.
# Leave blank to disable on-chain registry reads for that network.
REGISTRY_CONTRACT_ID_TESTNET=CBKPNRQ4D3KTAAE7MMJ4HL6JNF2J2EBG2PSSRW4YHOMHTRHUU734CFWJ
REGISTRY_CONTRACT_ID_MAINNET=
REGISTRY_CONTRACT_ID_DEVNET=
```

The indexer service (`indexer/src/onChainRegistry.js`) reads these at startup to determine
whether on-chain contract lookups are enabled.

---

## Integration Points

| File | Responsibility |
| ---- | -------------- |
| `indexer/src/config.js` | Exposes `REGISTRY_CONTRACT_ID_TESTNET / _MAINNET / _DEVNET` |
| `indexer/src/onChainRegistry.js` | Calls `get_contract` on the registry via Soroban RPC |
| `indexer/test/onChainRegistry.test.js` | Unit test with mocked RPC — verifies read path |

---

## Verification

To manually verify the testnet registry from the command line:

```bash
# Read a registered contract from the on-chain registry (testnet)
curl -s -X POST https://soroban-testnet.stellar.org \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "simulateTransaction",
    "params": { ... }
  }'
```

Or visit the Stellar Expert explorer links in the README to inspect the contract's storage
and invocation history directly.

---

## Future Work

- If community demand warrants it, an opt-in `submit_event` path could be added to push a
  subset of high-value decoded events on-chain (e.g., large token transfers). This would
  require a funded Soroban account and a fee-budget configuration parameter.
- Mainnet registry deployment is tracked in the `octraban_contract` repository.
