import { pool } from "./pool.js";

export async function registerVault(vault) {
  await pool.query(
    `INSERT INTO vaults (contract_id, name, underlying_asset, decimals)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (contract_id) DO UPDATE
       SET name=$2, underlying_asset=$3, decimals=$4, updated_at=NOW()`,
    [vault.contract_id, vault.name ?? null, vault.underlying_asset ?? null, vault.decimals ?? 7],
  );
}

export async function unregisterVault(contractId) {
  await pool.query("DELETE FROM vaults WHERE contract_id = $1", [contractId]);
}

export async function getVaults() {
  const { rows } = await pool.query(
    `SELECT v.*,
      (SELECT ratio FROM vault_snapshots WHERE contract_id = v.contract_id ORDER BY ledger DESC LIMIT 1) AS latest_ratio,
      (SELECT ledger FROM vault_snapshots WHERE contract_id = v.contract_id ORDER BY ledger DESC LIMIT 1) AS latest_ledger
     FROM vaults v WHERE v.active = TRUE ORDER BY v.created_at DESC`,
  );
  return rows;
}

export async function getVault(contractId) {
  const { rows } = await pool.query(
    `SELECT v.*,
      (SELECT ratio FROM vault_snapshots WHERE contract_id = v.contract_id ORDER BY ledger DESC LIMIT 1) AS latest_ratio,
      (SELECT ledger FROM vault_snapshots WHERE contract_id = v.contract_id ORDER BY ledger DESC LIMIT 1) AS latest_ledger
     FROM vaults v WHERE v.contract_id = $1`,
    [contractId],
  );
  return rows[0] ?? null;
}

export async function getActiveVaultIds() {
  const { rows } = await pool.query("SELECT contract_id FROM vaults WHERE active = TRUE");
  return rows.map((r) => r.contract_id);
}

export async function upsertVaultSnapshot(snapshot) {
  await pool.query(
    `INSERT INTO vault_snapshots (contract_id, ledger, total_assets, total_supply, ratio)
     VALUES ($1,$2,$3,$4,$5)`,
    [snapshot.contract_id, snapshot.ledger, snapshot.total_assets, snapshot.total_supply, snapshot.ratio],
  );
}

export async function getVaultHistory(contractId, { limit = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM vault_snapshots
     WHERE contract_id = $1
     ORDER BY ledger DESC LIMIT $2`,
    [contractId, limit],
  );
  return rows;
}

export async function getTokenHolders(contractId) {
  const { rows } = await pool.query(
    `SELECT address, balance_raw FROM token_holders
     WHERE contract_id = $1
     ORDER BY balance_raw::NUMERIC DESC`,
    [contractId],
  );
  return rows;
}

export async function applyTransfer(contractId, from, to, amount) {
  const client = pool;
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO token_holders (contract_id, address, balance_raw)
       VALUES ($1, $2, $3)
       ON CONFLICT (contract_id, address)
       DO UPDATE SET balance_raw = (COALESCE(NULLIF(token_holders.balance_raw, ''), '0')::NUMERIC - $3::NUMERIC)::TEXT`,
      [contractId, from, amount],
    );
    await client.query(
      `INSERT INTO token_holders (contract_id, address, balance_raw)
       VALUES ($1, $2, $3)
       ON CONFLICT (contract_id, address)
       DO UPDATE SET balance_raw = (COALESCE(NULLIF(token_holders.balance_raw, ''), '0')::NUMERIC + $3::NUMERIC)::TEXT`,
      [contractId, to, amount],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function applyMint(contractId, to, amount) {
  await pool.query(
    `INSERT INTO token_holders (contract_id, address, balance_raw)
     VALUES ($1, $2, $3)
     ON CONFLICT (contract_id, address)
     DO UPDATE SET balance_raw = (COALESCE(NULLIF(token_holders.balance_raw, ''), '0')::NUMERIC + $3::NUMERIC)::TEXT`,
    [contractId, to, amount],
  );
}

export async function applyBurn(contractId, from, amount) {
  await pool.query(
    `INSERT INTO token_holders (contract_id, address, balance_raw)
     VALUES ($1, $2, $3)
     ON CONFLICT (contract_id, address)
     DO UPDATE SET balance_raw = (COALESCE(NULLIF(token_holders.balance_raw, ''), '0')::NUMERIC - $3::NUMERIC)::TEXT`,
    [contractId, from, amount],
  );
}
