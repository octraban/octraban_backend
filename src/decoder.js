import { xdr, scValToNative, StrKey } from "@stellar/stellar-sdk";
import { db } from "./db.js";
import { renderTemplate } from "./templateRenderer.js";

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

  const meta  = await db.getContractMeta(contractId).catch(() => null);
  const fnAbi = meta?.functions?.find(f => f.name === fnName);

  const description = fnAbi?.template
    ? renderTemplate(fnAbi.template, fnAbi.params ?? [], topics.slice(1),
        { contractName: meta.name, fnName })
    : genericDescription(fnName, topics.slice(1), contractId);

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

function genericDescription(fn, args, contractId) {
  return `${fn}(${args.map(String).join(", ")}) called on ${contractId}`;
}
