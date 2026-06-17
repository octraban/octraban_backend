/**
 * Format a raw token amount (BigInt, string, or number) into a human-readable
 * decimal string using integer arithmetic — no IEEE 754 rounding.
 *
 * Examples:
 *   formatAmount(15000000, 7)  → "1.5"
 *   formatAmount(1000300, 6)   → "1.0003"
 *   formatAmount(1000000, 6)   → "1"
 *   formatAmount(-500000, 6)   → "-0.5"
 *
 * @param {bigint|string|number} raw      Raw amount in the token's smallest unit
 * @param {number}               decimals Decimal places defined by the token (default 7)
 * @returns {string} Decimal string with trailing fractional zeros stripped
 */
export function formatAmount(raw, decimals = 7) {
  // Normalise: strip any decimal point that SQL NUMERIC may produce
  const rawBig = BigInt(String(raw).split(".")[0]);
  const divisor = 10n ** BigInt(decimals);

  const neg = rawBig < 0n;
  const abs = neg ? -rawBig : rawBig;

  const whole = abs / divisor;
  const frac = abs % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");

  const magnitude = fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
  return neg ? `-${magnitude}` : magnitude;
}
