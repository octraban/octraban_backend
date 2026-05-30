import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate } from "../src/templateRenderer.js";

const SWAP_PARAMS = [
  { name: "amt_in",    type: "u128" },
  { name: "token_in",  type: "Address" },
  { name: "amt_out",   type: "u128" },
  { name: "token_out", type: "Address" },
];

describe("renderTemplate", () => {
  it("substitutes all named params", () => {
    const result = renderTemplate(
      "Swapped {amt_in} {token_in} → {amt_out} {token_out} on {_contract}",
      SWAP_PARAMS,
      [100, "USDC", 98, "XLM"],
      { contractName: "StellarSwap" }
    );
    assert.equal(result, "Swapped 100 USDC → 98 XLM on StellarSwap");
  });

  it("shortens Stellar addresses", () => {
    const addr = "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFG"; // 56 chars
    const result = renderTemplate(
      "Transfer from {from}",
      [{ name: "from", type: "Address" }],
      [addr]
    );
    assert.equal(result, `Transfer from GABC12…DEFG`);
  });

  it("leaves unknown tokens unchanged", () => {
    const result = renderTemplate(
      "Hello {unknown} world",
      [],
      []
    );
    assert.equal(result, "Hello {unknown} world");
  });

  it("handles missing trailing args gracefully", () => {
    const result = renderTemplate(
      "{a} and {b}",
      [{ name: "a", type: "u128" }, { name: "b", type: "u128" }],
      [42]   // b is missing
    );
    assert.equal(result, "42 and {b}");
  });

  it("substitutes {_fn} context token", () => {
    const result = renderTemplate(
      "{_fn} called on {_contract}",
      [],
      [],
      { fnName: "mint", contractName: "TokenX" }
    );
    assert.equal(result, "mint called on TokenX");
  });

  it("works with empty params and args", () => {
    const result = renderTemplate("Static string", [], []);
    assert.equal(result, "Static string");
  });

  it("formats transfer template correctly", () => {
    const result = renderTemplate(
      "Address {from} transferred {amount} {token} to {to} on {_contract}",
      [
        { name: "from",   type: "Address" },
        { name: "to",     type: "Address" },
        { name: "amount", type: "u128" },
        { name: "token",  type: "String" },
      ],
      ["GABC…", "GXYZ…", 500, "USDC"],
      { contractName: "MyDEX" }
    );
    assert.equal(result, "Address GABC… transferred 500 USDC to GXYZ… on MyDEX");
  });
});
