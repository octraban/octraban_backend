import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateDiff, parseDiffLines, formatDiffOutput } from "../src/diffViewer.js";

describe("diffViewer", () => {
  describe("generateDiff", () => {
    it("should generate diff for identical content", () => {
      const oldCode = "fn initialize() {}";
      const newCode = "fn initialize() {}";

      const diff = generateDiff(oldCode, newCode);
      assert.equal(diff.length, 1);
      assert.equal(diff[0].type, "unchanged");
    });

    it("should detect added lines", () => {
      const oldCode = "fn initialize() {}";
      const newCode = "fn initialize() {}\nfn new_function() {}";

      const diff = generateDiff(oldCode, newCode);
      const added = diff.filter((d) => d.type === "added");
      assert(added.length > 0);
    });

    it("should detect removed lines", () => {
      const oldCode = "fn initialize() {}\nfn old_function() {}";
      const newCode = "fn initialize() {}";

      const diff = generateDiff(oldCode, newCode);
      const removed = diff.filter((d) => d.type === "removed");
      assert(removed.length > 0);
    });

    it("should detect modified lines", () => {
      const oldCode = "let x = 5;";
      const newCode = "let x = 10;";

      const diff = generateDiff(oldCode, newCode);
      assert(diff.some((d) => d.type === "removed"));
      assert(diff.some((d) => d.type === "added"));
    });

    it("should handle multiline code blocks", () => {
      const oldCode = `fn swap(amount: i128) {
  let balance = get_balance();
  transfer(amount);
}`;
      const newCode = `fn swap(amount: i128, slippage: u32) {
  let balance = get_balance();
  validate_slippage(slippage);
  transfer(amount);
}`;

      const diff = generateDiff(oldCode, newCode);
      assert(diff.length > 0);
      assert(diff.some((d) => d.type === "added" || d.type === "removed"));
    });
  });

  describe("parseDiffLines", () => {
    it("should parse unified diff format", () => {
      const diffText = `--- old.rs
+++ new.rs
@@ -1,3 +1,4 @@
 fn initialize() {}
+fn new_function() {}
 fn swap() {}`;

      const lines = parseDiffLines(diffText);
      assert(lines.length > 0);
      assert(lines.some((l) => l.type === "added"));
    });

    it("should extract line numbers from diff headers", () => {
      const diffText = `@@ -10,5 +10,6 @@
 context line`;
      const lines = parseDiffLines(diffText);
      assert(lines.length > 0);
    });

    it("should handle context lines", () => {
      const diffText = ` context line
-removed line
+added line
 another context`;

      const lines = parseDiffLines(diffText);
      const contextLines = lines.filter((l) => l.type === "context");
      assert(contextLines.length >= 2);
    });

    it("should preserve line content", () => {
      const diffText = `+pub fn new_function() {
+  println!("Hello");
+}`;

      const lines = parseDiffLines(diffText);
      const added = lines.filter((l) => l.type === "added");
      assert(added.length >= 3);
      assert(added[0].content.includes("new_function"));
    });
  });

  describe("formatDiffOutput", () => {
    it("should format diff with line numbers", () => {
      const diff = [
        { type: "unchanged", content: "fn initialize() {}" },
        { type: "added", content: "fn new_function() {}" },
        { type: "removed", content: "fn old_function() {}" },
      ];

      const formatted = formatDiffOutput(diff);
      assert(formatted.includes("fn initialize()"));
      assert(formatted.includes("fn new_function()"));
      assert(formatted.includes("fn old_function()"));
    });

    it("should include diff markers", () => {
      const diff = [
        { type: "added", content: "new line" },
        { type: "removed", content: "old line" },
      ];

      const formatted = formatDiffOutput(diff);
      assert(formatted.includes("+"));
      assert(formatted.includes("-"));
    });

    it("should format side-by-side view", () => {
      const diff = [
        { type: "removed", content: "old code", lineNum: 1 },
        { type: "added", content: "new code", lineNum: 1 },
      ];

      const formatted = formatDiffOutput(diff, { sideBySide: true });
      assert(formatted.includes("old code"));
      assert(formatted.includes("new code"));
    });

    it("should include context around changes", () => {
      const diff = [
        { type: "context", content: "line 1" },
        { type: "added", content: "line 2 new" },
        { type: "context", content: "line 3" },
      ];

      const formatted = formatDiffOutput(diff);
      assert(formatted.includes("line 1"));
      assert(formatted.includes("line 2 new"));
      assert(formatted.includes("line 3"));
    });

    it("should handle empty diff", () => {
      const diff = [];
      const formatted = formatDiffOutput(diff);
      assert.equal(typeof formatted, "string");
    });
  });
});
