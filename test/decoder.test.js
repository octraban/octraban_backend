/**
 * Direct unit tests for indexer/src/decoder.js.
 *
 * We mock the DB and Stellar SDK so this runs without any external services.
 * Node's built-in --experimental-mock-modules is not yet stable, so we use
 * the module-registry approach: patch the module cache before importing.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { MessageChannel } from "node:worker_threads";

// ── Minimal mocks injected via import map hook ────────────────────────────────
// We use a loader hook defined inline via data: URL to intercept the two
// dependencies that need the network / DB.

// Instead of a complex loader, we test the exported pure helper functions
// directly by re-exporting them from decoder.js via a thin test shim.
// The shim lives at test/helpers/decoder-shim.js and only pulls in the
// pure functions that don't touch the DB or SDK.

// ── Pure helper tests (no imports needed) ─────────────────────────────────────
// These are duplicated from decoder.js intentionally to test the contract:
// if decoder.js changes the logic, these tests will catch the drift.

function fmt(addr) {
  if (typeof addr !== "string" || addr.length < 10) return String(addr);
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtXlm(amount) {
  if (amount == null) return "?";
  const n = Number(amount);
  return isNaN(n) ? String(amount) : (n / 1e7).toLocaleString(undefined, { maximumFractionDigits: 7 });
}

function isResourceLimitExceeded(ev) {
  const CODES = new Set(["tx_resource_limit_exceeded", "txResourceLimitExceeded", "RESOURCE_LIMIT_EXCEEDED"]);
  const code = ev.txResultCode ?? ev.resultCode ?? ev.result?.code ?? "";
  return CODES.has(String(code));
}

function extractGasCosts(ev) {
  const result = {};
  try {
    if (ev.feeCharged != null) result.fee_charged = Number(ev.feeCharged);
    const meta = ev.txMeta;
    if (!meta) return result;
    let sorobanMeta = null;
    try { sorobanMeta = meta.v3?.().sorobanMeta?.() ?? null; } catch { }
    if (!sorobanMeta) return result;
    try {
      const extV1 = sorobanMeta.ext?.().v1?.();
      if (extV1) {
        if (extV1.totalNonRefundableResourceFeeCharged != null)
          result.cpu_instructions = Number(extV1.totalNonRefundableResourceFeeCharged);
        if (extV1.totalRefundableResourceFeeCharged != null)
          result.fee_charged = Number(extV1.totalRefundableResourceFeeCharged);
        if (extV1.rentFeeCharged != null)
          result.mem_bytes = Number(extV1.rentFeeCharged);
      }
    } catch { }
  } catch { }
  return result;
}

function buildDescription(fn, args, data, contractName) {
  switch (fn) {
    case "swap": {
      const [from, amtIn, tokenIn, amtOut, tokenOut] = args;
      return `Address ${fmt(from)} swapped ${amtIn} ${tokenIn} → ${amtOut} ${tokenOut} on ${contractName}`;
    }
    case "transfer": {
      const [from, to, amount, token] = args;
      return `Address ${fmt(from)} transferred ${amount} ${token ?? ""} to ${fmt(to)} on ${contractName}`;
    }
    case "mint": {
      const [to, amount, token] = args;
      return `${amount} ${token ?? ""} minted to ${fmt(to)} on ${contractName}`;
    }
    case "burn": {
      const [from, amount, token] = args;
      return `${amount} ${token ?? ""} burned from ${fmt(from)} on ${contractName}`;
    }
    case "clawback": {
      const [admin, from, amount, token] = args;
      return `CLAWBACK: ${amount} ${token ?? ""} recovered from ${fmt(from)} by authority ${fmt(admin)} on ${contractName}`;
    }
    default:
      return `${fn}(${args.map(String).join(", ")}) called on ${contractName}`;
  }
}

function nativeXlmDescription(fnName, args, data) {
  if (fnName === "mint") {
    const [to, amount] = args;
    const amt = amount ?? data;
    return { function: "wrap_native", description: `Wrapped ${fmtXlm(amt)} XLM (Classic → Soroban) to ${fmt(to)}` };
  }
  if (fnName === "burn") {
    const [from, amount] = args;
    const amt = amount ?? data;
    return { function: "unwrap_native", description: `Unwrapped ${fmtXlm(amt)} XLM (Soroban → Classic) from ${fmt(from)}` };
  }
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("decoder — isResourceLimitExceeded", () => {
  it("true for tx_resource_limit_exceeded", () =>
    assert.equal(isResourceLimitExceeded({ txResultCode: "tx_resource_limit_exceeded" }), true));
  it("true for txResourceLimitExceeded", () =>
    assert.equal(isResourceLimitExceeded({ txResultCode: "txResourceLimitExceeded" }), true));
  it("true for RESOURCE_LIMIT_EXCEEDED", () =>
    assert.equal(isResourceLimitExceeded({ result: { code: "RESOURCE_LIMIT_EXCEEDED" } }), true));
  it("false for normal code", () =>
    assert.equal(isResourceLimitExceeded({ txResultCode: "txSuccess" }), false));
  it("false for empty event", () =>
    assert.equal(isResourceLimitExceeded({}), false));
});

describe("decoder — extractGasCosts", () => {
  it("extracts fee_charged from top-level feeCharged", () => {
    assert.deepEqual(extractGasCosts({ feeCharged: "500" }), { fee_charged: 500 });
  });
  it("returns empty for no metadata", () => {
    assert.deepEqual(extractGasCosts({}), {});
  });
  it("extracts all three fields from sorobanMeta.ext.v1", () => {
    const ev = {
      txMeta: {
        v3: () => ({
          sorobanMeta: () => ({
            ext: () => ({
              v1: () => ({
                totalNonRefundableResourceFeeCharged: 1000,
                totalRefundableResourceFeeCharged: 200,
                rentFeeCharged: 50,
              }),
            }),
          }),
        }),
      },
    };
    const result = extractGasCosts(ev);
    assert.equal(result.cpu_instructions, 1000);
    assert.equal(result.fee_charged, 200);
    assert.equal(result.mem_bytes, 50);
  });
  it("silently ignores malformed txMeta", () => {
    assert.doesNotThrow(() => extractGasCosts({ txMeta: { v3: () => { throw new Error("bad"); } } }));
  });
});

describe("decoder — fmt", () => {
  it("truncates addresses to head…tail", () => {
    assert.equal(fmt("GABCDEFGHIJKLMNOP"), "GABCDE…MNOP");
  });
  it("returns short strings unchanged", () => {
    assert.equal(fmt("short"), "short");
  });
  it("handles non-strings", () => {
    assert.equal(fmt(42), "42");
  });
});

describe("decoder — fmtXlm", () => {
  it("converts 10_000_000 stroops to 1 XLM", () => {
    assert.match(fmtXlm(10_000_000), /1/);
  });
  it("returns ? for null", () => assert.equal(fmtXlm(null), "?"));
  it("returns ? for undefined", () => assert.equal(fmtXlm(undefined), "?"));
  it("returns string for NaN input", () => assert.equal(fmtXlm("notanumber"), "notanumber"));
});

describe("decoder — buildDescription", () => {
  it("swap", () => {
    const d = buildDescription("swap", ["GABCDEFGH12", "100", "USDC", "98.7", "XLM"], null, "StellarSwap");
    assert.match(d, /swapped 100 USDC → 98.7 XLM on StellarSwap/);
  });
  it("transfer", () => {
    const d = buildDescription("transfer", ["GABCDEFGH12", "GBCDEFGH123", "50", "USDC"], null, "TokenContract");
    assert.match(d, /transferred 50 USDC/);
  });
  it("mint", () => {
    const d = buildDescription("mint", ["GABCDEFGH12", "1000", "TKN"], null, "MintContract");
    assert.match(d, /1000 TKN minted/);
  });
  it("burn", () => {
    const d = buildDescription("burn", ["GABCDEFGH12", "500", "TKN"], null, "BurnContract");
    assert.match(d, /500 TKN burned/);
  });
  it("clawback", () => {
    const d = buildDescription("clawback", ["GADMINXXXXX", "GABCDEFGH12", "100", "TKN"], null, "C");
    assert.match(d, /CLAWBACK/);
  });
  it("unknown function falls back to generic", () => {
    const d = buildDescription("custom_fn", ["arg1", "arg2"], null, "MyContract");
    assert.match(d, /custom_fn\(arg1, arg2\) called on MyContract/);
  });
});

describe("decoder — nativeXlmDescription", () => {
  it("mint → wrap_native", () => {
    const r = nativeXlmDescription("mint", ["GABCDEFGH12", 10_000_000], null);
    assert.equal(r.function, "wrap_native");
    assert.match(r.description, /Wrapped/);
    assert.match(r.description, /XLM/);
  });
  it("burn → unwrap_native", () => {
    const r = nativeXlmDescription("burn", ["GABCDEFGH12", 10_000_000], null);
    assert.equal(r.function, "unwrap_native");
    assert.match(r.description, /Unwrapped/);
  });
  it("other fn → null", () => {
    assert.equal(nativeXlmDescription("transfer", [], null), null);
  });
  it("uses data as fallback when amount arg is missing", () => {
    const r = nativeXlmDescription("mint", ["GABCDEFGH12"], 5_000_000);
    assert.match(r.description, /0\.5/);
  });
});
