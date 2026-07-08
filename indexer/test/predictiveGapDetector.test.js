import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  recordLedger,
  avgInterLedgerMs,
  checkOverdue,
  detectGaps,
  estimateCatchupTime,
  analyze,
  _reset,
} from "../src/predictiveGapDetector.js";

beforeEach(() => _reset());

describe("recordLedger", () => {
  it("accepts and stores the first ledger", () => {
    recordLedger(100);
    assert.ok(avgInterLedgerMs() === null);
  });

  it("computes avg after two ledgers", () => {
    recordLedger(100);
    recordLedger(101);
    const avg = avgInterLedgerMs();
    assert.ok(avg !== null);
    assert.ok(avg >= 0);
  });

  it("ignores ledgers not greater than the last recorded", () => {
    recordLedger(200);
    recordLedger(199);
    assert.ok(avgInterLedgerMs() === null);
  });

  it("ignores duplicate ledger numbers", () => {
    recordLedger(300);
    recordLedger(300);
    assert.ok(avgInterLedgerMs() === null);
  });
});

describe("avgInterLedgerMs", () => {
  it("returns null with fewer than 2 data points", () => {
    assert.equal(avgInterLedgerMs(), null);
    recordLedger(1);
    assert.equal(avgInterLedgerMs(), null);
  });

  it("returns a positive number with 2+ ledgers", () => {
    recordLedger(1);
    recordLedger(2);
    const avg = avgInterLedgerMs();
    assert.ok(typeof avg === "number");
    assert.ok(avg >= 0);
  });
});

describe("checkOverdue", () => {
  it("returns null with no history", () => {
    assert.equal(checkOverdue(), null);
  });

  it("returns null with only one ledger", () => {
    recordLedger(10);
    assert.equal(checkOverdue(), null);
  });

  it("returns an object with overdue, expectedLedger, overdueByMs", () => {
    recordLedger(10);
    recordLedger(11);
    const result = checkOverdue();
    assert.ok(result !== null);
    assert.ok("overdue" in result);
    assert.ok("expectedLedger" in result);
    assert.ok("overdueByMs" in result);
  });

  it("expectedLedger is one after the last recorded ledger", () => {
    recordLedger(50);
    recordLedger(51);
    const result = checkOverdue();
    assert.equal(result.expectedLedger, 52);
  });

  it("overdueByMs is non-negative", () => {
    recordLedger(100);
    recordLedger(101);
    const result = checkOverdue();
    assert.ok(result.overdueByMs >= 0);
  });

  it("overdue is false immediately after the ledger arrives", () => {
    recordLedger(200);
    recordLedger(201);
    const result = checkOverdue();
    assert.equal(result.overdue, false);
  });
});

describe("detectGaps", () => {
  it("returns empty array for fewer than 2 ledgers", () => {
    assert.deepEqual(detectGaps([]), []);
    assert.deepEqual(detectGaps([100]), []);
  });

  it("returns empty array for consecutive ledgers", () => {
    assert.deepEqual(detectGaps([1, 2, 3, 4, 5]), []);
  });

  it("detects a gap at or above threshold", () => {
    const threshold = Number(process.env.PREDICTIVE_GAP_THRESHOLD ?? 3);
    const ledgers = [100, 100 + threshold + 1];
    const gaps = detectGaps(ledgers);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].size, threshold);
  });

  it("does not flag gaps below threshold", () => {
    const threshold = Number(process.env.PREDICTIVE_GAP_THRESHOLD ?? 3);
    const ledgers = [100, 100 + threshold - 1];
    const gaps = detectGaps(ledgers);
    assert.equal(gaps.length, 0);
  });

  it("gap has correct from, to, and size", () => {
    const gaps = detectGaps([10, 20]);
    assert.equal(gaps[0].from, 11);
    assert.equal(gaps[0].to, 19);
    assert.equal(gaps[0].size, 9);
  });

  it("detects multiple gaps in a sequence", () => {
    const gaps = detectGaps([1, 2, 10, 11, 20]);
    const sizes = gaps.map((g) => g.size);
    assert.ok(sizes.includes(7));
    assert.ok(sizes.includes(8));
  });
});

describe("estimateCatchupTime", () => {
  it("returns null when no history is available", () => {
    assert.equal(estimateCatchupTime(10), null);
  });

  it("uses provided avgMs override", () => {
    const result = estimateCatchupTime(5, 1000);
    assert.equal(result.estimatedMs, 5000);
    assert.equal(result.estimatedSec, 5);
  });

  it("scales linearly with gap size", () => {
    const r1 = estimateCatchupTime(1, 500);
    const r2 = estimateCatchupTime(2, 500);
    assert.equal(r2.estimatedMs, r1.estimatedMs * 2);
  });

  it("uses rolling avg when avgMs is not provided", () => {
    recordLedger(1);
    recordLedger(2);
    const avg = avgInterLedgerMs();
    const result = estimateCatchupTime(3);
    if (avg) {
      assert.ok(result !== null);
      assert.ok(result.estimatedMs > 0);
    }
  });
});

describe("analyze", () => {
  it("returns all expected keys", () => {
    const result = analyze([1, 2, 3]);
    assert.ok("overdue" in result);
    assert.ok("prediction" in result);
    assert.ok("gaps" in result);
    assert.ok("catchup" in result);
  });

  it("overdue is false when no history", () => {
    const result = analyze([]);
    assert.equal(result.overdue, false);
  });

  it("gaps is empty for consecutive ledgers", () => {
    const result = analyze([100, 101, 102, 103]);
    assert.deepEqual(result.gaps, []);
  });

  it("reports gaps and catchup for a large sequence gap", () => {
    recordLedger(1);
    recordLedger(2);
    const result = analyze([1, 2, 50]);
    assert.ok(result.gaps.length > 0);
    const largestGap = result.gaps.reduce((m, g) => (g.size > (m?.size ?? 0) ? g : m), null);
    assert.ok(largestGap.size >= 3);
  });

  it("catchup is null when no gaps above threshold", () => {
    const result = analyze([100, 101, 102]);
    assert.equal(result.catchup, null);
  });
});
