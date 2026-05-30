import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareInterfaces, detectBreakingChanges, generateCompatibilityReport } from "../src/compatibilityValidator.js";

describe("compatibilityValidator", () => {
  describe("compareInterfaces", () => {
    it("should detect removed functions", () => {
      const oldAbi = {
        functions: [
          { name: "initialize", inputs: [], outputs: [] },
          { name: "swap", inputs: [{ name: "amount", type: "I128" }], outputs: [] },
          { name: "get_balance", inputs: [], outputs: [{ type: "I128" }] },
        ],
      };

      const newAbi = {
        functions: [
          { name: "initialize", inputs: [], outputs: [] },
          { name: "swap", inputs: [{ name: "amount", type: "I128" }], outputs: [] },
        ],
      };

      const result = compareInterfaces(oldAbi, newAbi);
      assert.equal(result.removed.length, 1);
      assert.equal(result.removed[0].name, "get_balance");
    });

    it("should detect added functions", () => {
      const oldAbi = {
        functions: [{ name: "initialize", inputs: [], outputs: [] }],
      };

      const newAbi = {
        functions: [
          { name: "initialize", inputs: [], outputs: [] },
          { name: "new_function", inputs: [], outputs: [] },
        ],
      };

      const result = compareInterfaces(oldAbi, newAbi);
      assert.equal(result.added.length, 1);
      assert.equal(result.added[0].name, "new_function");
    });

    it("should detect modified function signatures", () => {
      const oldAbi = {
        functions: [
          { name: "swap", inputs: [{ name: "amount", type: "I128" }], outputs: [] },
        ],
      };

      const newAbi = {
        functions: [
          { name: "swap", inputs: [{ name: "amount", type: "I128" }, { name: "slippage", type: "U32" }], outputs: [] },
        ],
      };

      const result = compareInterfaces(oldAbi, newAbi);
      assert.equal(result.modified.length, 1);
      assert.equal(result.modified[0].name, "swap");
    });

    it("should handle empty function lists", () => {
      const oldAbi = { functions: [] };
      const newAbi = { functions: [] };

      const result = compareInterfaces(oldAbi, newAbi);
      assert.equal(result.removed.length, 0);
      assert.equal(result.added.length, 0);
      assert.equal(result.modified.length, 0);
    });
  });

  describe("detectBreakingChanges", () => {
    it("should flag removed functions as breaking", () => {
      const comparison = {
        removed: [{ name: "swap", inputs: [], outputs: [] }],
        added: [],
        modified: [],
      };

      const breaking = detectBreakingChanges(comparison);
      assert.equal(breaking.length, 1);
      assert.equal(breaking[0].type, "removed_function");
      assert.equal(breaking[0].severity, "critical");
    });

    it("should flag modified function signatures as breaking", () => {
      const comparison = {
        removed: [],
        added: [],
        modified: [
          {
            name: "transfer",
            oldInputs: [{ name: "to", type: "Address" }, { name: "amount", type: "I128" }],
            newInputs: [{ name: "to", type: "Address" }],
          },
        ],
      };

      const breaking = detectBreakingChanges(comparison);
      assert.equal(breaking.length, 1);
      assert.equal(breaking[0].type, "modified_signature");
    });

    it("should not flag added functions as breaking", () => {
      const comparison = {
        removed: [],
        added: [{ name: "new_function", inputs: [], outputs: [] }],
        modified: [],
      };

      const breaking = detectBreakingChanges(comparison);
      assert.equal(breaking.length, 0);
    });

    it("should handle multiple breaking changes", () => {
      const comparison = {
        removed: [
          { name: "old_swap", inputs: [], outputs: [] },
          { name: "old_transfer", inputs: [], outputs: [] },
        ],
        added: [],
        modified: [{ name: "initialize", oldInputs: [], newInputs: [{ name: "admin", type: "Address" }] }],
      };

      const breaking = detectBreakingChanges(comparison);
      assert.equal(breaking.length, 3);
    });
  });

  describe("generateCompatibilityReport", () => {
    it("should generate report with no breaking changes", () => {
      const comparison = {
        removed: [],
        added: [{ name: "new_feature", inputs: [], outputs: [] }],
        modified: [],
      };

      const report = generateCompatibilityReport(comparison);
      assert.equal(report.isCompatible, true);
      assert.equal(report.breakingChanges.length, 0);
      assert.equal(report.additions.length, 1);
    });

    it("should generate report with breaking changes", () => {
      const comparison = {
        removed: [{ name: "swap", inputs: [], outputs: [] }],
        added: [],
        modified: [],
      };

      const report = generateCompatibilityReport(comparison);
      assert.equal(report.isCompatible, false);
      assert.equal(report.breakingChanges.length, 1);
      assert.equal(report.summary, "1 breaking change detected");
    });

    it("should include detailed change information", () => {
      const comparison = {
        removed: [{ name: "old_fn", inputs: [], outputs: [] }],
        added: [{ name: "new_fn", inputs: [], outputs: [] }],
        modified: [{ name: "existing_fn", oldInputs: [], newInputs: [{ name: "param", type: "U32" }] }],
      };

      const report = generateCompatibilityReport(comparison);
      assert.equal(report.removals.length, 1);
      assert.equal(report.additions.length, 1);
      assert.equal(report.modifications.length, 1);
    });

    it("should calculate compatibility score", () => {
      const comparison = {
        removed: [],
        added: [{ name: "fn1" }, { name: "fn2" }],
        modified: [],
      };

      const report = generateCompatibilityReport(comparison);
      assert(report.compatibilityScore >= 0 && report.compatibilityScore <= 100);
    });
  });
});
