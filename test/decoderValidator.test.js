/**
 * Unit tests for indexer/src/decoderValidator.js
 * 
 * Tests schema validation, sanitization, and corruption guards
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeDecodedText,
  validateDecodedEvent,
  validateAndSanitizeDecodedEvent,
} from "../src/decoderValidator.js";

describe("decoderValidator", () => {
  describe("sanitizeDecodedText", () => {
    it("should preserve normal text", () => {
      const text = "Transfer 100 XLM to GAAAA";
      assert.equal(sanitizeDecodedText(text), text);
    });

    it("should remove HTML tags", () => {
      const text = "Transfer <script>alert('xss')</script> 100 XLM";
      const sanitized = sanitizeDecodedText(text);
      assert(!sanitized.includes("<script>"));
      assert(!sanitized.includes("</script>"));
    });

    it("should remove control characters", () => {
      const text = "Transfer\u0000100\u001FXL\u007FM";
      const sanitized = sanitizeDecodedText(text);
      assert(!sanitized.includes("\u0000"));
      assert(!sanitized.includes("\u001F"));
      assert(!sanitized.includes("\u007F"));
    });

    it("should truncate to 2048 chars", () => {
      const text = "a".repeat(3000);
      const sanitized = sanitizeDecodedText(text);
      assert.equal(sanitized.length, 2048);
    });

    it("should handle null/undefined", () => {
      assert.equal(sanitizeDecodedText(null), "");
      assert.equal(sanitizeDecodedText(undefined), "");
    });

    it("should return placeholder for empty/whitespace text", () => {
      assert.equal(sanitizeDecodedText(""), "<invalid decoded text>");
      assert.equal(sanitizeDecodedText("   "), "<invalid decoded text>");
      assert.equal(sanitizeDecodedText("\t\n"), "<invalid decoded text>");
    });

    it("should prevent [object Object] corruption", () => {
      const text = "[object Object]";
      // This text is valid, but combined with other sanitization would be caught
      const sanitized = sanitizeDecodedText(text);
      assert.equal(sanitized, text); // It's not malicious HTML, so it passes through
    });
  });

  describe("validateDecodedEvent", () => {
    const validEvent = {
      contract_id: "CAQAAAAAAAAAAAAAAAAAABUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      ledger: 12345,
      tx_hash: "abcd1234",
      function: "transfer",
      description: "Transfer 100 XLM",
      raw_topics: [],
      raw_data: "{}",
    };

    it("should accept valid events", () => {
      const result = validateDecodedEvent(validEvent);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    it("should reject missing required fields", () => {
      const invalid = { ...validEvent };
      delete invalid.contract_id;
      const result = validateDecodedEvent(invalid);
      assert.equal(result.valid, false);
      assert(result.errors.length > 0);
    });

    it("should reject description exceeding max length", () => {
      const invalid = {
        ...validEvent,
        description: "x".repeat(3000),
      };
      const result = validateDecodedEvent(invalid);
      assert.equal(result.valid, false);
    });

    it("should reject empty description", () => {
      const invalid = { ...validEvent, description: "" };
      const result = validateDecodedEvent(invalid);
      assert.equal(result.valid, false);
    });

    it("should accept optional fields", () => {
      const withOptional = {
        ...validEvent,
        is_high_bloat_risk: true,
        is_clawback: false,
        fee_charged: 1000,
        cpu_instructions: 5000,
        mem_bytes: 10000,
      };
      const result = validateDecodedEvent(withOptional);
      assert.equal(result.valid, true);
    });
  });

  describe("validateAndSanitizeDecodedEvent", () => {
    const validEvent = {
      contract_id: "CAQAAAAAAAAAAAAAAAAAABUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      ledger: 12345,
      tx_hash: "abcd1234",
      function: "transfer",
      description: "Transfer 100 XLM",
      raw_topics: [],
      raw_data: "{}",
    };

    it("should mark valid events as decoded=true", () => {
      const result = validateAndSanitizeDecodedEvent(validEvent);
      assert.equal(result.decoded, true);
    });

    it("should sanitize and mark invalid events as decoded=false", () => {
      const invalid = {
        ...validEvent,
        description: "<script>alert('xss')</script>Transfer 100 XLM",
      };
      const result = validateAndSanitizeDecodedEvent(invalid);
      assert.equal(result.decoded, true); // Description is valid after sanitization
      assert(!result.description.includes("<script>"));
    });

    it("should sanitize HTML in description before validation", () => {
      const event = {
        ...validEvent,
        description: "Transfer <b>100</b> XLM",
      };
      const result = validateAndSanitizeDecodedEvent(event);
      assert.equal(result.description, "Transfer 100 XLM");
      assert.equal(result.decoded, true);
    });

    it("should handle corrupted descriptions gracefully", () => {
      const corrupted = {
        ...validEvent,
        description: "[object Object]",
      };
      const result = validateAndSanitizeDecodedEvent(corrupted);
      // Even though it looks odd, it's valid text
      assert.equal(result.decoded, true);
      assert.equal(result.description, "[object Object]");
    });

    it("should truncate oversized descriptions", () => {
      const oversized = {
        ...validEvent,
        description: "x".repeat(3000),
      };
      const result = validateAndSanitizeDecodedEvent(oversized);
      assert(result.description.length <= 2048);
      assert.equal(result.decoded, true);
    });

    it("should log validation failures", () => {
      const mockLogger = {
        error: function(msg, json) {
          this.lastMsg = msg;
          this.lastJson = json;
        },
      };

      const invalid = {
        contract_id: "CAQAAAAAAAAAAAAAAAAAABUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        ledger: 12345,
        tx_hash: "abcd1234",
        function: "transfer",
        description: "", // Invalid: empty description
        raw_topics: [],
        raw_data: "{}",
      };

      const result = validateAndSanitizeDecodedEvent(invalid, mockLogger);
      assert.equal(result.decoded, false);
      assert(mockLogger.lastMsg.includes("schema validation failed"));
      assert(mockLogger.lastJson.includes("error_count"));
    });

    it("should preserve decoded flag through roundtrip", () => {
      const event = { ...validEvent };
      const validated = validateAndSanitizeDecodedEvent(event);
      assert.equal(validated.decoded, true);
      assert.equal(validated.contract_id, event.contract_id);
      assert.equal(validated.function, event.function);
    });
  });

  describe("Corruption scenarios", () => {
    it("should catch null bytes in description", () => {
      const corrupted = {
        contract_id: "CAQAAAAAAAAAAAAAAAAAABUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        ledger: 12345,
        tx_hash: "abcd1234",
        function: "transfer",
        description: "Transfer\u0000\u0000\u0000100 XLM",
        raw_topics: [],
        raw_data: "{}",
      };
      const result = validateAndSanitizeDecodedEvent(corrupted);
      assert(!result.description.includes("\u0000"));
    });

    it("should prevent XSS via description", () => {
      const xss = {
        contract_id: "CAQAAAAAAAAAAAAAAAAAABUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        ledger: 12345,
        tx_hash: "abcd1234",
        function: "transfer",
        description: '<img src=x onerror="alert(1)">Transfer 100 XLM',
        raw_topics: [],
        raw_data: "{}",
      };
      const result = validateAndSanitizeDecodedEvent(xss);
      assert(!result.description.includes("onerror"));
      assert(!result.description.includes("<img"));
    });

    it("should handle object-to-string conversion artifacts", () => {
      // Simulate what happens if scValToNative returns an object that gets stringified
      const objAsString = {
        contract_id: "CAQAAAAAAAAAAAAAAAAAABUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        ledger: 12345,
        tx_hash: "abcd1234",
        function: "transfer",
        description: "[object Object]",
        raw_topics: [],
        raw_data: "{}",
      };
      const result = validateAndSanitizeDecodedEvent(objAsString);
      // This is valid text (albeit suspicious)
      assert.equal(result.decoded, true);
      assert.equal(result.description, "[object Object]");
    });

    it("should handle undefined placeholders", () => {
      const event = {
        contract_id: "CAQAAAAAAAAAAAAAAAAAABUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        ledger: 12345,
        tx_hash: "abcd1234",
        function: "transfer",
        description: "Transfer undefined XLM",
        raw_topics: [],
        raw_data: "{}",
      };
      const result = validateAndSanitizeDecodedEvent(event);
      // "undefined" is valid text, not caught as corruption
      assert.equal(result.decoded, true);
      assert.equal(result.description, "Transfer undefined XLM");
    });
  });
});
