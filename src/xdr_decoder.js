import { xdr, StrKey, scValToNative } from "@stellar/stellar-sdk";

const EVENT_TYPES = { 0: "system", 1: "contract", 2: "diagnostic" };

function toJson(val) {
  if (typeof val === "bigint") return val.toString();
  if (Array.isArray(val)) return val.map(toJson);
  if (val !== null && typeof val === "object") {
    return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, toJson(v)]));
  }
  return val;
}

/**
 * Decode a base64 XDR ContractEvent string into a structured JSON object.
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
