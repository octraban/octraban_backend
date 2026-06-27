import { pool } from "./pool.js";

export async function getContractMeta(id) {
  const { rows } = await pool.query("SELECT * FROM contracts WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function upsertContractMeta(meta) {
  await pool.query(
    `INSERT INTO contracts (id, name, description, functions, registered_by, source_files, has_circuit_breaker, is_rwa, rwa_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET name=$2, description=$3, functions=$4, source_files=$6, has_circuit_breaker=$7, is_rwa=$8, rwa_type=$9`,
    [
      meta.id,
      meta.name,
      meta.description,
      JSON.stringify(meta.functions),
      meta.registered_by,
      meta.source_files ? JSON.stringify(meta.source_files) : null,
      meta.has_circuit_breaker ?? false,
      meta.is_rwa ?? false,
      meta.rwa_type ?? null,
    ],
  );
}

export async function getContractsForExport() {
  const { rows } = await pool.query(
    `SELECT id, name, description, registered_by, has_circuit_breaker, is_paused, is_rwa, rwa_type, created_at
     FROM contracts ORDER BY created_at DESC`,
  );
  return rows;
}

export async function updateCircuitBreakerStatus(contractId, isPaused, ledger) {
  await pool.query(`UPDATE contracts SET is_paused = $1, pause_status_ledger = $2 WHERE id = $3`, [
    isPaused,
    ledger,
    contractId,
  ]);
}

export async function getCircuitBreakerStatus(contractId) {
  const { rows } = await pool.query(
    `SELECT has_circuit_breaker, is_paused, pause_status_ledger FROM contracts WHERE id = $1`,
    [contractId],
  );
  return (
    rows[0] ?? {
      has_circuit_breaker: false,
      is_paused: false,
      pause_status_ledger: null,
    }
  );
}

export async function getMigrationStatus(contractId) {
  const { rows } = await pool.query(
    `SELECT
       MAX(CASE WHEN upgrade_info IS NOT NULL THEN ledger END) AS last_upgrade_ledger,
       MAX(CASE WHEN function = 'migrate' THEN ledger END)     AS last_migrate_ledger
     FROM events WHERE contract_id = $1`,
    [contractId],
  );
  const { last_upgrade_ledger, last_migrate_ledger } = rows[0];
  const pending =
    last_upgrade_ledger != null &&
    (last_migrate_ledger == null || Number(last_upgrade_ledger) > Number(last_migrate_ledger));
  return {
    pending,
    upgradedAtLedger: last_upgrade_ledger ? Number(last_upgrade_ledger) : null,
    migratedAtLedger: last_migrate_ledger ? Number(last_migrate_ledger) : null,
  };
}
