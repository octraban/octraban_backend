import pg from "pg";
import { getLogger } from "./logger.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function logQuery(sql, params) {
  getLogger().info({ component: "db", query: sql, params }, "executing query");
}

export const db = {
  async init() {
    const sql = `
      CREATE TABLE IF NOT EXISTS events (
        seq         BIGSERIAL PRIMARY KEY,
        contract_id TEXT NOT NULL,
        function    TEXT NOT NULL,
        ledger      BIGINT NOT NULL,
        tx_hash     TEXT,
        description TEXT NOT NULL,
        raw_topics  JSONB,
        raw_data    TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_id);
      CREATE INDEX IF NOT EXISTS idx_events_function ON events(function);
      CREATE INDEX IF NOT EXISTS idx_events_ledger   ON events(ledger);

      CREATE TABLE IF NOT EXISTS contracts (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        functions   JSONB,
        registered_by TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    logQuery("init schema", []);
    await pool.query(sql);
  },

  async upsertEvent(ev) {
    const sql = `INSERT INTO events (contract_id, function, ledger, tx_hash, description, raw_topics, raw_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING`;
    logQuery(sql, [ev.contract_id, ev.function, ev.ledger, ev.tx_hash, ev.description, ev.raw_topics, ev.raw_data]);
    await pool.query(sql, [ev.contract_id, ev.function, ev.ledger, ev.tx_hash,
      ev.description, JSON.stringify(ev.raw_topics), ev.raw_data]);
  },

  async getEvents({ contract, fn, page = 1, limit = 25 } = {}) {
    const conditions = [];
    const params = [];
    if (contract) { params.push(contract); conditions.push(`contract_id = $${params.length}`); }
    if (fn)       { params.push(fn);       conditions.push(`function = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const sql = `SELECT * FROM events ${where} ORDER BY ledger DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    logQuery(sql, params);
    const { rows } = await pool.query(sql, params);
    return rows;
  },

  async getEvent(seq) {
    const sql = "SELECT * FROM events WHERE seq = $1";
    logQuery(sql, [seq]);
    const { rows } = await pool.query(sql, [seq]);
    return rows[0] ?? null;
  },

  async getWalletEvents(address) {
    const sql = `SELECT * FROM events WHERE description ILIKE $1 OR raw_topics::text ILIKE $1 ORDER BY ledger DESC LIMIT 100`;
    logQuery(sql, [`%${address}%`]);
    const { rows } = await pool.query(sql, [`%${address}%`]);
    return rows;
  },

  async getContractMeta(id) {
    const sql = "SELECT * FROM contracts WHERE id = $1";
    logQuery(sql, [id]);
    const { rows } = await pool.query(sql, [id]);
    return rows[0] ?? null;
  },

  async upsertContractMeta(meta) {
    const sql = `INSERT INTO contracts (id, name, description, functions, registered_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name=$2, description=$3, functions=$4`;
    logQuery(sql, [meta.id, meta.name, meta.description, meta.functions, meta.registered_by]);
    await pool.query(sql, [meta.id, meta.name, meta.description, JSON.stringify(meta.functions), meta.registered_by]);
  },
};
