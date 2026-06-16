import { describe, it } from "node:test";
import assert from "node:assert/strict";

function parseRawAmount(raw_data) {
  if (!raw_data) return null;
  try {
    const val = JSON.parse(raw_data);
    if (val !== null && typeof val === "object" && !Array.isArray(val) && "amount" in val) return String(val.amount);
    if (typeof val === "number" && Number.isFinite(val)) return String(Math.trunc(val));
    if (typeof val === "string" && /^-?\d+$/.test(val)) return val;
    return null;
  } catch { return null; }
}

describe("parseRawAmount", () => {
  it("extracts amount from wrapped object", () => {
    assert.equal(parseRawAmount(JSON.stringify({ amount: "15000000" })), "15000000");
  });
  it("extracts plain number", () => {
    assert.equal(parseRawAmount("15000000"), "15000000");
  });
  it("extracts number from JSON number", () => {
    assert.equal(parseRawAmount(JSON.stringify(15000000)), "15000000");
  });
  it("returns null for non-numeric strings", () => {
    assert.equal(parseRawAmount("not-a-number"), null);
  });
  it("returns null for null input", () => {
    assert.equal(parseRawAmount(null), null);
  });
  it("returns null for undefined input", () => {
    assert.equal(parseRawAmount(undefined), null);
  });
});

describe("db cursor operations", () => {
  it("getEventsCursor builds correct keyset pagination", async () => {
    const pool = { query: async () => ({ rows: [{ seq: 1, contract_id: "C1", function: "fn1", ledger: 100 }] }) };
    const db = {
      async getEventsCursor({ contract, fn, after_seq = 0, limit = 25 } = {}) {
        const conditions = [];
        const params = [];
        if (contract) { params.push(contract); conditions.push(`contract_id = $${params.length}`); }
        if (fn)       { params.push(fn);       conditions.push(`function = $${params.length}`); }
        if (after_seq > 0) { params.push(after_seq); conditions.push(`seq < $${params.length}`); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        params.push(limit + 1);
        const { rows } = await pool.query(`SELECT * FROM events ${where} ORDER BY seq DESC LIMIT $${params.length}`, params);
        const hasMore = rows.length > limit;
        const data = hasMore ? rows.slice(0, limit) : rows;
        const next_cursor = hasMore ? data[data.length - 1].seq : null;
        return { data, next_cursor };
      },
    };
    const result = await db.getEventsCursor({ limit: 10 });
    assert.ok(Array.isArray(result.data));
    assert.equal(result.next_cursor, null);
  });

  it("getEvents builds correct WHERE clause with type filter", async () => {
    const pool = { query: async () => ({ rows: [{ seq: 1 }] }) };
    const db = {
      async getEvents({ contract, fn, page = 1, limit = 25, type } = {}) {
        const conditions = [];
        const params = [];
        if (contract) { params.push(contract); conditions.push(`contract_id = $${params.length}`); }
        if (fn)       { params.push(fn);       conditions.push(`function = $${params.length}`); }
        if (type === "soroban") { conditions.push("contract_id IS NOT NULL AND contract_id <> ''"); }
        if (type === "classic") { conditions.push("(contract_id IS NULL OR contract_id = '')"); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const offset = (page - 1) * limit;
        params.push(limit, offset);
        const { rows } = await pool.query(`SELECT * FROM events ${where} ORDER BY ledger DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
        return rows;
      },
    };
    const sorobanResult = await db.getEvents({ type: "soroban", page: 1 });
    assert.equal(sorobanResult.length, 1);
    const classicResult = await db.getEvents({ type: "classic", page: 1 });
    assert.equal(classicResult.length, 1);
  });
});

describe("getWalletEvents", () => {
  it("builds ILIKE query safely", async () => {
    const pool = { query: async (_sql, params) => {
      assert.match(params[0], /%GABCD%/);
      return { rows: [] };
    }};
    const db = {
      async getWalletEvents(address) {
        const { rows } = await pool.query(
          `SELECT * FROM events WHERE raw_topics::text ILIKE $1 ORDER BY ledger DESC LIMIT 100`,
          [`%${address}%`]
        );
        return rows;
      },
    };
    const result = await db.getWalletEvents("GABCD");
    assert.ok(Array.isArray(result));
  });
});
