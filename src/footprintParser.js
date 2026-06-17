import { xdr, StrKey, scValToNative } from "@stellar/stellar-sdk";

/**
 * Classify a single LedgerKey into a structured descriptor.
 *
 * @param {xdr.LedgerKey} key
 * @returns {{ type: string, contractId?: string, wasmHash?: string, dataKey?: string, durability?: string }}
 */
function classifyKey(key) {
  const kind = key.switch().name;

  switch (kind) {
    case "contractData": {
      const cd = key.contractData();
      const dataKeyVal = cd.key();
      const isInstance = dataKeyVal.switch().name === "scvLedgerKeyContractInstance";
      const contractId = StrKey.encodeContract(cd.contract().contractId());
      const durability = cd.durability().name === "persistent" ? "persistent" : "temporary";
      if (isInstance) {
        return { type: "contractInstance", contractId, durability };
      }
      let dataKey;
      try {
        dataKey = String(scValToNative(dataKeyVal));
      } catch {
        dataKey = dataKeyVal.switch().name;
      }
      return { type: "contractData", contractId, dataKey, durability };
    }

    case "contractCode": {
      const wasmHash = Buffer.from(key.contractCode().hash()).toString("hex");
      return { type: "contractCode", wasmHash };
    }

    case "account":
      return {
        type: "account",
        accountId: StrKey.encodeEd25519PublicKey(key.account().accountId().ed25519()),
      };

    case "trustline": {
      const tl = key.trustLine();
      return {
        type: "trustline",
        accountId: StrKey.encodeEd25519PublicKey(tl.accountId().ed25519()),
      };
    }

    default:
      return { type: kind };
  }
}

/**
 * Parse a base64-encoded LedgerFootprint XDR string and return a structured
 * summary of which ledger entries were read or written.
 *
 * @param {string} footprintXdr  Base64 LedgerFootprint XDR
 * @returns {{
 *   reads:  { count: number, keys: object[] },
 *   writes: { count: number, keys: object[] },
 * }}
 */
export function parseFootprint(footprintXdr) {
  const fp = xdr.LedgerFootprint.fromXDR(footprintXdr, "base64");
  const reads = fp.readOnly().map(classifyKey);
  const writes = fp.readWrite().map(classifyKey);
  return {
    reads: { count: reads.length, keys: reads },
    writes: { count: writes.length, keys: writes },
  };
}
