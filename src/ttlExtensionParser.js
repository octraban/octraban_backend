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

const TTL_HOST_FN_NAMES = new Set([
  "extend_contract_instance_ttl",
  "extend_contract_code_ttl",
  "extend_ttl",
]);

function _num(value) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseTTLHostFunction(operation) {
  const op = operation?.hostFunction ?? operation?.host_function ?? operation;
  if (!op || typeof op !== "object") return null;

  const fnName = op.function_name ?? op.fn_name ?? op.type ?? null;
  if (fnName && TTL_HOST_FN_NAMES.has(fnName)) {
    const args = op.args ?? op.arguments ?? {};
    return {
      fn_name: fnName,
      extend_to: _num(args.extend_to ?? args.extendTo),
      min_extension: _num(args.min_extension ?? args.minExtension),
      max_extension: _num(args.max_extension ?? args.maxExtension),
    };
  }

  if (op.type === "extendContractInstance" || op.type === "extendContractCode" || (op.ext?.v === 1 && (op.contractId || op.codeHash))) {
    const mappedFn = op.type === "extendContractCode"
      ? "extend_contract_code_ttl"
      : "extend_contract_instance_ttl";

    return {
      fn_name: mappedFn,
      extend_to: _num(op.extendTo ?? op.extend_to),
      min_extension: _num(op.min_extension ?? op.minExtension),
      max_extension: _num(op.max_extension ?? op.maxExtension),
    };
  }

  return null;
}

export function parseTTLExtension(operation) {
  return parseTTLHostFunction(operation);
}

export function extractTTLModifications(transaction) {
  if (!transaction || !Array.isArray(transaction.operations)) return [];

  const results = [];

  for (const op of transaction.operations) {
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

    if (op.type === "extendContractCode" || op.type === "extendContractInstance" || (op.ext?.v === 1 && (op.contractId || op.codeHash))) {
      results.push({
        fn_name:       op.type === "extendContractCode" ? "extend_contract_code_ttl" : "extend_contract_instance_ttl",
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

export function formatTTLExtension(ttlExt) {
  if (!ttlExt) return null;
  const action = ttlExt.fn_name === "extend_contract_code_ttl"
    ? "Extended contract code TTL"
    : ttlExt.fn_name === "extend_contract_instance_ttl"
      ? "Extended contract instance TTL"
      : "Extended TTL";

  const parts = [action];
  if (ttlExt.extend_to !== null) parts.push(`to ledger ${ttlExt.extend_to}`);
  if (ttlExt.min_extension !== null) parts.push(`requested +${ttlExt.min_extension}`);
  if (ttlExt.max_extension !== null) parts.push(`max +${ttlExt.max_extension}`);

  return parts.join(" ");
}

export function calculateRentPaid(extensionOp) {
  if (!extensionOp || extensionOp.costXlm == null) return 0;
  return Math.round(extensionOp.costXlm * 10_000_000);
}
