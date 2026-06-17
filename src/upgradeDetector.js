/**
 * Contract upgrade detector
 *
 * Detects `update_current_contract_wasm` invocations by inspecting the
 * soroban ledger changes in txMeta for a state→updated transition on the
 * contract's ContractInstance entry (key = scvLedgerKeyContractInstance).
 *
 * Returns { type: 'upgrade', oldHash: string, newHash: string } when found,
 * or null when the transaction is not an upgrade.
 */

/**
 * Extract the hex-encoded WASM hash from a ContractDataEntry whose val is
 * scvContractInstance. Returns null if the entry is not a WASM instance.
 *
 * @param {xdr.ContractDataEntry} contractData
 * @returns {string|null}
 */
function wasmHashFromContractData(contractData) {
  try {
    const val = contractData.val();
    if (val.switch().name !== "scvContractInstance") return null;
    const exec = val.instance().executable();
    if (exec.switch().name !== "contractExecutableWasm") return null;
    return Buffer.from(exec.wasmHash()).toString("hex");
  } catch {
    return null;
  }
}

/**
 * Detect a contract upgrade in a raw Soroban RPC event's transaction metadata.
 *
 * Looks for a (state, updated) pair in sorobanMeta.changedEntries where both
 * entries are contractData with key=scvLedgerKeyContractInstance and the
 * executable wasmHash differs between them.
 *
 * @param {object} ev  Raw Soroban RPC event (must have ev.txMeta)
 * @returns {{ type: 'upgrade', oldHash: string, newHash: string } | null}
 */
export function detectUpgrade(ev) {
  try {
    const sorobanMeta = ev.txMeta?.v3?.().sorobanMeta?.();
    if (!sorobanMeta) return null;

    const changes = sorobanMeta.changedEntries?.() ?? [];

    // Collect state (before) and updated (after) contractInstance entries keyed
    // by their contract address hex so we can pair them.
    const before = new Map(); // contractHex → wasmHash
    const after = new Map();

    for (const change of changes) {
      try {
        const switchName = change.switch().name;
        if (switchName !== "ledgerEntryState" && switchName !== "ledgerEntryUpdated") continue;

        const entry = switchName === "ledgerEntryState" ? change.state() : change.updated();
        const contractData = entry.data?.().contractData?.();
        if (!contractData) continue;

        // Must be the contract instance key
        if (contractData.key?.().switch().name !== "scvLedgerKeyContractInstance") continue;

        const hash = wasmHashFromContractData(contractData);
        if (!hash) continue;

        const contractHex = Buffer.from(contractData.contract().contractId()).toString("hex");

        if (switchName === "ledgerEntryState") before.set(contractHex, hash);
        if (switchName === "ledgerEntryUpdated") after.set(contractHex, hash);
      } catch {
        /* skip malformed entry */
      }
    }

    // Find a contract whose hash changed between state and updated
    for (const [contractHex, oldHash] of before) {
      const newHash = after.get(contractHex);
      if (newHash && newHash !== oldHash) {
        return { type: "upgrade", oldHash, newHash };
      }
    }

    return null;
  } catch {
    return null;
  }
}
