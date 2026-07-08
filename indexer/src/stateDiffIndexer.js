/**
 * State-Diff Timeline Indexer
 *
 * Extracts ContractDataEntry mutations from sorobanMeta.changedEntries and
 * persists them as storage_state_diffs rows keyed by (contract_id, ledger).
 * The API layer serves them sorted by ledger so the frontend can render
 * a visual timeline slider.
 */

import { StrKey, scValToNative } from "@stellar/stellar-sdk";

/**
 * Safely convert an ScVal to a human-readable label.
 * @param {object} scVal
 * @returns {string}
 */
function scValLabel(scVal) {
  try {
    const native = scValToNative(scVal);
    if (typeof native === "bigint") return native.toString();
    return JSON.stringify(native);
  } catch {
    try {
      return scVal.switch().name;
    } catch {
      return "?";
    }
  }
}

/**
 * Derive storage tier from a ContractData entry.
 * @param {object} contractData
 * @returns {"instance"|"persistent"|"temporary"}
 */
function deriveTier(contractData) {
  try {
    const durability = contractData.durability().name;
    if (durability === "temporary") return "temporary";
    const keyType = contractData.key().switch().name;
    if (keyType === "scvLedgerKeyContractInstance") return "instance";
  } catch {
    /* fall through */
  }
  return "persistent";
}

/**
 * Extract all ContractData state mutations from a raw Soroban RPC event.
 *
 * Returns an array of diff entries:
 *   { contract_id, ledger, tx_hash, key, tier, old_value, new_value, change_type }
 *
 * change_type is one of: "created" | "updated" | "removed"
 *
 * @param {object} ev  Raw Soroban RPC event (must have ev.txMeta, ev.ledger, ev.contractId, ev.txHash)
 * @returns {Array<object>}
 */
export function extractStateDiffs(ev) {
  const diffs = [];

  try {
    const sorobanMeta = ev.txMeta?.v3?.().sorobanMeta?.();
    if (!sorobanMeta) return diffs;

    const changes = sorobanMeta.changedEntries?.() ?? [];

    // Build before/after maps keyed by (contractId::keyLabel)
    const before = new Map();
    const after = new Map();

    for (const change of changes) {
      try {
        const switchName = change.switch().name;

        if (switchName === "ledgerEntryRemoved") {
          const key = change.removed();
          const contractData = key.contractData?.();
          if (!contractData) continue;
          const contractId = StrKey.encodeContract(contractData.contract().contractId());
          const keyLabel = scValLabel(contractData.key());
          const composite = `${contractId}::${keyLabel}`;
          before.set(composite, {
            contractId,
            keyLabel,
            valueLabel: "(existed)",
            tier: deriveTier(contractData),
          });
          after.set(composite, {
            contractId,
            keyLabel,
            valueLabel: null,
            tier: "persistent",
            removed: true,
          });
          continue;
        }

        let entry = null;
        let phase = null;

        if (switchName === "ledgerEntryState") {
          entry = change.state();
          phase = "before";
        } else if (switchName === "ledgerEntryCreated") {
          entry = change.created();
          phase = "after";
        } else if (switchName === "ledgerEntryUpdated") {
          entry = change.updated();
          phase = "after";
        } else {
          continue;
        }

        const contractData = entry.data?.().contractData?.();
        if (!contractData) continue;

        const contractId = StrKey.encodeContract(contractData.contract().contractId());
        const keyLabel = scValLabel(contractData.key());
        const valueLabel = scValLabel(contractData.val());
        const tier = deriveTier(contractData);
        const composite = `${contractId}::${keyLabel}`;

        if (phase === "before") {
          before.set(composite, { contractId, keyLabel, valueLabel, tier });
        } else {
          after.set(composite, { contractId, keyLabel, valueLabel, tier });
        }
      } catch {
        /* skip malformed entry */
      }
    }

    // Emit diffs
    for (const [composite, afterEntry] of after) {
      const beforeEntry = before.get(composite);
      const changeType = afterEntry.removed ? "removed" : beforeEntry ? "updated" : "created";

      diffs.push({
        contract_id: afterEntry.contractId,
        ledger: Number(ev.ledger),
        tx_hash: ev.txHash ?? null,
        key: afterEntry.keyLabel,
        tier: afterEntry.tier ?? "persistent",
        old_value: beforeEntry?.valueLabel ?? null,
        new_value: afterEntry.removed ? null : afterEntry.valueLabel,
        change_type: changeType,
      });
    }
  } catch {
    /* non-fatal */
  }

  return diffs;
}
