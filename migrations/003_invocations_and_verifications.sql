-- Migration 003: Sub-invocations, source verifications, state diffs, quorum freezes

CREATE TABLE IF NOT EXISTS sub_invocations (
  id             BIGSERIAL PRIMARY KEY,
  parent_tx_hash TEXT   NOT NULL,
  depth          INT    NOT NULL DEFAULT 1,
  contract_id    TEXT   NOT NULL,
  function       TEXT   NOT NULL,
  args           JSONB,
  ledger         BIGINT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_inv_parent   ON sub_invocations(parent_tx_hash);
CREATE INDEX IF NOT EXISTS idx_sub_inv_contract ON sub_invocations(contract_id);

CREATE TABLE IF NOT EXISTS source_verifications (
  id            BIGSERIAL PRIMARY KEY,
  contract_id   TEXT NOT NULL,
  wasm_hash     TEXT NOT NULL,
  signer        TEXT NOT NULL,
  signature     TEXT NOT NULL,
  compiler_hash TEXT NOT NULL,
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contract_id, wasm_hash, signer)
);

CREATE INDEX IF NOT EXISTS idx_src_ver_contract ON source_verifications(contract_id);

CREATE TABLE IF NOT EXISTS storage_state_diffs (
  id          BIGSERIAL PRIMARY KEY,
  contract_id TEXT   NOT NULL,
  ledger      BIGINT NOT NULL,
  tx_hash     TEXT,
  key         TEXT   NOT NULL,
  tier        TEXT   NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  change_type TEXT   NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_state_diff_contract_ledger
  ON storage_state_diffs(contract_id, ledger ASC);

CREATE TABLE IF NOT EXISTS quorum_freezes (
  id          BIGSERIAL PRIMARY KEY,
  contract_id TEXT   NOT NULL,
  frozen_ids  JSONB  NOT NULL,
  ledger      BIGINT,
  tx_hash     TEXT,
  is_frozen   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quorum_freezes_contract ON quorum_freezes(contract_id);
