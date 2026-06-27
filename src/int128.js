/**
 * Parse a Soroban i128 ScVal into a native BigInt without precision loss.
 *
 * @param {xdr.ScVal} scVal
 * @returns {bigint}
 */
export function parseI128(scVal) {
  const parts = scVal.i128();
  const hi = BigInt(parts.hi().toString()); // signed high 64 bits
  const lo = BigInt(parts.lo().toString()); // unsigned low 64 bits
  // Reconstruct: hi is signed, so shift left 64 and OR with unsigned lo
  return (hi << 64n) | lo;
}

/**
 * Parse a Soroban u128 ScVal into a native BigInt without precision loss.
 *
 * @param {xdr.ScVal} scVal
 * @returns {bigint}
 */
export function parseU128(scVal) {
  const parts = scVal.u128();
  const hi = BigInt(parts.hi().toString());
  const lo = BigInt(parts.lo().toString());
  return (hi << 64n) | lo;
}

/**
 * Parse a raw Int128Parts / Uint128Parts XDR object (hi + lo) into a BigInt.
 * Accepts either an xdr.Int128Parts or xdr.Uint128Parts instance.
 *
 * @param {{ hi: () => { toString(): string }, lo: () => { toString(): string } }} parts
 * @param {boolean} [signed=false] - treat hi as a signed 64-bit integer
 * @returns {bigint}
 */
export function int128PartsToBI(parts, signed = false) {
  let hi = BigInt(parts.hi().toString());
  const lo = BigInt(parts.lo().toString());

  if (signed) {
    // If the high bit of hi is set, it's negative — apply two's complement
    if (hi >= 0x8000000000000000n) {
      hi -= 0x10000000000000000n;
    }
  }

  return (hi << 64n) | lo;
}
