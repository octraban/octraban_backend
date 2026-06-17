import { xdr } from "@stellar/stellar-sdk";

/**
 * Extract WASM bytecode or WASM hash from a HostFunctionTypeCreateContract invocation.
 *
 * @param {string} base64Xdr - base64-encoded HostFunction XDR
 * @returns {{ type: "wasmBytes", value: number[] } | { type: "wasmHash", value: string }}
 * @throws {Error} if the host function is not a CreateContract operation
 */
export function extractWasm(base64Xdr) {
  const hf = xdr.HostFunction.fromXDR(base64Xdr, "base64");

  if (hf.switch().name !== "hostFunctionTypeCreateContract") {
    throw new Error(`Expected hostFunctionTypeCreateContract, got ${hf.switch().name}`);
  }

  const executable = hf.createContract().executable();
  const execType = executable.switch().name;

  if (execType === "contractExecutableWasm") {
    // Direct WASM deployment — return raw bytes as array
    return { type: "wasmBytes", value: Array.from(executable.wasmHash()) };
  }

  if (execType === "contractExecutableStellarAsset") {
    // Stellar asset contract — no WASM hash available
    return { type: "stellarAsset", value: null };
  }

  throw new Error(`Unknown executable type: ${execType}`);
}

/**
 * Extract WASM hash from an UploadContractWasm host function.
 * Returns the hex-encoded hash of the uploaded WASM.
 *
 * @param {string} base64Xdr - base64-encoded HostFunction XDR
 * @returns {{ type: "wasmHash", value: string }}
 */
export function extractWasmHash(base64Xdr) {
  const hf = xdr.HostFunction.fromXDR(base64Xdr, "base64");

  if (hf.switch().name !== "hostFunctionTypeUploadContractWasm") {
    throw new Error(`Expected hostFunctionTypeUploadContractWasm, got ${hf.switch().name}`);
  }

  const bytes = hf.wasm();
  return { type: "wasmHash", value: Buffer.from(bytes).toString("hex") };
}
