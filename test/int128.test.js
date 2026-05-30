import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr } from "@stellar/stellar-sdk";
import { parseI128, parseU128, int128PartsToBI } from "../src/int128.js";

const MAX_U64 = 0xffffffffffffffffn;
const MAX_U128 = (MAX_U64 << 64n) | MAX_U64;

function makeU128(hi, lo) {
  return xdr.ScVal.scvU128(
    new xdr.UInt128Parts({
      hi: xdr.Uint64.fromString(hi.toString()),
      lo: xdr.Uint64.fromString(lo.toString()),
    })
  );
}

function makeI128(hi, lo) {
  return xdr.ScVal.scvI128(
    new xdr.Int128Parts({
      hi: xdr.Int64.fromString(hi.toString()),
      lo: xdr.Uint64.fromString(lo.toString()),
    })
  );
}

describe("parseU128", () => {
  it("parses zero", () => {
    assert.equal(parseU128(makeU128(0n, 0n)), 0n);
  });

  it("parses a small value", () => {
    assert.equal(parseU128(makeU128(0n, 999999999999n)), 999999999999n);
  });

  it("parses max u128 without precision loss", () => {
    assert.equal(parseU128(makeU128(MAX_U64, MAX_U64)), MAX_U128);
  });

  it("parses a value with non-zero hi", () => {
    const expected = (1n << 64n) | 1n;
    assert.equal(parseU128(makeU128(1n, 1n)), expected);
  });
});

describe("parseI128", () => {
  it("parses zero", () => {
    assert.equal(parseI128(makeI128(0n, 0n)), 0n);
  });

  it("parses a positive value", () => {
    assert.equal(parseI128(makeI128(0n, 42n)), 42n);
  });

  it("parses max i128 positive value", () => {
    // max i128 = 2^127 - 1 = hi=0x7fffffffffffffff, lo=0xffffffffffffffff
    const hi = 0x7fffffffffffffffn;
    const lo = MAX_U64;
    const expected = (hi << 64n) | lo;
    assert.equal(parseI128(makeI128(hi, lo)), expected);
  });
});

describe("int128PartsToBI", () => {
  it("handles unsigned parts", () => {
    const parts = { hi: () => ({ toString: () => "1" }), lo: () => ({ toString: () => "0" }) };
    assert.equal(int128PartsToBI(parts), 1n << 64n);
  });

  it("handles signed negative hi", () => {
    // hi = -1 (0xffffffffffffffff as unsigned = 18446744073709551615)
    const parts = {
      hi: () => ({ toString: () => "18446744073709551615" }),
      lo: () => ({ toString: () => "0" }),
    };
    // signed: hi = -1, result = -1 << 64 = -18446744073709551616
    assert.equal(int128PartsToBI(parts, true), -18446744073709551616n);
  });
});
