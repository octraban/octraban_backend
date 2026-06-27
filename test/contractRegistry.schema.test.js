import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const schema  = require("../src/contractRegistry.schema.json");

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

function check(data) {
  const ok = validate(data);
  return { ok, errors: validate.errors ?? [] };
}

// ── Valid fixtures ────────────────────────────────────────────────────────────

const VALID_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

const MINIMAL = { contractId: VALID_CONTRACT_ID, name: "StellarSwap" };

const FULL = {
  contractId: VALID_CONTRACT_ID,
  name: "StellarSwap",
  description: "A DEX on Soroban",
  links: {
    homepage: "https://stellarswap.io",
    source:   "https://github.com/stellarswap/contracts",
    logo:     "https://stellarswap.io/logo.png",
  },
  functions: [
    {
      name: "swap",
      template: "Swapped {amt_in} {token_in} → {amt_out} {token_out} on {_contract}",
      params: [
        { name: "amt_in",    type: "u128" },
        { name: "token_in",  type: "Address" },
        { name: "amt_out",   type: "u128" },
        { name: "token_out", type: "Address" },
      ],
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("contractRegistry schema — valid inputs", () => {
  it("accepts a minimal entry (contractId + name only)", () => {
    const { ok } = check(MINIMAL);
    assert.ok(ok);
  });

  it("accepts a fully-populated entry", () => {
    const { ok } = check(FULL);
    assert.ok(ok);
  });

  it("accepts entry without optional fields", () => {
    const { ok } = check({ contractId: VALID_CONTRACT_ID, name: "X" });
    assert.ok(ok);
  });

  it("accepts functions array with no params field", () => {
    const { ok } = check({
      contractId: VALID_CONTRACT_ID,
      name: "Foo",
      functions: [{ name: "init", template: "Initialised {_contract}" }],
    });
    assert.ok(ok);
  });
});

describe("contractRegistry schema — rejects missing required fields", () => {
  it("rejects entry missing contractId", () => {
    const { ok } = check({ name: "StellarSwap" });
    assert.ok(!ok);
  });

  it("rejects entry missing name", () => {
    const { ok } = check({ contractId: VALID_CONTRACT_ID });
    assert.ok(!ok);
  });

  it("rejects completely empty object", () => {
    const { ok } = check({});
    assert.ok(!ok);
  });
});

describe("contractRegistry schema — rejects invalid field values", () => {
  it("rejects contractId that does not start with C", () => {
    const { ok } = check({ ...MINIMAL, contractId: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4" });
    assert.ok(!ok);
  });

  it("rejects contractId shorter than 56 chars", () => {
    const { ok } = check({ ...MINIMAL, contractId: "CSHORT" });
    assert.ok(!ok);
  });

  it("rejects empty name string", () => {
    const { ok } = check({ contractId: VALID_CONTRACT_ID, name: "" });
    assert.ok(!ok);
  });

  it("rejects name longer than 100 chars", () => {
    const { ok } = check({ contractId: VALID_CONTRACT_ID, name: "x".repeat(101) });
    assert.ok(!ok);
  });

  it("rejects description longer than 500 chars", () => {
    const { ok } = check({ ...MINIMAL, description: "x".repeat(501) });
    assert.ok(!ok);
  });

  it("rejects additional top-level properties", () => {
    const { ok } = check({ ...MINIMAL, unknown: "field" });
    assert.ok(!ok);
  });

  it("rejects function entry missing template", () => {
    const { ok } = check({ ...MINIMAL, functions: [{ name: "swap" }] });
    assert.ok(!ok);
  });

  it("rejects function entry missing name", () => {
    const { ok } = check({ ...MINIMAL, functions: [{ template: "Did something" }] });
    assert.ok(!ok);
  });

  it("rejects param missing type", () => {
    const { ok } = check({
      ...MINIMAL,
      functions: [{ name: "f", template: "t", params: [{ name: "x" }] }],
    });
    assert.ok(!ok);
  });
});
