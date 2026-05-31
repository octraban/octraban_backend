import { describe, it } from "node:test";
import assert from "node:assert";
import { detectRwaToken, decodeRwaEvent } from "../src/rwaDecoder.js";

describe("rwaDecoder", () => {
  describe("detectRwaToken", () => {
    it("detects RWA token by rwa_type metadata", () => {
      const meta = {
        name: "Benji Token",
        rwa_type: "benji",
      };
      const result = detectRwaToken(meta, "CONTRACT123");
      assert.strictEqual(result?.type, "benji");
    });

    it("detects RWA token by name pattern", () => {
      const meta = {
        name: "Franklin Templeton Benji",
        description: "RWA token",
      };
      const result = detectRwaToken(meta, "CONTRACT123");
      assert.strictEqual(result?.type, "benji");
    });

    it("returns null for non-RWA contracts", () => {
      const meta = {
        name: "Regular Token",
        description: "A regular token",
      };
      const result = detectRwaToken(meta, "CONTRACT123");
      assert.strictEqual(result, null);
    });

    it("returns null for null metadata", () => {
      const result = detectRwaToken(null, "CONTRACT123");
      assert.strictEqual(result, null);
    });
  });

  describe("decodeRwaEvent", () => {
    it("decodes dividend distribution event", () => {
      const meta = {
        name: "Benji Token",
        rwa_type: "benji",
      };
      const event = {
        contract_id: "CONTRACT123",
        function: "distribute_dividend",
        raw_topics: ["distribute_dividend", 0.04, 1200],
        raw_data: "{}",
      };
      const description = decodeRwaEvent(event, meta);
      assert(description?.includes("Dividend"));
      assert(description?.includes("0.04"));
      assert(description?.includes("1200"));
    });

    it("decodes investor registry update event", () => {
      const meta = {
        name: "Benji Token",
        rwa_type: "benji",
      };
      const event = {
        contract_id: "CONTRACT123",
        function: "investor_registry_update",
        raw_topics: ["investor_registry_update", "GABC123", "add", 1000],
        raw_data: "{}",
      };
      const description = decodeRwaEvent(event, meta);
      assert(description?.includes("Investor"));
      assert(description?.includes("registry"));
    });

    it("returns null for non-RWA contracts", () => {
      const meta = {
        name: "Regular Token",
      };
      const event = {
        contract_id: "CONTRACT123",
        function: "transfer",
        raw_topics: ["transfer"],
        raw_data: "{}",
      };
      const description = decodeRwaEvent(event, meta);
      assert.strictEqual(description, null);
    });

    it("returns null for unknown RWA functions", () => {
      const meta = {
        name: "Benji Token",
        rwa_type: "benji",
      };
      const event = {
        contract_id: "CONTRACT123",
        function: "unknown_function",
        raw_topics: ["unknown_function"],
        raw_data: "{}",
      };
      const description = decodeRwaEvent(event, meta);
      assert.strictEqual(description, null);
    });
  });
});
