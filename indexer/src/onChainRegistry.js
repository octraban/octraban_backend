/**
 * onChainRegistry.js
 *
 * Reads contract metadata from the deployed on-chain Octraban registry contract
 * via Soroban RPC. This is an *optional* read-augmentation path — the off-chain
 * Postgres database remains the primary source of truth.
 *
 * Design decision: docs/on-chain-registry.md
 *
 * Environment variables consumed:
 *   REGISTRY_CONTRACT_ID_TESTNET  — on-chain registry contract ID for testnet
 *   REGISTRY_CONTRACT_ID_MAINNET  — on-chain registry contract ID for mainnet
 *   REGISTRY_CONTRACT_ID_DEVNET   — on-chain registry contract ID for devnet
 *
 * If the relevant variable is unset the module is a no-op (returns null) so
 * the indexer can run safely without RPC access to the registry.
 */

import {
  SorobanRpc,
  Address,
  Contract,
  TransactionBuilder,
  Keypair,
  Networks,
  Account,
  scValToNative,
} from "@stellar/stellar-sdk";
import config from "./config.js";

// ── Resolve registry contract ID for the active network ──────────────────────

/**
 * Returns the configured on-chain registry contract ID for the current network,
 * or null if not configured.
 *
 * @returns {string | null}
 */
export function getRegistryContractId() {
  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  const key = `REGISTRY_CONTRACT_ID_${network.toUpperCase()}`;
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : null;
}

// ── Low-level RPC helper ──────────────────────────────────────────────────────

/**
 * Build a minimal Soroban RPC client using the configured RPC URL.
 * Exported so tests can inject a mock.
 *
 * @returns {SorobanRpc.Server}
 */
export function buildRpcClient() {
  const rpcUrl = config.SOROBAN_RPC_URL;
  return new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
}

// ── Core: get_contract ────────────────────────────────────────────────────────

/**
 * Call `get_contract(contract_id: Address)` on the on-chain registry contract
 * and return the decoded result, or null if:
 *   - The registry contract ID is not configured for this network.
 *   - The RPC call fails (network error, contract not found).
 *   - The contract is not registered on-chain.
 *
 * @param {string} contractAddress  — The Stellar contract address to look up (C… strkey).
 * @param {{ rpc?: SorobanRpc.Server }} [opts] — Optional injected RPC client (for tests).
 * @returns {Promise<OnChainContractEntry | null>}
 */
export async function getContractFromChain(contractAddress, opts = {}) {
  const registryId = getRegistryContractId();
  if (!registryId) {
    // On-chain registry not configured for this network — skip silently.
    return null;
  }

  const rpc = opts.rpc ?? buildRpcClient();

  try {
    // Build the `get_contract` invocation args: a single Address ScVal.
    const contractIdScVal = new Address(contractAddress).toScVal();

    // Simulate the `get_contract` function call.
    const result = await rpc.simulateTransaction(
      buildInvokeHostFunctionTx({
        contractId: registryId,
        functionName: "get_contract",
        args: [contractIdScVal],
      }),
    );

    if (SorobanRpc.Api.isSimulationError(result)) {
      // Contract not registered or call failed — treat as not found.
      return null;
    }

    if (!result.result?.retval) {
      return null;
    }

    return decodeContractEntry(result.result.retval);
  } catch (err) {
    // Log but do not throw — on-chain reads are best-effort.
    console.warn(
      `[onChainRegistry] get_contract(${contractAddress}) failed: ${err?.message ?? err}`,
    );
    return null;
  }
}

// ── Core: get_events ─────────────────────────────────────────────────────────

/**
 * Call `get_events(contract_id: Address)` on the on-chain registry contract
 * and return a list of raw decoded event entries, or an empty array on any error.
 *
 * @param {string} contractAddress
 * @param {{ rpc?: SorobanRpc.Server }} [opts]
 * @returns {Promise<OnChainEventEntry[]>}
 */
export async function getEventsFromChain(contractAddress, opts = {}) {
  const registryId = getRegistryContractId();
  if (!registryId) {
    return [];
  }

  const rpc = opts.rpc ?? buildRpcClient();

  try {
    const contractIdScVal = new Address(contractAddress).toScVal();

    const result = await rpc.simulateTransaction(
      buildInvokeHostFunctionTx({
        contractId: registryId,
        functionName: "get_events",
        args: [contractIdScVal],
      }),
    );

    if (SorobanRpc.Api.isSimulationError(result)) {
      return [];
    }

    if (!result.result?.retval) {
      return [];
    }

    // The return value is expected to be a Vec of event maps.
    const native = scValToNative(result.result.retval);
    if (!Array.isArray(native)) {
      return [];
    }

    return native.map((item) => normalizeEventEntry(item));
  } catch (err) {
    console.warn(
      `[onChainRegistry] get_events(${contractAddress}) failed: ${err?.message ?? err}`,
    );
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve the network passphrase for the active STELLAR_NETWORK.
 * Falls back to testnet if unrecognised.
 *
 * @returns {string}
 */
function resolveNetworkPassphrase() {
  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  if (network === "mainnet") return Networks.PUBLIC;
  if (network === "devnet") return "Standalone Network ; February 2017";
  return Networks.TESTNET;
}

/**
 * Build a minimal transaction envelope for an InvokeHostFunction operation so
 * that `simulateTransaction` can be called. Uses the stellar-sdk v12
 * `Contract.call()` + `TransactionBuilder` API — no raw XDR construction.
 *
 * The source account keypair is ephemeral; fee and sequence are placeholders
 * since this transaction is only ever submitted to `simulateTransaction`.
 *
 * @param {{ contractId: string, functionName: string, args: import('@stellar/stellar-sdk').xdr.ScVal[] }} params
 * @returns {import('@stellar/stellar-sdk').Transaction}
 */
function buildInvokeHostFunctionTx({ contractId, functionName, args }) {
  const ephemeralKey = Keypair.random();
  const source = new Account(ephemeralKey.publicKey(), "0");
  const contract = new Contract(contractId);
  return new TransactionBuilder(source, {
    fee: "100",
    networkPassphrase: resolveNetworkPassphrase(),
  })
    .addOperation(contract.call(functionName, ...args))
    .setTimeout(30)
    .build();
}

/**
 * Decode a `get_contract` ScVal return value into a plain object.
 *
 * @param {xdr.ScVal} retval
 * @returns {OnChainContractEntry | null}
 */
function decodeContractEntry(retval) {
  try {
    const native = scValToNative(retval);
    if (!native || typeof native !== "object") return null;
    return {
      contractId: native.contract_id ?? native.contractId ?? null,
      name: native.name ?? null,
      description: native.description ?? null,
      abi: native.abi ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Normalize a raw on-chain event entry to a consistent shape.
 *
 * @param {unknown} raw
 * @returns {OnChainEventEntry}
 */
function normalizeEventEntry(raw) {
  if (!raw || typeof raw !== "object") {
    return { type: "unknown", data: raw };
  }
  return {
    type: raw.type ?? raw.event_type ?? "unknown",
    ledger: raw.ledger ?? null,
    data: raw.data ?? raw,
  };
}

// ── JSDoc type definitions ────────────────────────────────────────────────────

/**
 * @typedef {Object} OnChainContractEntry
 * @property {string | null} contractId
 * @property {string | null} name
 * @property {string | null} description
 * @property {unknown | null} abi
 */

/**
 * @typedef {Object} OnChainEventEntry
 * @property {string} type
 * @property {number | null} ledger
 * @property {unknown} data
 */
