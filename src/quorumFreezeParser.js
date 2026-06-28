/**
 * Quorum Freeze Parser — CAP-0077 / Protocol 26
 *
 * CAP-0077 allows network validators to collectively freeze specific ledger
 * keys or contract instances during security incidents. A freeze is enacted
 * via a config-setting ledger entry update that records an array of
 * LedgerKeys that are quarantined network-wide.
 *
 * This module:
 *  1. Scans ledger/transaction metadata for config-setting changes that
 *     add or modify the frozenKeys list (configSettingContractFrozenKeys).
 *  2. Checks whether a given contract ID appears in that frozen set.
 *  3. Cross-references subsequent Soroban transactions that fail with the
 *     error code TRAPPED_CONTRACT (host error 9) to surface quarantine
 *     rejections in the explorer.
 */

import { StrKey } from "@stellar/stellar-sdk";

// Protocol 26 config-setting ID for frozen ledger keys
const FROZEN_KEYS_SETTING_NAME = "configSettingContractFrozenKeys";

// Host error code emitted when an invocation targets a frozen contract
const QUARANTINE_HOST_ERROR_CODE = 9; // wasm_vm_err / trapped (reused for frozen)

/**
 * Extract all contract IDs from an array of LedgerKey XDR objects.
 * Handles both ContractCode keys (keyed by wasmHash) and ContractData
 * instance keys (keyed by contractId + scvLedgerKeyContractInstance).
 *
 * @param {xdr.LedgerKey[]} ledgerKeys
 * @returns {Set<string>}  C-strkey encoded contract IDs
 */
function contractIdsFromLedgerKeys(ledgerKeys) {
  const ids = new Set();
  for (const key of ledgerKeys) {
    try {
      const typeName = key.switch().name;
      if (typeName === "account" || typeName === "trustline") continue;

      if (typeName === "contractData") {
        const cd = key.contractData();
        const contractHex = Buffer.from(cd.contract().contractId()).toString("hex");
        ids.add(StrKey.encodeContract(Buffer.from(contractHex, "hex")));
      } else if (typeName === "contractCode") {
        // ContractCode keys are identified by wasmHash — we store the hash
        // string since we may not know the contract ID at freeze time.
        const hash = Buffer.from(key.contractCode().hash()).toString("hex");
        ids.add(`wasm:${hash}`);
      }
    } catch {
      /* skip malformed keys */
    }
  }
  return ids;
}

/**
 * Parse a CAP-0077 quorum freeze event from transaction or ledger metadata.
 *
 * Scans `txMeta.sorobanMeta.changedEntries` for a ledgerEntryUpdated entry
 * of type `configSetting` whose `configSettingId` is the frozen-keys setting.
 * When found, returns the full set of frozen contract IDs/wasm hashes.
 *
 * @param {object} txMeta  Raw transaction meta object from the Soroban RPC
 * @returns {{ frozen_ids: string[], ledger: number|null, tx_hash: string|null } | null}
 */
export function detectQuorumFreeze(txMeta) {
  try {
    const sorobanMeta = txMeta?.v3?.().sorobanMeta?.();
    if (!sorobanMeta) return null;

    const changes = sorobanMeta.changedEntries?.() ?? [];
    for (const change of changes) {
      try {
        const switchName = change.switch().name;
        if (switchName !== "ledgerEntryUpdated" && switchName !== "ledgerEntryCreated") continue;

        const entry = switchName === "ledgerEntryUpdated" ? change.updated() : change.created();

        const data = entry.data?.();
        if (!data) continue;

        // We need a configSetting entry
        if (data.switch().name !== "configSetting") continue;
        const cfgEntry = data.configSetting();

        // Check for the frozen-keys setting ID
        const settingId = cfgEntry.configSettingId?.().name;
        if (settingId !== FROZEN_KEYS_SETTING_NAME) continue;

        // Extract frozen LedgerKeys from the setting value
        const frozenKeys = cfgEntry.contractFrozenKeys?.() ?? [];
        const frozen_ids = [...contractIdsFromLedgerKeys(frozenKeys)];

        if (frozen_ids.length === 0) return null;
        return { frozen_ids };
      } catch {
        /* skip malformed entries */
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Determine whether a specific contract ID is in the frozen keys set of a
 * quorum freeze event record stored in the DB.
 *
 * @param {string[]} frozen_ids  Stored freeze record (array of C-strkeys / wasm: hashes)
 * @param {string}   contractId  C-strkey encoded contract address to check
 * @returns {boolean}
 */
export function isContractFrozen(frozen_ids, contractId) {
  if (!Array.isArray(frozen_ids)) return false;
  return frozen_ids.includes(contractId);
}

/**
 * Check whether a failed transaction was rejected due to a quorum freeze
 * quarantine (host error TRAPPED_CONTRACT).
 *
 * @param {object} diagnosticEvents  Array of diagnostic event objects from RPC
 * @returns {boolean}
 */
export function isQuarantineRejection(diagnosticEvents) {
  if (!Array.isArray(diagnosticEvents)) return false;
  return diagnosticEvents.some((ev) => {
    try {
      const topics = ev?.event?.body?.v0?.()?.topics?.();
      if (!topics) return false;
      for (const t of topics) {
        if (t.switch?.().name === "scvError") {
          const code = t.error?.()?.code?.()?.value;
          if (code === QUARANTINE_HOST_ERROR_CODE) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  });
}
