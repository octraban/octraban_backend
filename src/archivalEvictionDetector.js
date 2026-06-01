/**
 * Archival Eviction Detector — Issue #167
 *
 * Scans the soroban ledger change stream from txMeta and identifies
 * ContractData / ContractCode entries whose TTL has hit 0, meaning they
 * have transitioned from the live ledger state into the off-chain archive.
 *
 * A ledger entry is considered evicted when the change type is
 * `ledgerEntryRemoved` (the protocol removes it from the live state once
 * its liveUntilLedger < currentLedger).
 */

import { xdr, StrKey, scValToNative } from "@stellar/stellar-sdk";

/**
 * Classify a removed LedgerEntry into a structured descriptor.
 *
 * @param {xdr.LedgerEntry} entry
 * @returns {{ key_type: string, key_label: string, contract_id?: string, wasm_hash?: string, data_key?: string, durability?: string } | null}
 */
function classifyRemovedEntry(entry) {
  try {
    const data = entry.data();
    const kind = data.switch().name;

    if (kind === "contractData") {
      const cd = data.contractData();
      const durability = cd.durability().name === "persistent" ? "persistent" : "temporary";
      const contractId = StrKey.encodeContract(cd.contract().contractId());
      const keyVal = cd.key();
      const isInstance = keyVal.switch().name === "scvLedgerKeyContractInstance";

      if (isInstance) {
        return {
          key_type: "contractInstance",
          key_label: `Contract instance (${contractId.slice(0, 8)}…)`,
          contract_id: contractId,
          durability,
        };
      }

      let data_key;
      try { data_key = String(scValToNative(keyVal)); } catch { data_key = keyVal.switch().name; }
      return {
        key_type: "contractData",
        key_label: `Contract data key "${data_key}" (${contractId.slice(0, 8)}…)`,
        contract_id: contractId,
        data_key,
        durability,
      };
    }

    if (kind === "contractCode") {
      const wasm_hash = Buffer.from(data.contractCode().hash()).toString("hex");
      return {
        key_type: "contractCode",
        key_label: `Contract WASM code (${wasm_hash.slice(0, 12)}…)`,
        wasm_hash,
      };
    }

    // account / trustline entries are not subject to Soroban TTL eviction
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect evicted ledger keys from a raw Soroban RPC event's txMeta.
 *
 * Only `persistent` ContractData and ContractCode entries can be evicted
 * (temporary entries are simply deleted, not archived).  We surface both
 * here so callers can decide how to label them.
 *
 * @param {object} ev   Raw Soroban RPC event (must have ev.txMeta)
 * @param {number} ledger  Current ledger sequence number
 * @param {string} [txHash]  Transaction hash for cross-referencing
 * @returns {Array<{
 *   contract_id: string|undefined,
 *   ledger: number,
 *   tx_hash: string|undefined,
 *   key_type: string,
 *   key_label: string,
 *   durability: string|undefined,
 *   wasm_hash: string|undefined,
 *   data_key: string|undefined,
 * }>}
 */
export function detectEvictions(ev, ledger, txHash) {
  const evictions = [];

  try {
    const sorobanMeta = ev.txMeta?.v3?.().sorobanMeta?.();
    if (!sorobanMeta) return evictions;

    for (const change of sorobanMeta.changedEntries?.() ?? []) {
      try {
        if (change.switch().name !== "ledgerEntryRemoved") continue;

        // `removed()` returns the LedgerKey, not the full entry.
        // We reconstruct what we can from the key alone.
        const key = change.removed();
        const kind = key.switch().name;

        if (kind === "contractData") {
          const cd = key.contractData();
          const durability = cd.durability().name === "persistent" ? "persistent" : "temporary";
          const contract_id = StrKey.encodeContract(cd.contract().contractId());
          const keyVal = cd.key();
          const isInstance = keyVal.switch().name === "scvLedgerKeyContractInstance";

          let key_type, key_label, data_key;
          if (isInstance) {
            key_type = "contractInstance";
            key_label = `Contract instance (${contract_id.slice(0, 8)}…)`;
          } else {
            key_type = "contractData";
            try { data_key = String(scValToNative(keyVal)); } catch { data_key = keyVal.switch().name; }
            key_label = `Contract data key "${data_key}" (${contract_id.slice(0, 8)}…)`;
          }

          evictions.push({ contract_id, ledger, tx_hash: txHash, key_type, key_label, durability, data_key });
        } else if (kind === "contractCode") {
          const wasm_hash = Buffer.from(key.contractCode().hash()).toString("hex");
          evictions.push({
            contract_id: undefined,
            ledger,
            tx_hash: txHash,
            key_type: "contractCode",
            key_label: `Contract WASM code (${wasm_hash.slice(0, 12)}…)`,
            wasm_hash,
          });
        }
      } catch { /* skip malformed change */ }
    }
  } catch { /* ignore missing txMeta */ }

  return evictions;
}
