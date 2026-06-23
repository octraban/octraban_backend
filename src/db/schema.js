import { pool } from "./pool.js";

export async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      seq              BIGSERIAL PRIMARY KEY,
      contract_id      TEXT NOT NULL,
      function         TEXT NOT NULL,
      ledger           BIGINT NOT NULL,
      tx_hash          TEXT,
      description      TEXT NOT NULL,
      raw_topics       JSONB,
      raw_data         TEXT,
      cpu_instructions BIGINT,
      mem_bytes        BIGINT,
      fee_charged      BIGINT,
      is_high_bloat_risk BOOLEAN NOT NULL DEFAULT FALSE,
      upgrade_info     JSONB,
      storage_tiers    JSONB,
      is_clawback      BOOLEAN NOT NULL DEFAULT FALSE,
      is_resource_limit_exceeded BOOLEAN NOT NULL DEFAULT FALSE,
      zk_host_calls    JSONB,
      archival_info    JSONB,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_id);
    CREATE INDEX IF NOT EXISTS idx_events_function ON events(function);
    CREATE INDEX IF NOT EXISTS idx_events_ledger   ON events(ledger);
    CREATE INDEX IF NOT EXISTS idx_events_tx_hash  ON events(tx_hash);
    CREATE INDEX IF NOT EXISTS idx_events_topic0
      ON events USING btree ((raw_topics->0));
    CREATE INDEX IF NOT EXISTS idx_events_contract_ledger
      ON events(contract_id, ledger DESC);

    CREATE TABLE IF NOT EXISTS contracts (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      functions   JSONB,
      registered_by TEXT,
      has_circuit_breaker BOOLEAN DEFAULT FALSE,
      is_paused   BOOLEAN DEFAULT FALSE,
      pause_status_ledger BIGINT,
      is_rwa      BOOLEAN DEFAULT FALSE,
      rwa_type    TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ledger_hashes (
      ledger     BIGINT PRIMARY KEY,
      hash       TEXT   NOT NULL,
      indexed_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS daemon_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    ALTER TABLE events ADD COLUMN IF NOT EXISTS is_high_bloat_risk BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS upgrade_info JSONB;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS storage_tiers JSONB;
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_files JSONB;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS footprint_contention BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS is_resource_limit_exceeded BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS ttl_extension JSONB;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS fee_bump JSONB;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS factory_deployment JSONB;

    CREATE TABLE IF NOT EXISTS sub_invocations (
      id              BIGSERIAL PRIMARY KEY,
      parent_tx_hash  TEXT NOT NULL,
      depth           INT  NOT NULL DEFAULT 1,
      contract_id     TEXT NOT NULL,
      function        TEXT NOT NULL,
      args            JSONB,
      ledger          BIGINT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sub_inv_parent   ON sub_invocations(parent_tx_hash);
    CREATE INDEX IF NOT EXISTS idx_sub_inv_contract ON sub_invocations(contract_id);

    CREATE TABLE IF NOT EXISTS source_verifications (
      id           BIGSERIAL PRIMARY KEY,
      contract_id  TEXT NOT NULL,
      wasm_hash    TEXT NOT NULL,
      signer       TEXT NOT NULL,
      signature    TEXT NOT NULL,
      compiler_hash TEXT NOT NULL,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (contract_id, wasm_hash, signer)
    );
    CREATE INDEX IF NOT EXISTS idx_src_ver_contract ON source_verifications(contract_id);

    CREATE TABLE IF NOT EXISTS storage_state_diffs (
      id          BIGSERIAL PRIMARY KEY,
      contract_id TEXT NOT NULL,
      ledger      BIGINT NOT NULL,
      tx_hash     TEXT,
      key         TEXT NOT NULL,
      tier        TEXT NOT NULL,
      old_value   TEXT,
      new_value   TEXT,
      change_type TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_state_diff_contract_ledger
      ON storage_state_diffs(contract_id, ledger ASC);

    CREATE TABLE IF NOT EXISTS quorum_freezes (
      id          BIGSERIAL PRIMARY KEY,
      contract_id TEXT NOT NULL,
      frozen_ids  JSONB NOT NULL,
      ledger      BIGINT,
      tx_hash     TEXT,
      is_frozen   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_quorum_freezes_contract
      ON quorum_freezes(contract_id);

    CREATE TABLE IF NOT EXISTS vaults (
      contract_id     TEXT PRIMARY KEY,
      name            TEXT,
      underlying_asset TEXT,
      decimals        INT DEFAULT 7,
      active          BOOLEAN DEFAULT TRUE,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vault_snapshots (
      id            BIGSERIAL PRIMARY KEY,
      contract_id   TEXT NOT NULL REFERENCES vaults(contract_id),
      ledger        BIGINT NOT NULL,
      total_assets  TEXT NOT NULL,
      total_supply  TEXT NOT NULL,
      ratio         TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vault_snapshots_contract
      ON vault_snapshots(contract_id, ledger DESC);

    CREATE TABLE IF NOT EXISTS token_holders (
      id            BIGSERIAL PRIMARY KEY,
      contract_id   TEXT NOT NULL,
      address       TEXT NOT NULL,
      balance_raw   TEXT NOT NULL DEFAULT '0',
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (contract_id, address)
    );
    CREATE INDEX IF NOT EXISTS idx_token_holders_contract
      ON token_holders(contract_id);

    CREATE TABLE IF NOT EXISTS privileged_roles (
      id            BIGSERIAL PRIMARY KEY,
      contract_id   TEXT NOT NULL,
      role          TEXT NOT NULL,
      address       TEXT NOT NULL,
      revoked       BOOLEAN NOT NULL DEFAULT FALSE,
      ledger        BIGINT,
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (contract_id, role, address)
    );
    CREATE INDEX IF NOT EXISTS idx_privileged_roles_contract
      ON privileged_roles(contract_id);

    CREATE TABLE IF NOT EXISTS wasm_build_metadata (
      wasm_hash     TEXT PRIMARY KEY,
      contract_id   TEXT,
      sdk_version   TEXT,
      compiler      TEXT,
      optimizer     TEXT,
      repository    TEXT,
      commit        TEXT,
      producers     JSONB,
      ledger        BIGINT,
      tx_hash       TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_wasm_build_contract
      ON wasm_build_metadata(contract_id);
  `);
}
