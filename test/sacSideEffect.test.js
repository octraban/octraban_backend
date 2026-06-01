import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { sacSideEffectLabel } from "../src/sacSideEffect.js";

// ── sacSideEffectLabel ────────────────────────────────────────────────────────

describe("sacSideEffectLabel", () => {
  it("returns correct label for account_created", () => {
    assert.strictEqual(sacSideEffectLabel("account_created"), "SAC Auto-Created Account Entry");
  });

  it("returns correct label for trustline_opened", () => {
    assert.strictEqual(sacSideEffectLabel("trustline_opened"), "SAC Native Trustline Open");
  });

  it("returns null for null input", () => {
    assert.strictEqual(sacSideEffectLabel(null), null);
  });

  it("returns null for unknown kind", () => {
    assert.strictEqual(sacSideEffectLabel("unknown"), null);
  });
});

// ── classifySacSideEffect — mocked fetch ─────────────────────────────────────

describe("classifySacSideEffect", () => {
  let classifySacSideEffect;
  let originalFetch;

  /**
   * We mock globalThis.fetch before importing the module so the in-process
   * cache starts empty for each describe block.  Because ESM modules are
   * cached by Node we re-import with a cache-busting query string.
   */
  before(async () => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns account_created when Horizon returns 404", async () => {
    globalThis.fetch = async () => ({ status: 404, ok: false });
    // Fresh import to bypass module-level cache
    const mod = await import(`../src/sacSideEffect.js?bust=${Math.random()}`);
    classifySacSideEffect = mod.classifySacSideEffect;

    const result = await classifySacSideEffect("GNEWACCOUNT", "USDC", "GISSUER");
    assert.strictEqual(result, "account_created");
  });

  it("returns trustline_opened when account exists but has no matching trustline", async () => {
    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        balances: [
          { asset_code: "XLM", asset_type: "native" },
        ],
      }),
    });
    const mod = await import(`../src/sacSideEffect.js?bust=${Math.random()}`);
    classifySacSideEffect = mod.classifySacSideEffect;

    const result = await classifySacSideEffect("GEXISTING", "USDC", "GISSUER");
    assert.strictEqual(result, "trustline_opened");
  });

  it("returns null when account already has the trustline", async () => {
    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        balances: [
          { asset_code: "USDC", asset_issuer: "GISSUER", asset_type: "credit_alphanum4" },
        ],
      }),
    });
    const mod = await import(`../src/sacSideEffect.js?bust=${Math.random()}`);
    classifySacSideEffect = mod.classifySacSideEffect;

    const result = await classifySacSideEffect("GEXISTING", "USDC", "GISSUER");
    assert.strictEqual(result, null);
  });

  it("returns null for native XLM (no issuer)", async () => {
    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => ({ balances: [] }),
    });
    const mod = await import(`../src/sacSideEffect.js?bust=${Math.random()}`);
    classifySacSideEffect = mod.classifySacSideEffect;

    const result = await classifySacSideEffect("GEXISTING", "XLM", null);
    assert.strictEqual(result, null);
  });

  it("returns null for non-G addresses (contract addresses)", async () => {
    const mod = await import(`../src/sacSideEffect.js?bust=${Math.random()}`);
    classifySacSideEffect = mod.classifySacSideEffect;

    const result = await classifySacSideEffect("CCONTRACTADDRESS", "USDC", "GISSUER");
    assert.strictEqual(result, null);
  });

  it("returns null when fetch throws (network error)", async () => {
    globalThis.fetch = async () => { throw new Error("network error"); };
    const mod = await import(`../src/sacSideEffect.js?bust=${Math.random()}`);
    classifySacSideEffect = mod.classifySacSideEffect;

    const result = await classifySacSideEffect("GFAILADDR", "USDC", "GISSUER");
    assert.strictEqual(result, null);
  });
});
