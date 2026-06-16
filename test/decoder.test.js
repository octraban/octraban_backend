import { describe, it } from "node:test";
import assert from "node:assert/strict";

const RESOURCE_LIMIT_CODES = new Set([
  "tx_resource_limit_exceeded",
  "txResourceLimitExceeded",
  "RESOURCE_LIMIT_EXCEEDED",
]);

function isResourceLimitExceeded(ev) {
  const code = ev.txResultCode ?? ev.resultCode ?? ev.result?.code ?? "";
  return RESOURCE_LIMIT_CODES.has(String(code));
}

function extractGasCosts(ev) {
  const result = {};
  try {
    if (ev.feeCharged != null) result.fee_charged = Number(ev.feeCharged);
    const meta = ev.txMeta;
    if (!meta) return result;
    let sorobanMeta = null;
    try {
      sorobanMeta = meta.v3?.().sorobanMeta?.() ?? null;
    } catch { }
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

function nativeXlmDescription(fnName, args, data) {
  if (fnName === "mint") {
    const [to, amount] = args;
    const amt = amount ?? data;
    return {
      function: "wrap_native",
      description: `Wrapped XLM (Classic → Soroban) to ${to}`,
    };
  }
  if (fnName === "burn") {
    const [from, amount] = args;
    const amt = amount ?? data;
    return {
      function: "unwrap_native",
      description: `Unwrapped XLM (Soroban → Classic) from ${from}`,
    };
  }
  return null;
}

function fmt(addr) {
  if (typeof addr !== "string" || addr.length < 10) return String(addr);
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtXlm(amount) {
  if (amount == null) return "?";
  const n = Number(amount);
  return isNaN(n) ? String(amount) : (n / 1e7).toLocaleString(undefined, { maximumFractionDigits: 7 });
}

function buildDescription(fn, args, data, contractName) {
  switch (fn) {
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
    default:
      return `${fn}(${args.map(String).join(", ")}) called on ${contractName}`;
  }
}

describe("decoder", () => {
  describe("isResourceLimitExceeded", () => {
    it("returns true for tx_resource_limit_exceeded", () => {
      assert.equal(isResourceLimitExceeded({ txResultCode: "tx_resource_limit_exceeded" }), true);
    });
    it("returns false for normal result codes", () => {
      assert.equal(isResourceLimitExceeded({ txResultCode: "ttl_success" }), false);
    });
    it("returns false for empty event", () => {
      assert.equal(isResourceLimitExceeded({}), false);
    });
  });

  describe("extractGasCosts", () => {
    it("returns fee_charged from event", () => {
      const result = extractGasCosts({ feeCharged: "500" });
      assert.equal(result.fee_charged, 500);
    });
    it("returns empty object for no metadata", () => {
      assert.deepEqual(extractGasCosts({}), {});
    });
  });

  describe("nativeXlmDescription", () => {
    it("describes native mint as wrap", () => {
      const result = nativeXlmDescription("mint", ["GABCDEFGH", "10000000"]);
      assert.equal(result?.function, "wrap_native");
    });
    it("describes native burn as unwrap", () => {
      const result = nativeXlmDescription("burn", ["GABCDEFGH", "10000000"]);
      assert.equal(result?.function, "unwrap_native");
    });
    it("returns null for non-native fn", () => {
      assert.equal(nativeXlmDescription("swap", []), null);
    });
  });

  describe("fmt", () => {
    it("truncates long addresses", () => {
      assert.equal(fmt("GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"), "GABCDE…7890");
    });
    it("returns short strings as-is", () => {
      assert.equal(fmt("hello"), "hello");
    });
  });

  describe("fmtXlm", () => {
    it("formats stroops as XLM", () => {
      assert.match(fmtXlm("10000000"), /1/);
    });
    it("returns ? for null", () => {
      assert.equal(fmtXlm(null), "?");
    });
  });

  describe("buildDescription", () => {
    it("formats transfer description", () => {
      const desc = buildDescription("transfer", ["GA", "GB", "100", "USDC"], null, "TestContract");
      assert.match(desc, /transferred/);
    });
    it("formats mint description", () => {
      const desc = buildDescription("mint", ["GA", "100", "TOKEN"], null, "TestContract");
      assert.match(desc, /minted/);
    });
    it("fallback to generic description", () => {
      const desc = buildDescription("unknown_fn", ["a", "b"], null, "TestContract");
      assert.match(desc, /unknown_fn/);
    });
  });
});
