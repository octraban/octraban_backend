/**
 * heuristicParser.js
 *
 * Guesses parameter types from raw ScVal-converted strings when no ABI is
 * available.  Returns an array of guess-tagged objects suitable for storage
 * and display in the frontend.
 *
 * Each item:  { index, raw, type, value, confidence }
 *   type       — "Address" | "ContractId" | "Amount" | "Hash" | "Symbol" | "Boolean" | "Unknown"
 *   confidence — "likely" | "possible"
 */

// Stellar account address: G + 55 base32 chars (total 56)
const RE_ACCOUNT = /^G[A-Z2-7]{55}$/;
// Stellar contract address: C + 55 base32 chars
const RE_CONTRACT = /^C[A-Z2-7]{55}$/;
// Transaction/WASM hash: 64 hex chars
const RE_HASH = /^[0-9a-f]{64}$/i;
// Symbol / token ticker: 1–12 uppercase letters/digits
const RE_SYMBOL = /^[A-Z][A-Z0-9]{0,11}$/;

/**
 * Guess the type of a single raw value (string, number, bigint, boolean, etc.)
 *
 * @param {*} raw  A value already converted by scValToNative / scValToJs
 * @returns {{ type: string, value: string, confidence: string }}
 */
export function guessType(raw) {
  const s = String(raw);

  if (typeof raw === "boolean") {
    return { type: "Boolean", value: s, confidence: "likely" };
  }

  if (RE_ACCOUNT.test(s)) {
    return { type: "Address", value: s, confidence: "likely" };
  }

  if (RE_CONTRACT.test(s)) {
    return { type: "ContractId", value: s, confidence: "likely" };
  }

  if (RE_HASH.test(s)) {
    return { type: "Hash", value: s, confidence: "likely" };
  }

  // Numeric: could be an amount (i128/u128 from SAC)
  if (typeof raw === "bigint" || (typeof raw === "number" && !isNaN(raw))) {
    return { type: "Amount", value: s, confidence: "possible" };
  }

  // Short all-caps strings look like token symbols
  if (RE_SYMBOL.test(s) && s.length >= 2) {
    return { type: "Symbol", value: s, confidence: "possible" };
  }

  return { type: "Unknown", value: s, confidence: "possible" };
}

/**
 * Parse an array of already-native params (topics[1..] + data) into an array
 * of guess-tagged entries.
 *
 * @param {Array} params  Values already decoded by scValToNative / scValToJs
 * @returns {Array<{ index: number, raw: string, type: string, value: string, confidence: string }>}
 */
export function parseHeuristic(params) {
  return params.map((p, i) => ({
    index: i + 1,
    raw: String(p),
    ...guessType(p),
  }));
}
