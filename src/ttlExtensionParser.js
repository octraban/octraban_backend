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
function parseTTLHostFunction(hostFn) {
  if (!hostFn) return null;

  const fnName = hostFn.function_name ?? hostFn.fn_name ?? hostFn.type ?? null;

  // Accept both the canonical names and the legacy operation type strings
  const isExtend =
    (fnName && TTL_HOST_FN_NAMES.has(fnName)) ||
    (typeof fnName === "string" && fnName.toLowerCase().includes("extend"));

  if (!isExtend) return null;

  // Protocol 26 parameters may appear as direct fields or inside an `args` map
  const args = hostFn.args ?? hostFn;

  const extend_to     = _num(args.extend_to     ?? args.extendTo     ?? hostFn.extend_to     ?? hostFn.extendTo);
  const min_extension = _num(args.min_extension ?? args.minExtension ?? hostFn.min_extension ?? hostFn.minExtension);
  const max_extension = _num(args.max_extension ?? args.maxExtension ?? hostFn.max_extension ?? hostFn.maxExtension);

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
function extractTTLExtensions(transaction) {
  if (!transaction?.operations) return [];

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
function formatTTLExtension(ext) {
  const parts = ["Action: TTL Extension"];
  if (ext.min_extension != null) parts.push(`Requested: +${ext.min_extension} Ledgers`);
  if (ext.max_extension != null) parts.push(`Enforced Clamp: ${ext.max_extension} Ledgers`);
  if (ext.extend_to     != null) parts.push(`Extend To: ${ext.extend_to}`);
  return parts.join(" | ");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function _num(v) {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

module.exports = { parseTTLHostFunction, extractTTLExtensions, formatTTLExtension };
