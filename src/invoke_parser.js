import { xdr, StrKey } from "@stellar/stellar-sdk";
import { scValToJs } from "./scval.js";

/**
 * Parse a HostFunctionTypeInvokeContract host function into its components.
 *
 * @param {string} base64Xdr - base64-encoded HostFunction XDR
 * @returns {{ contractId: string, functionName: string, args: Array }}
 * @throws {Error} if the host function is not an InvokeContract operation
 */
export function parseInvokeContract(base64Xdr) {
  const hf = xdr.HostFunction.fromXDR(base64Xdr, "base64");

  if (hf.switch().name !== "hostFunctionTypeInvokeContract") {
    throw new Error(`Expected hostFunctionTypeInvokeContract, got ${hf.switch().name}`);
  }

  const invoke = hf.invokeContract();
  const contractId = StrKey.encodeContract(invoke.contractAddress().contractId());
  const functionName = invoke.functionName().toString();
  const args = invoke.args().map(scValToJs);

  return { contractId, functionName, args };
}
