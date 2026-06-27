import { pool } from "./pool.js";

export async function getMaxLedger() {
  const { rows } = await pool.query("SELECT COALESCE(MAX(ledger), 0) AS max_ledger FROM events");
  return Number(rows[0].max_ledger);
}

export async function getEventsCursor({ contract, fn, type, after_seq = 0, limit = 25 } = {}) {
  const conditions = [];
  const params = [];

  if (contract) {
    params.push(contract);
    conditions.push(`contract_id = $${params.length}`);
  }
  if (fn) {
    params.push(fn);
    conditions.push(`function = $${params.length}`);
  }
  if (type === "soroban") {
    conditions.push(`contract_id IS NOT NULL AND contract_id <> ''`);
  }
  if (type === "classic") {
    conditions.push(`(contract_id IS NULL OR contract_id = '')`);
  }

  if (after_seq > 0) {
    params.push(after_seq);
    conditions.push(`seq < $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit + 1);

  const { rows } = await pool.query(`SELECT * FROM events ${where} ORDER BY seq DESC LIMIT $${params.length}`, params);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const next_cursor = hasMore ? data[data.length - 1].seq : null;

  return { data, next_cursor };
}

export async function upsertEvent(ev) {
  await pool.query(
    `INSERT INTO events
       (contract_id, function, ledger, tx_hash, description, raw_topics, raw_data,
        cpu_instructions, mem_bytes, fee_charged, is_high_bloat_risk, upgrade_info, storage_tiers, is_clawback,
        footprint_contention, ttl_extension, fee_bump, archival_info, zk_host_calls)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT DO NOTHING`,
    [
      ev.contract_id,
      ev.function,
      ev.ledger,
      ev.tx_hash,
      ev.description,
      JSON.stringify(ev.raw_topics),
      ev.raw_data,
      ev.cpu_instructions ?? null,
      ev.mem_bytes ?? null,
      ev.fee_charged ?? null,
      ev.is_high_bloat_risk ?? false,
      ev.upgrade ? JSON.stringify(ev.upgrade) : null,
      ev.storage_tiers ? JSON.stringify(ev.storage_tiers) : null,
      ev.is_clawback ?? false,
      ev.footprint_contention ?? false,
      ev.ttl_extension ? JSON.stringify(ev.ttl_extension) : null,
      ev.fee_bump ? JSON.stringify(ev.fee_bump) : null,
      ev.archival_info ? JSON.stringify(ev.archival_info) : null,
      ev.zk_host_calls ? JSON.stringify(ev.zk_host_calls) : null,
    ],
  );
}

export async function getEvents({ contract, fn, page = 1, limit = 25, type } = {}) {
  const conditions = [];
  const params = [];
  if (contract) {
    params.push(contract);
    conditions.push(`contract_id = $${params.length}`);
  }
  if (fn) {
    params.push(fn);
    conditions.push(`function = $${params.length}`);
  }
  if (type === "soroban") {
    conditions.push(`contract_id IS NOT NULL AND contract_id <> ''`);
  }
  if (type === "classic") {
    conditions.push(`(contract_id IS NULL OR contract_id = '')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * limit;
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM events ${where} ORDER BY ledger DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

export async function getEvent(seq) {
  const { rows } = await pool.query("SELECT * FROM events WHERE seq = $1", [seq]);
  return rows[0] ?? null;
}

export async function getWalletEvents(address) {
  const { rows } = await pool.query(
    `SELECT * FROM events WHERE raw_topics::text ILIKE $1 ORDER BY ledger DESC LIMIT 100`,
    [`%${address}%`],
  );
  return rows;
}

export async function getContractTransactions(
  contractId,
  { function_name, start_ledger, end_ledger, page = 1, limit = 25 } = {},
) {
  const params = [contractId];
  const conditions = ["contract_id = $1"];

  if (function_name) {
    params.push(function_name);
    conditions.push(`function = $${params.length}`);
  }
  if (start_ledger) {
    params.push(start_ledger);
    conditions.push(`ledger >= $${params.length}`);
  }
  if (end_ledger) {
    params.push(end_ledger);
    conditions.push(`ledger <= $${params.length}`);
  }

  const where = conditions.join(" AND ");
  const offset = (page - 1) * limit;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT * FROM events WHERE ${where} ORDER BY ledger DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::INT AS total FROM events WHERE ${where}`, params),
  ]);

  const total = countRows[0].total;
  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      has_next: page * limit < total,
    },
  };
}

export async function get24hVolume(contractId, decimals = 7) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM((raw_data::jsonb->>'amount')::NUMERIC), 0)::TEXT AS volume_raw
     FROM events
     WHERE contract_id = $1
       AND function    = 'transfer'
       AND created_at >= NOW() - INTERVAL '24 hours'`,
    [contractId],
  );
  const raw = rows[0].volume_raw ?? "0";
  const rawBig = BigInt(raw.split(".")[0]);
  const divisor = 10n ** BigInt(decimals);
  const whole = rawBig / divisor;
  const fraction = rawBig % divisor;
  const volume_scaled = `${whole}.${fraction.toString().padStart(decimals, "0")}`;
  return { volume_raw: raw, volume_scaled, decimals };
}

export async function getUpgradeHistory(contractId) {
  const { rows } = await pool.query(
    `SELECT seq, ledger, tx_hash, upgrade_info, created_at
     FROM events
     WHERE contract_id = $1 AND upgrade_info IS NOT NULL
     ORDER BY ledger ASC`,
    [contractId],
  );
  return rows;
}

export async function getEventsForExport({ contract, fn, type, limit = 10000 } = {}) {
  const conditions = [];
  const params = [];
  if (contract) {
    params.push(contract);
    conditions.push(`contract_id = $${params.length}`);
  }
  if (fn) {
    params.push(fn);
    conditions.push(`function = $${params.length}`);
  }
  if (type === "soroban") {
    conditions.push(`contract_id IS NOT NULL AND contract_id <> ''`);
  }
  if (type === "classic") {
    conditions.push(`(contract_id IS NULL OR contract_id = '')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(Math.min(limit, 10000));
  const { rows } = await pool.query(
    `SELECT seq, contract_id, function, ledger, tx_hash, description,
            cpu_instructions, mem_bytes, fee_charged, is_clawback, is_high_bloat_risk
     FROM events ${where} ORDER BY seq DESC LIMIT $${params.length}`,
    params,
  );
  return rows;
}
