import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StrKey } from "@stellar/stellar-sdk";
import { countNewPersistentKeys, isHighBloatRisk, BLOAT_THRESHOLD } from "../src/bloatDetector.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const CONTRACT_BYTES = Buffer.alloc(32, 0xab);
const CONTRACT_ID    = StrKey.encodeContract(CONTRACT_BYTES);
const OTHER_BYTES    = Buffer.alloc(32, 0xcd);

/**
 * Build a fake RPC event with the given txMeta accessor object.
 */
function makeEv(txMetaAccessor) {
  return { txMeta: txMetaAccessor };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("BLOAT_THRESHOLD", () => {
  it("defaults to 50", () => {
    assert.equal(BLOAT_THRESHOLD, 50);
  });
});

describe("countNewPersistentKeys", () => {
  it("returns 0 when txMeta is absent", () => {
    assert.equal(countNewPersistentKeys({}, CONTRACT_ID), 0);
  });

  it("returns 0 when txMeta has no v3 sorobanMeta", () => {
    assert.equal(countNewPersistentKeys({ txMeta: {} }, CONTRACT_ID), 0);
  });

  it("counts persistent CREATED entries for the matching contract", () => {
    // Build a lightweight in-memory mock that matches the accessor pattern
    // used in bloatDetector.js without needing full XDR round-trip
    const entry = (contractBytes, durability = "persistent") => ({
      created: () => ({
        data: () => ({
          contractData: () => ({
            durability: () => ({ name: durability }),
            contract: () => ({
              contractId: () => contractBytes,
            }),
          }),
        }),
      }),
    });

    const txMeta = {
      v3: () => ({
        sorobanMeta: () => ({
          changedEntries: () => [
            entry(CONTRACT_BYTES),          // match
            entry(CONTRACT_BYTES),          // match
            entry(OTHER_BYTES),             // different contract — no match
            entry(CONTRACT_BYTES, "temporary"), // wrong durability — no match
          ],
        }),
      }),
    };

    assert.equal(countNewPersistentKeys(makeEv(txMeta), CONTRACT_ID), 2);
  });

  it("ignores entries without a created() accessor", () => {
    const txMeta = {
      v3: () => ({
        sorobanMeta: () => ({
          changedEntries: () => [
            { created: () => null },   // updated/removed entry
          ],
        }),
      }),
    };
    assert.equal(countNewPersistentKeys(makeEv(txMeta), CONTRACT_ID), 0);
  });

  it("returns 0 for an invalid contractId", () => {
    const txMeta = {
      v3: () => ({ sorobanMeta: () => ({ changedEntries: () => [] }) }),
    };
    assert.equal(countNewPersistentKeys(makeEv(txMeta), "NOT_A_VALID_STRKEY"), 0);
  });
});

describe("isHighBloatRisk", () => {
  function mockEv(count) {
    const entries = Array.from({ length: count }, () => ({
      created: () => ({
        data: () => ({
          contractData: () => ({
            durability: () => ({ name: "persistent" }),
            contract: () => ({ contractId: () => CONTRACT_BYTES }),
          }),
        }),
      }),
    }));
    return makeEv({
      v3: () => ({
        sorobanMeta: () => ({ changedEntries: () => entries }),
      }),
    });
  }

  it("returns false when count equals threshold (not strictly greater)", () => {
    assert.equal(isHighBloatRisk(mockEv(50), CONTRACT_ID), false);
  });

  it("returns true when count exceeds threshold", () => {
    assert.equal(isHighBloatRisk(mockEv(51), CONTRACT_ID), true);
  });

  it("returns false when count is well below threshold", () => {
    assert.equal(isHighBloatRisk(mockEv(5), CONTRACT_ID), false);
  });

  it("returns false when txMeta is missing", () => {
    assert.equal(isHighBloatRisk({}, CONTRACT_ID), false);
  });
});
