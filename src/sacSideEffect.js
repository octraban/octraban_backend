/**
 * SAC side-effect detection.
 *
 * When the Stellar Asset Contract transfers tokens to a G-address that either:
 *   (a) does not exist on-chain yet  → "SAC Auto-Created Account Entry"
 *   (b) exists but has no trustline  → "SAC Native Trustline Open"
 *
 * We probe Horizon once per (address, assetCode) pair and cache the result for
 * the lifetime of the process so we never re-query the same address twice.
 */

const HORIZON_URL = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";

/** @type {Map<string, "account_created" | "trustline_opened" | null>} */
const _cache = new Map();

/**
 * Classify the SAC side-effect for a transfer/mint to `toAddress`.
 *
 * @param {string} toAddress   Stellar G-address of the recipient
 * @param {string} assetCode   Classic asset code, e.g. "USDC" or "XLM"
 * @param {string} [assetIssuer]  Issuer G-address (omit for native XLM)
 * @returns {Promise<"account_created" | "trustline_opened" | null>}
 *   "account_created"  — account entry did not exist (SAC created it)
 *   "trustline_opened" — account exists but had no trustline (SAC opened it)
 *   null               — no implicit side-effect detected (or lookup failed)
 */
export async function classifySacSideEffect(toAddress, assetCode, assetIssuer) {
  // Only G-addresses can have account entries / trustlines
  if (!toAddress || !toAddress.startsWith("G")) return null;

  const cacheKey = `${toAddress}:${assetCode}:${assetIssuer ?? "native"}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  let result = null;
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${toAddress}`, {
      signal: AbortSignal.timeout(4000),
    });

    if (res.status === 404) {
      // Account does not exist — SAC will auto-create it
      result = "account_created";
    } else if (res.ok) {
      const account = await res.json();
      // Native XLM: every account implicitly holds XLM, no trustline needed
      if (!assetIssuer || assetCode === "XLM") {
        result = null;
      } else {
        // Check whether the trustline for this asset already exists
        const hasTrustline = account.balances?.some(
          b => b.asset_code === assetCode && b.asset_issuer === assetIssuer
        );
        result = hasTrustline ? null : "trustline_opened";
      }
    }
  } catch {
    // Network error or timeout — skip silently
    result = null;
  }

  _cache.set(cacheKey, result);
  return result;
}

/**
 * Human-readable label for a SAC side-effect classification.
 *
 * @param {"account_created" | "trustline_opened" | null} kind
 * @returns {string | null}
 */
export function sacSideEffectLabel(kind) {
  if (kind === "account_created") return "SAC Auto-Created Account Entry";
  if (kind === "trustline_opened") return "SAC Native Trustline Open";
  return null;
}
