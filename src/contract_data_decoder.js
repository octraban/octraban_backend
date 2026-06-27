import { xdr } from "@stellar/stellar-sdk";
import { scValToJs } from "./scval.js";

/**
 * Decode a base64-encoded ContractDataEntry XDR into a human-readable key-value pair.
 *
 * @param {string} base64Xdr - base64-encoded LedgerEntry XDR
 * @returns {{ key: *, value: * }} decoded storage key and value
 */
export function decodeContractDataEntry(base64Xdr) {
  const entry = xdr.LedgerEntry.fromXDR(base64Xdr, "base64");
  const data = entry.data().contractData();

  return {
    key: scValToJs(data.key()),
    value: scValToJs(data.val()),
  };
}

/**
 * Decode a raw ContractDataEntry XDR (not wrapped in LedgerEntry).
 *
 * @param {string} base64Xdr - base64-encoded ContractDataEntry XDR
 * @returns {{ key: *, value: * }}
 */
export function decodeContractData(base64Xdr) {
  const data = xdr.ContractDataEntry.fromXDR(base64Xdr, "base64");

  return {
    key: scValToJs(data.key()),
    value: scValToJs(data.val()),
  };
}
