import { xdr, scValToNative, StrKey } from "@stellar/stellar-sdk";
import { parseTTLHostFunction, formatTTLExtension } from "./ttlExtensionParser.js";
import { parseZkHostFunctions, computeZkCostDelta } from "./zkHostFunctions.js";

// Issue #134 — result codes that indicate block compute capacity was exhausted
const RESOURCE_LIMIT_CODES = new Set([
  "tx_resource_limit_exceeded",
  "txResourceLimitExceeded",
  "RESOURCE_LIMIT_EXCEEDED",
]);

/**
 * Returns true when the transaction was dropped because the block's total
 * resource budget was full.
 * @param {object} ev  Raw Soroban RPC event
 */
function isResourceLimitExceeded(ev) {
  const code = ev.txResultCode ?? ev.resultCode ?? ev.result?.code ?? "";
  return RESOURCE_LIMIT_CODES.has(String(code));
}

/**
 * Issue #40 — Extract CPU instructions, memory bytes, and fee charged from
 * the Soroban RPC event's transaction metadata.
 *
 * The Soroban RPC event object may carry a `feeBump` or `feeCharged` field
 * directly, and the `txMeta` (TransactionMeta XDR) contains sorobanMeta with
 * resource usage.  We extract what's available and return undefined for the
 * rest so callers can store only what exists.
 *
 * @param {object} ev  Raw Soroban RPC event
 * @returns {{ cpu_instructions?: number, mem_bytes?: number, fee_charged?: number }}
 */
function extractGasCosts(ev) {
  const result = {};

  try {
    // fee_charged is sometimes surfaced directly on the event
    if (ev.feeCharged != null) result.fee_charged = Number(ev.feeCharged);

    const meta = ev.txMeta;
    if (!meta) return result;

    // TransactionMeta is an XDR union; v3 carries sorobanMeta
    let sorobanMeta = null;
    try {
      sorobanMeta = meta.v3?.().sorobanMeta?.() ?? null;
    } catch { /* not v3 */ }

    if (!sorobanMeta) return result;

    // SorobanTransactionMeta.ext carries resource fee breakdown in v1
    try {
      const extV1 = sorobanMeta.ext?.().v1?.();
      if (extV1) {
        if (extV1.totalNonRefundableResourceFeeCharged != null)
          result.cpu_instructions = Number(extV1.totalNonRefundableResourceFeeCharged);
        if (extV1.totalRefundableResourceFeeCharged != null)
          result.fee_charged = Number(extV1.totalRefundableResourceFeeCharged);
        if (extV1.rentFeeCharged != null)
          result.mem_bytes = Number(extV1.rentFeeCharged);
      }
    } catch { /* ext not v1 */ }
  } catch { /* ignore all extraction errors */ }

  return result;
}

import { db } from "./db.js";
import { sacLabel, detectSac, detectSacAsset } from "./sac.js";
import { classifySacSideEffect } from "./sacSideEffect.js";
import { extractRoleAssignment } from "./roleTracker.js";
import { decodeRwaEvent } from "./rwaDecoder.js";
import { parseHeuristic } from "./heuristicParser.js";

// Native XLM Stellar Asset Contract IDs (testnet + mainnet)
const NATIVE_SAC_IDS = new Set([
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", // testnet
  "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA", // mainnet
]);

/**
 * Decode a raw Soroban RPC event into a human-readable record.
 * Uses the ABI template when available; falls back to a generic description.
 */
export async function decode(ev) {
  const contractId = ev.contractId;
  const topics     = ev.topic.map(t => scValToNative(t));
  const data       = scValToNative(ev.value);

  // First topic is typically the function name symbol
  const fnName = typeof topics[0] === "symbol" || typeof topics[0] === "string"
    ? String(topics[0])
    : "unknown";

  // Detect native XLM wrap/unwrap on the SAC contract
  if (NATIVE_SAC_IDS.has(contractId)) {
    const wrapUnwrap = nativeXlmDescription(fnName, topics.slice(1), data);
    if (wrapUnwrap) {
      return {
        contract_id: contractId,
        function:    wrapUnwrap.function,
        ledger:      ev.ledger,
        tx_hash:     ev.txHash,
        description: wrapUnwrap.description,
        raw_topics:  topics.map(String),
        raw_data:    JSON.stringify(data),
        ...extractGasCosts(ev),
      };
    }
  }

  // Look up registered ABI for richer description
  const meta = await db.getContractMeta(contractId).catch(() => null);
  const fnAbi = meta?.functions?.find(f => f.name === fnName);

  // Check if this contract is a registered vault
  const vaultMeta = await db.getVault(contractId).catch(() => null);

  const { isSac, assetCode } = detectSac(contractId);
  const { assetIssuer } = detectSacAsset(contractId);
  const contractLabel = vaultMeta?.name
    ? `${vaultMeta.name} (Vault)`
    : isSac
      ? `${assetCode} (SAC:${contractId.slice(0, 8)}…)`
      : (meta?.name ?? contractId);

  // Issue #81: Try RWA decoder first
  let description = null;
  if (meta) {
    const tempDecoded = {
      contract_id: contractId,
      function: fnName,
      raw_topics: topics.map(String),
      raw_data: JSON.stringify(data),
    };
    description = decodeRwaEvent(tempDecoded, meta);
  }

  // Fall back to standard decoders
  if (!description) {
    description = vaultMeta
      ? vaultDescription(fnName, topics.slice(1), data, contractLabel, vaultMeta)
      : fnAbi
        ? buildDescription(fnName, topics.slice(1), data, contractLabel)
        : genericDescription(fnName, topics.slice(1), data, contractLabel);
  }

  // Attach heuristic params when no ABI was available (no fnAbi, not a vault, not RWA)
  const heuristicParams = (!fnAbi && !vaultMeta && !meta)
    ? parseHeuristic([...topics.slice(1), ...(data != null ? [data] : [])])
    : undefined;

  const decoded = {
    contract_id: contractId,
    function:    fnName,
    ledger:      ev.ledger,
    tx_hash:     ev.txHash,
    description,
    raw_topics:  topics.map(String),
    raw_data:    JSON.stringify(data),
    ...(isSac && { sac_asset: assetCode }),
    is_clawback: fnName === "clawback",
    is_resource_limit_exceeded: isResourceLimitExceeded(ev),
    ...extractGasCosts(ev),
    ...(heuristicParams && { heuristic_params: heuristicParams }),
  };

  // Protocol 26: detect TTL extension host function calls on this event
  const ttlExt = parseTTLHostFunction(ev.hostFunction ?? ev.host_function ?? ev.operation ?? null);
  if (ttlExt) {
    decoded.ttl_extension = ttlExt;
    // Enrich description so the ledger history row is self-explanatory
    decoded.description = formatTTLExtension(ttlExt);
  }

  // Issue #164 — Protocol 26: detect CAP-0080 ZK host function calls
  const zkCalls = parseZkHostFunctions(ev);
  if (zkCalls) {
    decoded.zk_host_calls = { calls: zkCalls, delta: computeZkCostDelta(zkCalls) };
  }

  // Persist role assignment if this event carries one
  const roleAssignment = extractRoleAssignment(decoded);
  if (roleAssignment) {
    db.upsertRole({ contract_id: contractId, ledger: ev.ledger, ...roleAssignment })
      .catch(err => console.error("[roleTracker] upsertRole failed:", err.message));
  }

  return decoded;
}

