import { xdr, StrKey } from "@stellar/stellar-sdk";
import { scValToNative } from "./scval.js";

const EVENT_TYPES = { 0: "system", 1: "contract", 2: "diagnostic" };

/**
 * Resolve any strkey address string to its canonical form:
 *  - M... (muxed) → base G... account address
 *  - G... → unchanged
 *  - C... → unchanged (contract address)
 *  - anything else → unchanged
 *
 * This prevents broken navigation when users click on M... addresses in
 * contract events — the explorer routes to /wallet/:address which only
 * accepts G... keys.
 *
 * @param {string} addr
 * @returns {string}
 */
export function resolveAddress(addr) {
  if (typeof addr !== "string") return addr;
  if (addr.startsWith("M")) {
    try {
      const decoded = StrKey.decodeMuxedAccount(addr);
      return StrKey.encodeEd25519PublicKey(decoded.ed25519);
    } catch {
      // not a valid muxed address — return as-is
    }
  }
  return addr;
}

function toJson(val) {
  if (typeof val === "bigint") return val.toString();
  if (typeof val === "string") return resolveAddress(val);
  if (Array.isArray(val)) return val.map(toJson);
  if (val !== null && typeof val === "object") {
    return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, toJson(v)]));
  }
  return val;
}

/**
 * Decode a base64 XDR ContractEvent string into a structured JSON object.
 * Muxed M... addresses in topics/value are resolved to their base G... address.
 * Contract C... addresses are preserved as-is.
 *
 * @param {string} base64Xdr
 * @returns {{ contractId: string|null, type: string, topics: any[], value: any }}
 */
export function decodeContractEvent(base64Xdr) {
  const ev = xdr.ContractEvent.fromXDR(base64Xdr, "base64");
  const rawId = ev.contractId();
  const v0 = ev.body().v0();

  return {
    contractId: rawId ? StrKey.encodeContract(rawId) : null,
    type: EVENT_TYPES[ev.type().value] ?? String(ev.type().value),
    topics: toJson(v0.topics().map(scValToNative)),
    value: toJson(scValToNative(v0.data())),
  };
}
