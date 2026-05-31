import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractClawback, extractSep41Event } from "../src/sep41.js";

const ADMIN = "GABC1234ADMIN";
const FROM  = "GXYZ5678VICTIM";
const AMOUNT = "500000000";

describe("extractClawback", () => {
  it("returns structured clawback for matching event", () => {
    const event = { topics: ["clawback", ADMIN, FROM], value: AMOUNT };
    const result = extractClawback(event);
    assert.deepStrictEqual(result, {
      type: "clawback",
      admin: ADMIN,
      from: FROM,
      amount: AMOUNT,
    });
  });

  it("returns null for non-clawback events", () => {
    assert.strictEqual(extractClawback({ topics: ["transfer", ADMIN, FROM], value: AMOUNT }), null);
    assert.strictEqual(extractClawback({ topics: ["mint", ADMIN, FROM], value: AMOUNT }), null);
    assert.strictEqual(extractClawback({ topics: ["burn", FROM], value: AMOUNT }), null);
  });
});

describe("extractSep41Event — clawback via dispatcher", () => {
  it("dispatches clawback events correctly", () => {
    const event = { topics: ["clawback", ADMIN, FROM], value: AMOUNT };
    const result = extractSep41Event(event);
    assert.ok(result);
    assert.strictEqual(result.type, "clawback");
    assert.strictEqual(result.from, FROM);
    assert.strictEqual(result.admin, ADMIN);
    assert.strictEqual(result.amount, AMOUNT);
  });

  it("does not match clawback for transfer events", () => {
    const event = { topics: ["transfer", FROM, ADMIN], value: AMOUNT };
    const result = extractSep41Event(event);
    assert.ok(result);
    assert.strictEqual(result.type, "transfer");
  });
});
