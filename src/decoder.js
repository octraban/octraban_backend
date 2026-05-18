import { xdr, scValToNative, StrKey } from "@stellar/stellar-sdk";
import { db } from "./db.js";

/**
 * Decode a raw Soroban RPC event into a human-readable record.
 * Falls back to a generic description when no ABI is registered.
 */
export async function decode(ev) {
  const contractId = ev.contractId;
  const topics     = ev.topic.map(t => scValToNative(t));
  const data       = scValToNative(ev.value);

  // First topic is typically the function name symbol
  const fnName = typeof topics[0] === "symbol" || typeof topics[0] === "string"
    ? String(topics[0])
    : "unknown";

  // Look up registered ABI for richer description
  const meta = await db.getContractMeta(contractId).catch(() => null);
  const fnAbi = meta?.functions?.find(f => f.name === fnName);

  const description = fnAbi
    ? buildDescription(fnName, topics.slice(1), data, meta.name)
    : genericDescription(fnName, topics.slice(1), data, contractId);

  return {
    contract_id: contractId,
    function:    fnName,
    ledger:      ev.ledger,
    tx_hash:     ev.txHash,
    description,
    raw_topics:  topics.map(String),
    raw_data:    JSON.stringify(data),
  };
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
