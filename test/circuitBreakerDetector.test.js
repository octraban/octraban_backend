import { describe, it } from "node:test";
import assert from "node:assert";
import { hasCircuitBreaker, determinePauseStatus, getStatusBanner } from "../src/circuitBreakerDetector.js";

describe("circuitBreakerDetector", () => {
  describe("hasCircuitBreaker", () => {
    it("detects pause function", () => {
      const meta = {
        functions: [
          { name: "pause" },
          { name: "transfer" },
        ],
      };
      assert.strictEqual(hasCircuitBreaker(meta), true);
    });

    it("detects unpause function", () => {
      const meta = {
        functions: [
          { name: "unpause" },
          { name: "transfer" },
        ],
      };
      assert.strictEqual(hasCircuitBreaker(meta), true);
    });

    it("detects is_paused function", () => {
      const meta = {
        functions: [
          { name: "is_paused" },
          { name: "transfer" },
        ],
      };
      assert.strictEqual(hasCircuitBreaker(meta), true);
    });

    it("returns false for contracts without pause functions", () => {
      const meta = {
        functions: [
          { name: "transfer" },
          { name: "mint" },
        ],
      };
      assert.strictEqual(hasCircuitBreaker(meta), false);
    });

    it("returns false for null metadata", () => {
      assert.strictEqual(hasCircuitBreaker(null), false);
    });
  });

  describe("determinePauseStatus", () => {
    it("detects paused status from pause event", () => {
      const events = [
        { function: "pause", ledger: 100, description: "Contract paused" },
        { function: "transfer", ledger: 99, description: "Transfer" },
      ];
      const status = determinePauseStatus(events);
      assert.strictEqual(status.isPaused, true);
      assert.strictEqual(status.lastStatusChange, 100);
    });

    it("detects operational status from unpause event", () => {
      const events = [
        { function: "unpause", ledger: 150, description: "Contract unpaused" },
        { function: "pause", ledger: 100, description: "Contract paused" },
      ];
      const status = determinePauseStatus(events);
      assert.strictEqual(status.isPaused, false);
      assert.strictEqual(status.lastStatusChange, 150);
    });

    it("returns operational for empty events", () => {
      const status = determinePauseStatus([]);
      assert.strictEqual(status.isPaused, false);
      assert.strictEqual(status.lastStatusChange, null);
    });

    it("returns operational for null events", () => {
      const status = determinePauseStatus(null);
      assert.strictEqual(status.isPaused, false);
      assert.strictEqual(status.lastStatusChange, null);
    });
  });

  describe("getStatusBanner", () => {
    it("returns paused banner", () => {
      const status = { isPaused: true, lastStatusChange: 100 };
      const banner = getStatusBanner(status);
      assert.strictEqual(banner.text, "Status: Paused by Emergency Administration");
      assert.strictEqual(banner.color, "#ef4444");
      assert.strictEqual(banner.severity, "critical");
    });

    it("returns operational banner", () => {
      const status = { isPaused: false, lastStatusChange: null };
      const banner = getStatusBanner(status);
      assert.strictEqual(banner.text, "Status: Operational");
      assert.strictEqual(banner.color, "#22c55e");
      assert.strictEqual(banner.severity, "ok");
    });
  });
});
