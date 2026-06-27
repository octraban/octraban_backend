/**
 * hostErrorDecoder.js
 *
 * Maps Soroban host error codes to human-readable descriptions
 */

const HOST_ERROR_MESSAGES = {
  // HostStorageError (0-7)
  0: "Host Storage: Read Failure",
  1: "Host Storage: Write Failure",
  2: "Host Storage: Key Not Found",
  3: "Host Storage: Access Denied",

  // HostContextError (8-15)
  8: "Host Context: Invalid Context",
  9: "Host Context: Memory Exhausted",
  10: "Host Context: CPU Limit Exhausted",
  11: "Host Context: Stack Overflow",

  // HostAuthError (16-23)
  16: "Host Auth: Failed Authorization",
  17: "Host Auth: Invalid Signature",
  18: "Host Auth: Missing Authorization",

  // HostWasmError (24-31)
  24: "Host WASM: Invalid Module",
  25: "Host WASM: Execution Trap",
  26: "Host WASM: Out of Memory",
  27: "Host WASM: Invalid Opcode",

  // HostVecError (32-39)
  32: "Host Vector: Index Out of Bounds",
  33: "Host Vector: Element Type Mismatch",

  // HostObjError (40-47)
  40: "Host Object: Field Not Found",
  41: "Host Object: Type Mismatch",
  42: "Host Object: Serialization Failed",

  // HostInvokeError (48-55)
  48: "Host Invoke: Invalid Contract",
  49: "Host Invoke: Function Not Found",
  50: "Host Invoke: Invalid Arguments",
  51: "Host Invoke: Contract Execution Failed",
};

/**
 * Decode a host error code or ScStatus error to human description
 * @param {number|string|object} error - Error code, status code, or status object
 * @returns {string} Human-readable error description
 */
export function decodeHostError(error) {
  if (!error) return "Unknown Error";

  let errorCode = error;

  // Handle object with code/status
  if (typeof error === "object") {
    errorCode = error.code || error.status || 0;
  }

  // Handle string codes
  if (typeof errorCode === "string") {
    errorCode = parseInt(errorCode, 10);
  }

  const message = HOST_ERROR_MESSAGES[errorCode];
  return message || `Unknown Error (Code: ${errorCode})`;
}

/**
 * Format error alert block
 * @param {number|string|object} error - Error code or object
 * @returns {string} Formatted alert message
 */
export function formatErrorAlert(error) {
  const description = decodeHostError(error);
  return `Execution Stopped: ${description}`;
}
