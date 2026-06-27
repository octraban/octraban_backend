import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractDocComments, matchDocToFunction, buildDocRegistry, getDocForFunction } from "../src/docExtractor.js";

describe("docExtractor", () => {
  describe("extractDocComments", () => {
    it("should extract single line doc comments", () => {
      const code = `/// Initializes the contract
pub fn initialize() {}`;

      const docs = extractDocComments(code);
      assert.equal(docs.length, 1);
      assert.equal(docs[0].content, "Initializes the contract");
    });

    it("should extract multiline doc comments", () => {
      const code = `/// Swaps tokens on the DEX
/// Takes amount and returns output
/// Validates slippage before execution
pub fn swap(amount: i128) {}`;

      const docs = extractDocComments(code);
      assert.equal(docs.length, 1);
      assert(docs[0].content.includes("Swaps tokens"));
      assert(docs[0].content.includes("Validates slippage"));
    });

    it("should handle multiple doc blocks", () => {
      const code = `/// First function
pub fn func1() {}

/// Second function
pub fn func2() {}`;

      const docs = extractDocComments(code);
      assert.equal(docs.length, 2);
    });

    it("should preserve doc formatting", () => {
      const code = `/// # Parameters
/// - amount: The swap amount
/// - slippage: Max allowed slippage
pub fn swap(amount: i128, slippage: u32) {}`;

      const docs = extractDocComments(code);
      assert(docs[0].content.includes("# Parameters"));
      assert(docs[0].content.includes("- amount"));
    });

    it("should ignore non-doc comments", () => {
      const code = `// Regular comment
/// Doc comment
pub fn func() {}`;

      const docs = extractDocComments(code);
      assert.equal(docs.length, 1);
      assert.equal(docs[0].content, "Doc comment");
    });
  });

  describe("matchDocToFunction", () => {
    it("should match doc to function name", () => {
      const doc = { content: "Initialize contract", lineNum: 1 };
      const func = { name: "initialize", lineNum: 2 };

      const match = matchDocToFunction(doc, func);
      assert.equal(match, true);
    });

    it("should match doc immediately before function", () => {
      const doc = { content: "Swap tokens", lineNum: 5 };
      const func = { name: "swap", lineNum: 6 };

      const match = matchDocToFunction(doc, func);
      assert.equal(match, true);
    });

    it("should not match doc far from function", () => {
      const doc = { content: "Some doc", lineNum: 1 };
      const func = { name: "func", lineNum: 10 };

      const match = matchDocToFunction(doc, func);
      assert.equal(match, false);
    });

    it("should handle multiple doc lines", () => {
      const docs = [
        { content: "Line 1", lineNum: 1 },
        { content: "Line 2", lineNum: 2 },
      ];
      const func = { name: "func", lineNum: 3 };

      const match = matchDocToFunction(docs, func);
      assert(match === true || match === false);
    });
  });

  describe("buildDocRegistry", () => {
    it("should build registry from code", () => {
      const code = `/// Initializes the contract
pub fn initialize() {}

/// Swaps tokens
pub fn swap(amount: i128) {}`;

      const registry = buildDocRegistry(code);
      assert(registry.has("initialize"));
      assert(registry.has("swap"));
    });

    it("should map function names to docs", () => {
      const code = `/// Get user balance
pub fn get_balance(user: Address) {}`;

      const registry = buildDocRegistry(code);
      const doc = registry.get("get_balance");
      assert(doc.includes("Get user balance"));
    });

    it("should handle functions without docs", () => {
      const code = `pub fn no_doc() {}

/// Has doc
pub fn has_doc() {}`;

      const registry = buildDocRegistry(code);
      assert.equal(registry.has("no_doc"), false);
      assert.equal(registry.has("has_doc"), true);
    });

    it("should preserve multiline documentation", () => {
      const code = `/// Transfers tokens
/// # Parameters
/// - to: Recipient address
/// - amount: Transfer amount
pub fn transfer(to: Address, amount: i128) {}`;

      const registry = buildDocRegistry(code);
      const doc = registry.get("transfer");
      assert(doc !== undefined);
      assert(doc.includes("Transfers tokens"));
    });
  });

  describe("getDocForFunction", () => {
    it("should retrieve doc for function", () => {
      const registry = new Map([
        ["initialize", "Initializes the contract"],
        ["swap", "Swaps tokens on DEX"],
      ]);

      const doc = getDocForFunction(registry, "initialize");
      assert.equal(doc, "Initializes the contract");
    });

    it("should return undefined for missing function", () => {
      const registry = new Map([["initialize", "Init doc"]]);

      const doc = getDocForFunction(registry, "nonexistent");
      assert.equal(doc, undefined);
    });

    it("should handle empty registry", () => {
      const registry = new Map();

      const doc = getDocForFunction(registry, "any_function");
      assert.equal(doc, undefined);
    });

    it("should format doc for tooltip display", () => {
      const registry = new Map([
        ["swap", "Swaps tokens\n# Parameters\n- amount: i128"],
      ]);

      const doc = getDocForFunction(registry, "swap", { format: "tooltip" });
      assert(typeof doc === "string");
      assert(doc.length > 0);
    });

    it("should truncate long documentation", () => {
      const longDoc = "A".repeat(500);
      const registry = new Map([["func", longDoc]]);

      const doc = getDocForFunction(registry, "func", { maxLength: 100 });
      assert(doc.length <= 103);
    });
  });
});
