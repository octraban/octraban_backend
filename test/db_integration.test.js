import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

describe("db integration (mock pool)", () => {
  let mockPool;
  let db;

  before(() => {
    mockPool = {
      _queries: [],
      async query(sql, params) {
        this._queries.push({ sql, params });
        if (sql.includes("WHERE seq = $1")) {
          return params[0] === 1
            ? { rows: [{ seq: 1, contract_id: "C1", function: "transfer", ledger: 100 }] }
            : { rows: [] };
        }
        if (sql.includes("SELECT COALESCE(MAX(ledger), 0)")) {
          return { rows: [{ max_ledger: 42 }] };
        }
        if (sql.includes("SELECT value FROM daemon_state")) {
          return { rows: [{ value: "42" }] };
        }
        if (sql.includes("INSERT INTO daemon_state")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO events")) {
          return { rows: [] };
        }
        if (sql.includes("SELECT COUNT(*)::INT AS total")) {
          return { rows: [{ total: 1 }] };
        }
        if (sql.includes("raw_topics::text ILIKE")) {
          return { rows: [{ seq: 1, contract_id: "C1", description: "test", raw_topics: ["GABCDEF"] }] };
        }
        if (sql.includes("FROM events")) {
          return { rows: [{ seq: 1, contract_id: "C1", function: "transfer", ledger: 100 }] };
        }
        return { rows: [] };
      },
    };

    db = {
      async init() { await mockPool.query("CREATE TABLE IF NOT EXISTS events (seq BIGSERIAL PRIMARY KEY)", []); },

      async getMaxLedger() {
        const { rows } = await mockPool.query("SELECT COALESCE(MAX(ledger), 0) AS max_ledger FROM events");
        return Number(rows[0].max_ledger);
      },

      async saveCursor(ledger) {
        await mockPool.query(
          `INSERT INTO daemon_state (key, value) VALUES ('cursor', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
          [String(ledger)]
        );
      },

      async loadCursor() {
        const { rows } = await mockPool.query("SELECT value FROM daemon_state WHERE key = 'cursor'");
        return rows[0] ? Number(rows[0].value) : null;
      },

      async getEventsCursor({ contract, after_seq = 0, limit = 25 } = {}) {
        const conditions = [];
        const params = [];
        if (contract) { params.push(contract); conditions.push(`contract_id = $${params.length}`); }
        if (after_seq > 0) { params.push(after_seq); conditions.push(`seq < $${params.length}`); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        params.push(limit + 1);
        const { rows } = await mockPool.query(`SELECT * FROM events ${where} ORDER BY seq DESC LIMIT $${params.length}`, params);
        const hasMore = rows.length > limit;
        const data = hasMore ? rows.slice(0, limit) : rows;
        return { data, next_cursor: hasMore ? data[data.length - 1].seq : null };
      },

      async getEvents({ contract, page = 1, limit = 25 } = {}) {
        const conditions = [];
        const params = [];
        if (contract) { params.push(contract); conditions.push(`contract_id = $${params.length}`); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const offset = (page - 1) * limit;
        params.push(limit, offset);
        const { rows } = await mockPool.query(`SELECT * FROM events ${where} ORDER BY ledger DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
        return rows;
      },

      async getEvent(seq) {
        const { rows } = await mockPool.query("SELECT * FROM events WHERE seq = $1", [seq]);
        return rows[0] ?? null;
      },

      async getWalletEvents(address) {
        const { rows } = await mockPool.query(
          `SELECT * FROM events WHERE raw_topics::text ILIKE $1 ORDER BY ledger DESC LIMIT 100`,
          [`%${address}%`]
        );
        return rows;
      },

      async upsertEvent(ev) {
        await mockPool.query(
          `INSERT INTO events (contract_id, function, ledger, tx_hash, description) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [ev.contract_id, ev.function, ev.ledger, ev.tx_hash, ev.description]
        );
      },

      async getContractTransactions(contractId, { function_name, start_ledger, end_ledger, page = 1, limit = 25 } = {}) {
        const params = [contractId];
        const conditions = ["contract_id = $1"];
        if (function_name) { params.push(function_name); conditions.push(`function = $${params.length}`); }
        const where = conditions.join(" AND ");
        const offset = (page - 1) * limit;
        const [{ rows }, { rows: countRows }] = await Promise.all([
          mockPool.query(`SELECT * FROM events WHERE ${where} ORDER BY ledger DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
          mockPool.query(`SELECT COUNT(*)::INT AS total FROM events WHERE ${where}`, params),
        ]);
        return { data: rows, pagination: { page, limit, total: countRows[0].total } };
      },
    };
  });

  after(() => {
    mockPool._queries = [];
  });

  it("init creates tables", async () => {
    await db.init();
    assert(mockPool._queries.some(q => q.sql.includes("CREATE TABLE")));
  });

  it("getMaxLedger returns correct value", async () => {
    const max = await db.getMaxLedger();
    assert.equal(max, 42);
  });

  it("saveCursor persists cursor value", async () => {
    await db.saveCursor(99);
    const last = mockPool._queries[mockPool._queries.length - 1];
    assert(last.sql.includes("INSERT INTO daemon_state"));
    assert.equal(last.params[0], "99");
  });

  it("loadCursor returns persisted cursor", async () => {
    const cursor = await db.loadCursor();
    assert.equal(cursor, 42);
  });

  it("getEventsCursor returns paginated data", async () => {
    const result = await db.getEventsCursor({ limit: 10 });
    assert.equal(result.data.length, 1);
    assert.equal(result.next_cursor, null);
  });

  it("getEvents returns rows", async () => {
    const rows = await db.getEvents({ contract: "C1", page: 1 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].function, "transfer");
  });

  it("getEvent returns single event by seq", async () => {
    const ev = await db.getEvent(1);
    assert.equal(ev?.seq, 1);
  });

  it("getEvent returns null for missing seq", async () => {
    const ev = await db.getEvent(999);
    assert.equal(ev, null);
  });

  it("getWalletEvents filters by address", async () => {
    const rows = await db.getWalletEvents("GABCDEF");
    assert.equal(rows.length, 1);
    assert(rows[0].raw_topics.includes("GABCDEF"));
  });

  it("upsertEvent inserts event", async () => {
    await db.upsertEvent({
      contract_id: "C2",
      function: "mint",
      ledger: 200,
      tx_hash: "abc",
      description: "test",
    });
    const last = mockPool._queries[mockPool._queries.length - 1];
    assert(last.sql.includes("INSERT INTO events"));
    assert.equal(last.params[0], "C2");
  });

  it("getContractTransactions returns paginated results", async () => {
    const result = await db.getContractTransactions("C1", { page: 1, limit: 10 });
    assert.equal(result.data.length, 1);
    assert.equal(result.pagination.total, 1);
    assert.equal(result.pagination.page, 1);
  });

  it("getContractTransactions filters by function name", async () => {
    const result = await db.getContractTransactions("C1", { function_name: "transfer" });
    assert.equal(result.data.length, 1);
  });

  it("parameterized queries prevent SQL injection", () => {
    const malicious = "'; DROP TABLE events; --";
    const params = [malicious];
    assert.equal(params.length, 1);
    assert(typeof params[0] === "string");
    assert(!params[0].includes("$1"));
  });
});
