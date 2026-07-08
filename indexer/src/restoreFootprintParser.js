import { xdr, StrKey, scValToNative } from "@stellar/stellar-sdk";

/**
 * Classify a single LedgerKey into a human-readable descriptor.
 * Mirrors footprintParser.js but adds a `label` field for display.
 *
 * @param {xdr.LedgerKey} key
 * @returns {{ type: string, label: string, contractId?: string, wasmHash?: string, dataKey?: string, durability?: string }}
 */
function classifyRestoredKey(key) {
  const kind = key.switch().name;

  switch (kind) {
    case "contractData": {
      const cd = key.contractData();
      const contractId = StrKey.encodeContract(cd.contract().contractId());
      const durability = cd.durability().name === "persistent" ? "persistent" : "temporary";
      const keyVal = cd.key();
      const isInstance = keyVal.switch().name === "scvLedgerKeyContractInstance";
      if (isInstance) {
        return {
          type: "contractInstance",
          label: `Contract instance (${contractId.slice(0, 8)}…)`,
          contractId,
          durability,
        };
      }
      let dataKey;
      try {
        dataKey = String(scValToNative(keyVal));
      } catch {
        dataKey = keyVal.switch().name;
      }
      return {
        type: "contractData",
        label: `Contract data key "${dataKey}" (${contractId.slice(0, 8)}…)`,
        contractId,
        dataKey,
        durability,
      };
    }

    case "contractCode": {
      const wasmHash = Buffer.from(key.contractCode().hash()).toString("hex");
      return {
        type: "contractCode",
        label: `Contract WASM code (${wasmHash.slice(0, 12)}…)`,
        wasmHash,
      };
    }

    case "account": {
      const accountId = StrKey.encodeEd25519PublicKey(key.account().accountId().ed25519());
      return {
        type: "account",
        label: `Account ${accountId.slice(0, 8)}…`,
        accountId,
      };
    }

    case "trustline": {
      const accountId = StrKey.encodeEd25519PublicKey(key.trustLine().accountId().ed25519());
      return {
        type: "trustline",
        label: `Trustline for ${accountId.slice(0, 8)}…`,
        accountId,
      };
    }

    default:
      return { type: kind, label: kind };
  }
}

/**
 * Parse a TransactionEnvelope XDR for RestoreFootprintOp operations and
 * return the set of ledger keys that were restored from archived state.
 *
 * @param {string} txEnvelopeXdr  base64-encoded TransactionEnvelope XDR
 * @returns {{
 *   isRestoreOp: boolean,
 *   revivedKeys: Array<{ type: string, label: string, contractId?: string, wasmHash?: string, dataKey?: string }>,
 *   keyCount: number,
 *   feePaid: number | null,
 * }}
 */
export function parseRestoreFootprintOp(txEnvelopeXdr) {
  const env = xdr.TransactionEnvelope.fromXDR(txEnvelopeXdr, "base64");

  let ops;
  try {
    ops = env.v1?.().tx().operations() ?? env.tx?.().operations() ?? [];
  } catch {
    ops = [];
  }

  const revivedKeys = [];

  for (const op of ops) {
    try {
      const body = op.body();
      if (body.switch().name !== "restoreFootprint") continue;

      const restore = body.restoreFootprint();
      const footprint = restore.ext?.().v1?.().footprint?.() ?? restore.footprint?.();
      if (!footprint) continue;

      // readWrite keys are the ones being restored
      for (const key of footprint.readWrite()) {
        revivedKeys.push(classifyRestoredKey(key));
      }
      // readOnly keys may also be included in the footprint
      for (const key of footprint.readOnly()) {
        revivedKeys.push(classifyRestoredKey(key));
      }
    } catch {
      /* skip non-restore ops */
    }
  }

  return {
    isRestoreOp: revivedKeys.length > 0,
    revivedKeys,
    keyCount: revivedKeys.length,
    feePaid: null, // fee extracted separately from txMeta
  };
}

/**
 * Extract the fee paid for a RestoreFootprintOp from transaction metadata.
 *
 * @param {object} txMeta  raw txMeta from Soroban RPC
 * @returns {number | null}
 */
export function extractRestoreFee(txMeta) {
  try {
    const sorobanMeta = txMeta?.v3?.().sorobanMeta?.();
    if (!sorobanMeta) return null;
    const extV1 = sorobanMeta.ext?.().v1?.();
    if (!extV1) return null;
    const rentFee = extV1.rentFeeCharged?.();
    return rentFee != null ? Number(rentFee) : null;
  } catch {
    return null;
  }
}

/**
 * Full parse of a RestoreFootprintOp: combines XDR parsing with fee extraction.
 *
 * @param {string} txEnvelopeXdr  base64-encoded TransactionEnvelope XDR
 * @param {object} [txMeta]       optional txMeta for fee extraction
 * @returns {{
 *   isRestoreOp: boolean,
 *   revivedKeys: object[],
 *   keyCount: number,
 *   feePaid: number | null,
 * }}
 */
export function parseAndDescribeRestore(txEnvelopeXdr, txMeta = null) {
  const result = parseRestoreFootprintOp(txEnvelopeXdr);
  if (txMeta) {
    result.feePaid = extractRestoreFee(txMeta);
  }
  return result;
}
