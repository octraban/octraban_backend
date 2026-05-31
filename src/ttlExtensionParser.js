/**
 * TTL Extension and StateRent Parser
 * Issue #63: Parse and Label StateRent & TTL Modifications
 * Parses ExtendCurrentContractInstanceOp and ExtendCurrentContractCodeOp operations
 */

/**
 * Parse TTL extension operation from XDR
 * @param {Object} operation - The operation object
 * @returns {Object} Parsed TTL extension details
 */
function parseTTLExtension(operation) {
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

  // ExtendCurrentContractCodeOp
  if (operation.type === "extendContractCode") {
    result.operationType = "ExtendCurrentContractCode";
    result.targetKey = operation.codeHash || null;
    result.extendToLedger = operation.extendTo || null;
  }

  // Extract cost from transaction metadata
  if (operation.meta && operation.meta.result && operation.meta.result.costOuter) {
    const cost = operation.meta.result.costOuter;
    result.costXlm = (cost.cpuInstrs + cost.memBytes) / 1_000_000; // Simple cost estimation
  }

  return result;
}

/**
 * Extract all TTL modifications from a transaction
 * @param {Object} transaction - The transaction object
 * @returns {Array} Array of TTL modification details
 */
function extractTTLModifications(transaction) {
  const modifications = [];

  if (!transaction || !transaction.operations) {
    return modifications;
  }

  for (const op of transaction.operations) {
    if (
      (op.type && op.type.includes("extend")) ||
      (op.body && op.body.extendOp)
    ) {
      const parsed = parseTTLExtension(op);
      if (parsed.operationType) {
        modifications.push({
          ...parsed,
          ledger: transaction.ledger,
          hash: transaction.hash,
          timestamp: transaction.timestamp,
        });
      }
    }
  }

  return modifications;
}

/**
 * Calculate rent paid in a TTL extension
 * @param {Object} extensionOp - The parsed extension operation
 * @returns {number} Rent paid in stroops (1 XLM = 10M stroops)
 */
function calculateRentPaid(extensionOp) {
  if (!extensionOp.costXlm) return 0;
  return Math.round(extensionOp.costXlm * 10_000_000);
}

module.exports = {
  parseTTLExtension,
  extractTTLModifications,
  calculateRentPaid,
};
