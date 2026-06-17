/**
 * Storage tier classifier
 *
 * Reads the soroban ledger change stream from txMeta and categorises every
 * ContractDataEntry write into one of three tiers:
 *
 *   instance   — persistent durability, key = scvLedgerKeyContractInstance
 *   persistent — persistent durability, any other key
 *   temporary  — temporary durability
 *
 * Only CREATED and UPDATED changes are counted (not STATE or REMOVED).
 */

import { StrKey, scValToNative } from "@stellar/stellar-sdk";

/**
 * @typedef {{ tier: 'instance'|'persistent'|'temporary', contractId: string, key: string, changeType: 'created'|'updated' }} StorageWrite
 */

/**
 * Classify all ContractData writes in a transaction into storage tiers.
 *
 * @param {object} ev  Raw Soroban RPC event (must have ev.txMeta)
 * @returns {{ instance: StorageWrite[], persistent: StorageWrite[], temporary: StorageWrite[] }}
 */
export function classifyStorageWrites(ev) {
  const result = { instance: [], persistent: [], temporary: [] };

  try {
    const sorobanMeta = ev.txMeta?.v3?.().sorobanMeta?.();
    if (!sorobanMeta) return result;

    for (const change of sorobanMeta.changedEntries?.() ?? []) {
      try {
        const switchName = change.switch().name;
        if (switchName !== "ledgerEntryCreated" && switchName !== "ledgerEntryUpdated") continue;

        const entry = switchName === "ledgerEntryCreated" ? change.created() : change.updated();
        const contractData = entry.data?.().contractData?.();
        if (!contractData) continue;

        const durability = contractData.durability().name; // "temporary" | "persistent"
        const keyType = contractData.key().switch().name; // scvLedgerKeyContractInstance | …
        const contractId = StrKey.encodeContract(contractData.contract().contractId());
        const keyLabel =
          keyType === "scvLedgerKeyContractInstance" ? "ContractInstance" : safeKeyLabel(contractData.key());
        const changeType = switchName === "ledgerEntryCreated" ? "created" : "updated";

        const write = { tier: null, contractId, key: keyLabel, changeType };

        if (durability === "temporary") {
          write.tier = "temporary";
          result.temporary.push(write);
        } else if (keyType === "scvLedgerKeyContractInstance") {
          write.tier = "instance";
          result.instance.push(write);
        } else {
          write.tier = "persistent";
          result.persistent.push(write);
        }
      } catch {
        /* skip malformed entry */
      }
    }
  } catch {
    /* ignore missing txMeta */
  }

  return result;
}

function safeKeyLabel(scVal) {
  try {
    const native = scValToNative(scVal);
    if (typeof native === "string" || typeof native === "number") return String(native);
    return JSON.stringify(native, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return "?";
  }
}
