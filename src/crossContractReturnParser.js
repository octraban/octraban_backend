/**
 * crossContractReturnParser.js
 *
 * Parses return values from cross-contract invocations
 */

import { scValToJs } from "./scval.js";

/**
 * Extract return data from a contract invocation result
 * @param {object} result - Invocation result object
 * @returns {object} { returnValue, encoded: boolean }
 */
export function parseContractReturnValue(result) {
  if (!result) return null;

  // Heuristic: some host functions (checked i256/u256 ops) return `Void`
  // and surface overflow as diagnostic text in surrounding result fields.
  const textCandidates = [];
  try {
    if (typeof result.error === 'string') textCandidates.push(result.error);
    if (typeof result.err === 'string') textCandidates.push(result.err);
    if (typeof result.message === 'string') textCandidates.push(result.message);
    if (result.result && typeof result.result.error === 'string') textCandidates.push(result.result.error);
    if (result.diagnostic && typeof result.diagnostic === 'string') textCandidates.push(result.diagnostic);
  } catch { /* ignore */ }

  if (textCandidates.some(t => /overflow/i.test(t))) {
    return { returnValue: 'Overflow [Void]', encoded: false };
  }

  const returnVal = result.returnValue || result.result;
  if (!returnVal) return null;

  return {
    returnValue: scValToJs(returnVal),
    encoded: true,
  };
}

/**
 * Link return values to parent invocations in execution tree
 * @param {Array} invocations - Array of invocation objects with results
 * @returns {Array} Invocations with linked return data
 */
export function linkCrossContractReturns(invocations) {
  if (!Array.isArray(invocations)) return invocations;

  return invocations.map((inv, idx) => {
    const returnData = parseContractReturnValue(inv.result);

    return {
      ...inv,
      returnData,
      parentIndex: inv.parentIndex ?? null,
      childIndices: invocations
        .map((_, i) => (invocations[i].parentIndex === idx ? i : null))
        .filter((i) => i !== null),
    };
  });
}

/**
 * Build visualization tree mapping returns to callers
 * @param {Array} invocations - Linked invocations from linkCrossContractReturns
 * @returns {object} Tree structure with returns mapped to execution layers
 */
export function buildReturnTree(invocations) {
  if (!invocations || invocations.length === 0) return {};

  const tree = {};

  for (let i = 0; i < invocations.length; i++) {
    const inv = invocations[i];
    const parentIdx = inv.parentIndex !== null ? inv.parentIndex : "root";

    if (!tree[parentIdx]) tree[parentIdx] = [];

    tree[parentIdx].push({
      index: i,
      contract: inv.contract,
      function: inv.functionName,
      returnValue: inv.returnData?.returnValue,
      children: inv.childIndices || [],
    });
  }

  return tree;
}
