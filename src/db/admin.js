import { pool } from "./pool.js";

export async function saveCursor(ledger) {
  await pool.query(
    `INSERT INTO daemon_state (key, value) VALUES ('cursor', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [String(ledger)],
  );
}

export async function loadCursor() {
  const { rows } = await pool.query("SELECT value FROM daemon_state WHERE key = 'cursor'");
  return rows[0] ? Number(rows[0].value) : null;
}

export async function upsertRole({ contract_id, role, address, revoked = false, ledger = null }) {
  await pool.query(
    `INSERT INTO privileged_roles (contract_id, role, address, revoked, ledger, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (contract_id, role, address)
     DO UPDATE SET revoked = $4, ledger = $5, updated_at = NOW()`,
    [contract_id, role, address, revoked, ledger],
  );
}

export async function getRoles(contractId) {
  const { rows } = await pool.query(
    `SELECT role, address, ledger, updated_at
     FROM privileged_roles
     WHERE contract_id = $1 AND revoked = FALSE
     ORDER BY role, updated_at DESC`,
    [contractId],
  );
  return rows;
}

export async function query(sql, params) {
  return pool.query(sql, params);
}

export async function addSourceVerification({ contract_id, wasm_hash, signer, signature, compiler_hash }) {
  await pool.query(
    `INSERT INTO source_verifications (contract_id, wasm_hash, signer, signature, compiler_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (contract_id, wasm_hash, signer) DO UPDATE
       SET signature = $4, compiler_hash = $5, submitted_at = NOW()`,
    [contract_id, wasm_hash, signer, signature, compiler_hash],
  );
}

export async function getSourceVerifications(contract_id, wasm_hash) {
  const params = [contract_id];
  const extra = wasm_hash ? ` AND wasm_hash = $2` : "";
  if (wasm_hash) params.push(wasm_hash);
  const { rows } = await pool.query(
    `SELECT signer, signature, compiler_hash, wasm_hash, submitted_at
     FROM source_verifications
     WHERE contract_id = $1${extra}
     ORDER BY submitted_at ASC`,
    params,
  );
  return rows;
}

export async function insertStateDiffs(diffs) {
  if (!diffs.length) return;
  const values = diffs
    .map((_, i) => {
      const b = i * 8;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
    })
    .join(",");
  const params = diffs.flatMap((d) => [
    d.contract_id,
    d.ledger,
    d.tx_hash,
    d.key,
    d.tier,
    d.old_value ?? null,
    d.new_value ?? null,
    d.change_type,
  ]);
  await pool.query(
    `INSERT INTO storage_state_diffs
       (contract_id, ledger, tx_hash, key, tier, old_value, new_value, change_type)
     VALUES ${values}
     ON CONFLICT DO NOTHING`,
    params,
  );
}

export async function getStateDiffs(contract_id, { key, limit = 200 } = {}) {
  const params = [contract_id];
  const extra = key ? ` AND key = $2` : "";
  if (key) params.push(key);
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT ledger, tx_hash, key, tier, old_value, new_value, change_type, created_at
     FROM storage_state_diffs
     WHERE contract_id = $1${extra}
     ORDER BY ledger ASC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

export async function upsertWasmBuildMetadata({
  wasm_hash,
  contract_id,
  sdk_version,
  compiler,
  optimizer,
  repository,
  commit,
  producers,
  ledger,
  tx_hash,
}) {
  await pool.query(
    `INSERT INTO wasm_build_metadata
       (wasm_hash, contract_id, sdk_version, compiler, optimizer, repository, commit, producers, ledger, tx_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (wasm_hash) DO UPDATE SET
       contract_id = COALESCE(EXCLUDED.contract_id, wasm_build_metadata.contract_id),
       sdk_version = COALESCE(EXCLUDED.sdk_version, wasm_build_metadata.sdk_version),
       compiler    = COALESCE(EXCLUDED.compiler,    wasm_build_metadata.compiler),
       optimizer   = COALESCE(EXCLUDED.optimizer,   wasm_build_metadata.optimizer),
       repository  = COALESCE(EXCLUDED.repository,  wasm_build_metadata.repository),
       commit      = COALESCE(EXCLUDED.commit,      wasm_build_metadata.commit),
       producers   = COALESCE(EXCLUDED.producers,   wasm_build_metadata.producers)`,
    [
      wasm_hash,
      contract_id ?? null,
      sdk_version ?? null,
      compiler ?? null,
      optimizer ?? null,
      repository ?? null,
      commit ?? null,
      producers ? JSON.stringify(producers) : null,
      ledger ?? null,
      tx_hash ?? null,
    ],
  );
}

export async function getWasmBuildMetadata(contract_id) {
  const { rows } = await pool.query(
    `SELECT * FROM wasm_build_metadata WHERE contract_id = $1 ORDER BY ledger DESC LIMIT 1`,
    [contract_id],
  );
  return rows[0] ?? null;
}

export async function upsertSubInvocations(records) {
  if (!records.length) return;
  const values = records
    .map((r, i) => {
      const base = i * 6;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    })
    .join(", ");
  const params = records.flatMap((r) => [
    r.parent_tx_hash,
    r.depth,
    r.contract_id,
    r.function,
    r.args ? JSON.stringify(r.args) : null,
    r.ledger,
  ]);
  await pool.query(
    `INSERT INTO sub_invocations (parent_tx_hash, depth, contract_id, function, args, ledger)
     VALUES ${values} ON CONFLICT DO NOTHING`,
    params,
  );
}

export async function getSubInvocationEdges(limit = 500) {
  const { rows } = await pool.query(
    `SELECT e.contract_id AS caller, s.contract_id AS callee, COUNT(*) AS call_count
     FROM sub_invocations s
     JOIN events e ON e.tx_hash = s.parent_tx_hash
     WHERE e.contract_id <> s.contract_id
     GROUP BY e.contract_id, s.contract_id
     ORDER BY call_count DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    caller: r.caller,
    callee: r.callee,
    call_count: Number(r.call_count),
  }));
}
