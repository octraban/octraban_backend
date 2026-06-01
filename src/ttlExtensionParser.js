/**
 * TTL Extension Parser — Protocol 26
 *
 * Protocol 26 replaced the old ExtendCurrentContractInstanceOp / ExtendCurrentContractCodeOp
 * operations with host function calls that carry three explicit parameters:
 *
 *   extend_to      – absolute ledger number the entry should live until
 *   min_extension  – minimum ledger delta the caller requested
 *   max_extension  – maximum ledger delta allowed (enforced clamp)
 *
 * This module parses those host function invocations from the XDR structures
 * surfaced by the Soroban RPC and returns a structured record suitable for
 * storage and display.
 */

// Host function names emitted by Protocol 26 for TTL extension
const TTL_HOST_FN_NAMES = new Set([
  "extend_contract_instance_ttl",
  "extend_contract_code_ttl",
  "extend_ttl",           // generic alias used in some SDK versions
]);

/**
 * Parse a Protocol 26 TTL extension from a host function invocation.
 *
 * The `hostFn` object is expected to have the shape produced by
 * `scValToNative()` on the InvokeHostFunctionOp args, or the raw
 * operation object from the Soroban RPC transaction envelope.
 *
 * @param {object} hostFn  Host function invocation object
 * @returns {{ extend_to: number|null, min_extension: number|null, max_extension: number|null, fn_name: string|null } | null}
 *   Returns null when the object is not a TTL extension call.
 */
export function parseTTLExtension(operation) {
  const result = {
    operationType: null,
    targetKey: null,
    extendToLedger: null,
    costXlm: null,
    timestamp: null,
  };

  if (!operation) return result;

  // ExtendCurrentContractInstanceOp
  if (operation.ext && operation.ext.v === 1) {
    result.operationType = "ExtendCurrentContractInstance";
    result.targetKey = operation.contractId || null;
    result.extendToLedger = operation.extendTo || null;
  }

  const fnName = hostFn.function_name ?? hostFn.fn_name ?? hostFn.type ?? null;

  // Also accept simplified operation shapes used in tests/other callers
  if (operation.type === "extendContractInstance") {
    result.operationType = "ExtendCurrentContractInstance";
    result.targetKey = operation.contractId || null;
    result.extendToLedger = operation.extendTo || null;
  }

  // Extract cost from transaction metadata
  if (operation.meta && operation.meta.result && operation.meta.result.costOuter) {
    const cost = operation.meta.result.costOuter;
    result.costXlm = (cost.cpuInstrs + cost.memBytes) / 1_000_000; // Simple cost estimation
  }

  // Must have at least one Protocol 26 field to be considered a valid record
  if (extend_to === null && min_extension === null && max_extension === null) return null;

  return { fn_name: fnName, extend_to, min_extension, max_extension };
}

/**
 * Extract all TTL extension records from a transaction.
 *
 * Walks `transaction.operations` and, for each InvokeHostFunctionOp,
 * attempts to parse a TTL extension.  Also handles the legacy
 * ExtendCurrentContractInstanceOp / ExtendCurrentContractCodeOp shapes
 * for backward compatibility with pre-Protocol-26 data.
 *
 * @param {object} transaction  Raw transaction object from the Soroban RPC
 * @returns {Array<{ fn_name: string, extend_to: number|null, min_extension: number|null, max_extension: number|null, ledger: number, tx_hash: string }>}
 */
export function extractTTLModifications(transaction) {
  const modifications = [];

  const results = [];

  for (const op of transaction.operations) {
    // Protocol 26: InvokeHostFunctionOp wrapping a TTL host function
    const parsed = parseTTLHostFunction(op.hostFunction ?? op.host_function ?? op);
    if (parsed) {
      results.push({
        ...parsed,
        ledger:    transaction.ledger   ?? null,
        tx_hash:   transaction.hash     ?? null,
        timestamp: transaction.timestamp ?? null,
      });
      continue;
    }

    // Legacy (pre-Protocol-26) fallback
    if (op.type === "extendContractCode" || op.type === "extendContractInstance" ||
        (op.ext?.v === 1 && (op.contractId || op.codeHash))) {
      results.push({
        fn_name:       op.type ?? "extend_ttl",
        extend_to:     _num(op.extendTo ?? op.extend_to),
        min_extension: null,
        max_extension: null,
        ledger:        transaction.ledger   ?? null,
        tx_hash:       transaction.hash     ?? null,
        timestamp:     transaction.timestamp ?? null,
      });
    }
  }

  return results;
}

/**
 * Build a human-readable label for a TTL extension record.
 * Matches the display format: "Action: TTL Extension | Requested: +X Ledgers | Enforced Clamp: Y Ledgers"
 *
 * @param {{ extend_to: number|null, min_extension: number|null, max_extension: number|null }} ext
 * @returns {string}
 */
export function calculateRentPaid(extensionOp) {
  if (!extensionOp.costXlm) return 0;
  return Math.round(extensionOp.costXlm * 10_000_000);
}

// Named ESM exports above
