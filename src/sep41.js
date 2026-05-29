/**
 * SEP-41 Token Event Extractors
 *
 * Each extractor receives a decoded event object:
 *   { topics: any[], value: any }
 * where topics[0] is the event name symbol (string after scValToNative).
 *
 * Returns a structured object or null if the event doesn't match.
 */

/**
 * Extract a SEP-41 transfer event.
 * Topics: [Symbol("transfer"), from: Address, to: Address]
 * Data:   amount (i128 as BigInt)
 *
 * @param {{ topics: any[], value: any }} event
 * @returns {{ type: 'transfer', from: string, to: string, amount: string } | null}
 */
export function extractTransfer(event) {
  const { topics, value } = event;
  if (topics[0] !== "transfer") return null;
  const [, from, to] = topics;
  return {
    type: "transfer",
    from: String(from),
    to: String(to),
    amount: String(value),
  };
}

/**
 * Extract a SEP-41 mint event.
 * Topics: [Symbol("mint"), admin: Address, to: Address]
 * Data:   amount (i128 as BigInt)
 *
 * @param {{ topics: any[], value: any }} event
 * @returns {{ type: 'mint', to: string, amount: string } | null}
 */
export function extractMint(event) {
  const { topics, value } = event;
  if (topics[0] !== "mint") return null;
  const [, , to] = topics;
  return {
    type: "mint",
    to: String(to),
    amount: String(value),
  };
}

/**
 * Extract a SEP-41 burn event.
 * Topics: [Symbol("burn"), from: Address]
 * Data:   amount (i128 as BigInt)
 *
 * @param {{ topics: any[], value: any }} event
 * @returns {{ type: 'burn', from: string, amount: string } | null}
 */
export function extractBurn(event) {
  const { topics, value } = event;
  if (topics[0] !== "burn") return null;
  const [, from] = topics;
  return {
    type: "burn",
    from: String(from),
    amount: String(value),
  };
}

/**
 * Extract a SEP-41 approve event.
 * Topics: [Symbol("approve"), from: Address, spender: Address]
 * Data:   { amount: i128, expiration_ledger?: u32 }
 *
 * @param {{ topics: any[], value: any }} event
 * @returns {{ type: 'approve', owner: string, spender: string, amount: string, expiration_ledger: number | null } | null}
 */
export function extractApprove(event) {
  const { topics, value } = event;
  if (topics[0] !== "approve") return null;
  const [, from, spender] = topics;
  const amount = value?.amount !== undefined ? String(value.amount) : String(value);
  const expiration_ledger = value?.expiration_ledger ?? null;
  return {
    type: "approve",
    owner: String(from),
    spender: String(spender),
    amount,
    expiration_ledger,
  };
}

/**
 * Try all SEP-41 extractors in order and return the first match, or null.
 *
 * @param {{ topics: any[], value: any }} event
 * @returns {object | null}
 */
export function extractSep41Event(event) {
  return (
    extractTransfer(event) ??
    extractMint(event) ??
    extractBurn(event) ??
    extractApprove(event) ??
    null
  );
}
