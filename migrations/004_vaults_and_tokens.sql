-- Migration 004: Vaults, token holders, privileged roles, WASM build metadata

CREATE TABLE IF NOT EXISTS vaults (
  contract_id      TEXT PRIMARY KEY,
  name             TEXT,
  underlying_asset TEXT,
  decimals         INT DEFAULT 7,
  active           BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_snapshots (
  id           BIGSERIAL PRIMARY KEY,
  contract_id  TEXT   NOT NULL REFERENCES vaults(contract_id),
  ledger       BIGINT NOT NULL,
  total_assets TEXT   NOT NULL,
  total_supply TEXT   NOT NULL,
  ratio        TEXT   NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_snapshots_contract
  ON vault_snapshots(contract_id, ledger DESC);

CREATE TABLE IF NOT EXISTS token_holders (
  id          BIGSERIAL PRIMARY KEY,
  contract_id TEXT NOT NULL,
  address     TEXT NOT NULL,
  balance_raw TEXT NOT NULL DEFAULT '0',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contract_id, address)
);

CREATE INDEX IF NOT EXISTS idx_token_holders_contract ON token_holders(contract_id);

CREATE TABLE IF NOT EXISTS privileged_roles (
  id          BIGSERIAL PRIMARY KEY,
  contract_id TEXT    NOT NULL,
  role        TEXT    NOT NULL,
  address     TEXT    NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  ledger      BIGINT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contract_id, role, address)
);

CREATE INDEX IF NOT EXISTS idx_privileged_roles_contract ON privileged_roles(contract_id);

CREATE TABLE IF NOT EXISTS wasm_build_metadata (
  wasm_hash   TEXT PRIMARY KEY,
  contract_id TEXT,
  sdk_version TEXT,
  compiler    TEXT,
  optimizer   TEXT,
  repository  TEXT,
  commit      TEXT,
  producers   JSONB,
  ledger      BIGINT,
  tx_hash     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wasm_build_contract ON wasm_build_metadata(contract_id);
