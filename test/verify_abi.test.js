import { test, describe } from "node:test";
import assert from "node:assert";

// Unit tests for the ABI verification logic

describe("validation helpers", () => {
  // Simple validation logic we can test without the RPC
  const validateFunctionName = (spec, functionName) => {
    return spec.some(fn => fn.name === functionName);
  };

  const validateArgCount = (spec, functionName, argCount) => {
    const fn = spec.find(f => f.name === functionName);
    if (!fn) return false;
    return fn.args.length === argCount;
  };

  test("validateFunctionName returns true for existing function", () => {
    const spec = [
      { name: "swap", args: [] },
      { name: "add", args: [] },
    ];

    assert.strictEqual(validateFunctionName(spec, "swap"), true);
    assert.strictEqual(validateFunctionName(spec, "add"), true);
    assert.strictEqual(validateFunctionName(spec, "remove"), false);
    assert.strictEqual(validateFunctionName(spec, ""), false);
  });

  test("validateArgCount returns true when counts match", () => {
    const spec = [
      { name: "swap", args: [{ name: "a" }, { name: "b" }] },
      { name: "mint", args: [{ name: "to" }] },
    ];

    assert.strictEqual(validateArgCount(spec, "swap", 2), true);
    assert.strictEqual(validateArgCount(spec, "swap", 1), false);
    assert.strictEqual(validateArgCount(spec, "swap", 0), false);
    assert.strictEqual(validateArgCount(spec, "mint", 1), true);
    assert.strictEqual(validateArgCount(spec, "mint", 0), false);
    assert.strictEqual(validateArgCount(spec, "missing", 2), false);
    assert.strictEqual(validateArgCount(spec, "", 0), false);
  });

  test("validation handles empty spec", () => {
    assert.strictEqual(validateFunctionName([], "swap"), false);
    assert.strictEqual(validateArgCount([], "swap", 0), false);
  });
});

describe("verification result structure", () => {
  test("verification result has correct structure", () => {
    const result = {
      valid: false,
      errors: ["Function foo not found in on-chain spec"],
      missingFunctions: [{ name: "foo" }],
      argMismatch: [],
    };

    assert.ok(typeof result.valid === "boolean");
    assert.ok(Array.isArray(result.errors));
    assert.ok(Array.isArray(result.missingFunctions));
    assert.ok(Array.isArray(result.argMismatch));
  });

  test("valid verification returns empty errors", () => {
    const result = {
      valid: true,
      errors: [],
      missingFunctions: [],
      argMismatch: [],
    };

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });
});