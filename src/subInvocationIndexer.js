/**
 * Sub-invocation indexer.
 *
 * Soroban transactions can trigger contract-to-contract calls (sub-invocations).
 * This module walks the SorobanTransactionMeta invocation tree and flattens each
 * internal call into a separate `sub_invocations` DB record linked to the parent
 * tx_hash, making them searchable via the standard contract filter.
 */

import { db } from "./db.js";
import { publishContractLink } from "./wsEvents.js";

/**
 * Recursively walk a SorobanRpc invocation node tree and collect all
 * contract-to-contract calls at depth > 0.
 *
 * @param {object} node   - InvokeHostFunctionOp invocation node (JS object)
 * @param {string} txHash - parent transaction hash
 * @param {number} ledger - ledger sequence
 * @param {number} depth  - current recursion depth (root = 0)
 * @returns {Array} flat list of sub-invocation records
 */
function collectSubInvocations(node, txHash, ledger, depth = 0) {
  const records = [];

  const subCalls = node?.subInvocations ?? node?.sub_invocations ?? [];
  for (const child of subCalls) {
    const contractId = child?.function?.contractAddress?.toString?.() ?? child?.contractId ?? child?.contract_id ?? "";
    const fnName = child?.function?.functionName?.toString?.() ?? child?.functionName ?? child?.function_name ?? "";

    if (contractId) {
      records.push({
        parent_tx_hash: txHash,
        depth: depth + 1,
        contract_id: contractId,
        function: fnName,
        args: child?.function?.args ?? child?.args ?? null,
        ledger,
      });
    }

    // Recurse into nested sub-invocations
    records.push(...collectSubInvocations(child, txHash, ledger, depth + 1));
  }

  return records;
}

/**
 * Index sub-invocations from a raw Soroban transaction result.
 *
 * @param {string} txHash       - transaction hash
 * @param {number} ledger       - ledger sequence
 * @param {object} txMeta       - SorobanTransactionMeta or similar object with invocation tree
 */
export async function indexSubInvocations(txHash, ledger, txMeta) {
  if (!txMeta || !txHash) return;

  // The invocation tree root may live at different paths depending on SDK version
  const root = txMeta?.sorobanMeta?.invokeResult?.invocation ?? txMeta?.invocation ?? txMeta;

  const records = collectSubInvocations(root, txHash, ledger, 0);
  if (records.length) {
    await db.upsertSubInvocations(records);
    stream each new cross-contract link live
    for (const r of records) {
      publishContractLink({
        caller: txHash,
        callee: r.contract_id,
        fn: r.function,
        ledger,
      });
    }
  }
}
