/**
 * Regression fixture for issue #6 — consolidate the duplicated XDR decoder
 * implementations.
 *
 * `indexer/src/decoder.js` (authoritative — consumed by octraban_frontend)
 * and `src/indexer/sep41-parser.ts` (used by the API service) each render
 * human-readable SEP-41 event descriptions independently. This test asserts
 * the JS side renders byte-for-byte identical output to the fixed fixture
 * set; tests/indexer/decoder-parity.test.ts asserts the same fixture set
 * against the TS side. If either implementation's wording drifts, its half
 * of this fixture pair fails — catching the exact risk the issue describes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildDescription } from "../src/decoder.js";

const fixturesPath = fileURLToPath(
  new URL("../../tests/fixtures/decoder-event-parity.json", import.meta.url),
);
const { cases } = JSON.parse(readFileSync(fixturesPath, "utf8"));

// Positional argument order buildDescription() expects per function name —
// mirrors the destructuring in indexer/src/decoder.js's buildDescription().
const ARG_ORDER = {
  transfer: ["from", "to", "amount", "token"],
  mint: ["to", "amount", "token"],
  burn: ["from", "amount", "token"],
  clawback: ["admin", "from", "amount", "token"],
};

describe("decoder parity fixtures (issue #6)", () => {
  for (const testCase of cases) {
    it(`renders "${testCase.function}" identically to src/indexer/sep41-parser.ts`, () => {
      const order = ARG_ORDER[testCase.function];
      assert.ok(order, `no ARG_ORDER mapping for ${testCase.function}`);

      const args = order.map((key) => (key === "token" ? testCase.token : testCase.values[key]));
      const rendered = buildDescription(testCase.function, args, null, testCase.contractName);

      assert.equal(rendered, testCase.expected);
    });
  }
});