/**
 * Returns wrap/unwrap label and description for native XLM SAC events.
 * mint on native SAC = Classic XLM → Soroban (wrap)
 * burn on native SAC = Soroban → Classic XLM (unwrap)
 */
function nativeXlmDescription(fnName, args, data) {
  if (fnName === "mint") {
    const [to, amount] = args;
    const amt = amount ?? data;
    return {
      function: "wrap_native",
      description: `Wrapped ${fmtXlm(amt)} XLM (Classic → Soroban) to ${fmt(to)}`,
    };
  }
  if (fnName === "burn") {
    const [from, amount] = args;
    const amt = amount ?? data;
    return {
      function: "unwrap_native",
      description: `Unwrapped ${fmtXlm(amt)} XLM (Soroban → Classic) from ${fmt(from)}`,
    };
  }
  return null;
}

function vaultDescription(fn, args, data, contractName, vaultMeta) {
  const assetLabel = vaultMeta.underlying_asset
    ? `asset ${vaultMeta.underlying_asset.slice(0, 6)}…${vaultMeta.underlying_asset.slice(-4)}`
    : "underlying asset";
  switch (fn) {
    case "mint":
    case "deposit": {
      const [admin, to, amount, shares] = args;
      return `Deposited ${String(amount ?? data ?? "?")} ${assetLabel} → minted ${String(shares ?? "?")} shares to ${fmt(to ?? admin)} on ${contractName}`;
    }
    case "burn":
    case "withdraw": {
      const [admin, from, to, assets, shares] = args.length >= 4 ? args : [null, null, args[0], args[1], args[2]];
      const amt = assets ?? data;
      const shr = shares ?? "?";
      return `Burned ${String(shr)} shares → withdrew ${String(amt)} ${assetLabel} from ${fmt(from ?? admin ?? to)} on ${contractName}`;
    }
    default:
      return genericDescription(fn, args, data, contractName);
  }
}

function buildDescription(fn, args, data, contractName) {
  switch (fn) {
    case "swap": {
      const [from, amtIn, tokenIn, amtOut, tokenOut] = args;
      return `Address ${fmt(from)} swapped ${amtIn} ${tokenIn} → ${amtOut} ${tokenOut} on ${contractName}`;
    }
    case "transfer": {
      const [from, to, amount, token] = args;
      return `Address ${fmt(from)} transferred ${amount} ${token ?? ""} to ${fmt(to)} on ${contractName}`;
    }
    case "mint": {
      const [to, amount, token] = args;
      return `${amount} ${token ?? ""} minted to ${fmt(to)} on ${contractName}`;
    }
    case "burn": {
      const [from, amount, token] = args;
      return `${amount} ${token ?? ""} burned from ${fmt(from)} on ${contractName}`;
    }
    case "clawback": {
      const [admin, from, amount, token] = args;
      return `CLAWBACK: ${amount} ${token ?? ""} recovered from ${fmt(from)} by authority ${fmt(admin)} on ${contractName}`;
    }
    default:
      return genericDescription(fn, args, data, contractName);
  }
}

function genericDescription(fn, args, data, contractId) {
  const argStr = args.map(String).join(", ");
  return `${fn}(${argStr}) called on ${contractId}`;
}

function fmt(addr) {
  if (typeof addr !== "string" || addr.length < 10) return String(addr);
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtXlm(amount) {
  if (amount == null) return "?";
  // SAC amounts are in stroops (1 XLM = 10_000_000 stroops)
  const n = Number(amount);
  return isNaN(n) ? String(amount) : (n / 1e7).toLocaleString(undefined, { maximumFractionDigits: 7 });
}
