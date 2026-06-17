import { parseFootprint } from "./footprintParser.js";

/**
 * Serialize a write-key descriptor to a stable string for set membership tests.
 * Uses the fields that uniquely identify a storage slot.
 *
 * @param {{ type: string, contractId?: string, dataKey?: string, wasmHash?: string }} key
 * @returns {string}
 */
function keyToString(key) {
  switch (key.type) {
    case "contractData":
    case "contractInstance":
      return `${key.type}:${key.contractId}:${key.dataKey ?? ""}:${key.durability ?? ""}`;
    case "contractCode":
      return `contractCode:${key.wasmHash}`;
    default:
      return `${key.type}:${key.contractId ?? ""}:${key.accountId ?? ""}`;
  }
}

/**
 * Extract the set of write-key strings from a raw Soroban RPC event object.
 * Returns an empty Set when no footprint XDR is present.
 *
 * @param {object} ev  Raw event from SorobanRpc.getEvents()
 * @returns {Set<string>}
 */
function writeKeysOf(ev) {
  const footprintXdr =
    ev.transaction?.envelope?.v1?.tx?.ext?.sorobanData?.resources?.footprint ?? ev.footprintXdr ?? null;

  if (!footprintXdr) return new Set();

  try {
    const { writes } = parseFootprint(footprintXdr);
    return new Set(writes.keys.map(keyToString));
  } catch {
    return new Set();
  }
}

/**
 * Scan a list of raw events from a single ledger and flag contention.
 *
 * A transaction is flagged (footprint_contention = true) when its write-key
 * set intersects with the write-key set of the immediately preceding
 * transaction in the ledger's queue (same tx_hash order as returned by RPC).
 *
 * The function mutates each event object in-place by adding
 * `footprint_contention: boolean`.
 *
 * @param {object[]} events  Raw events from a single ledger (in RPC order)
 */
export function scanFootprintContention(events) {
  // Group events by tx_hash to treat each transaction as a unit.
  // Preserve insertion order (Map keeps order).
  const txOrder = [];
  const txWriteKeys = new Map(); // tx_hash → Set<string>
  const txEvents = new Map(); // tx_hash → event[]

  for (const ev of events) {
    const hash = ev.txHash ?? ev.tx_hash ?? "";
    if (!txWriteKeys.has(hash)) {
      txOrder.push(hash);
      txWriteKeys.set(hash, writeKeysOf(ev));
      txEvents.set(hash, []);
    }
    txEvents.get(hash).push(ev);
  }

  // Compare each tx's write keys against the immediately preceding tx.
  for (let i = 0; i < txOrder.length; i++) {
    const hash = txOrder[i];
    const contention = i > 0 && setsIntersect(txWriteKeys.get(hash), txWriteKeys.get(txOrder[i - 1]));
    for (const ev of txEvents.get(hash)) {
      ev.footprint_contention = contention;
    }
  }
}

/** @param {Set<string>} a @param {Set<string>} b @returns {boolean} */
function setsIntersect(a, b) {
  if (a.size === 0 || b.size === 0) return false;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of small) if (large.has(v)) return true;
  return false;
}
