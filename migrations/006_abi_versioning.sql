-- Migration 006: Add ABI versioning fields and version history table

ALTER TABLE contracts
ADD COLUMN abi_version INT NOT NULL DEFAULT 0,
ADD COLUMN min_ledger BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS contract_versions (
  id            SERIAL PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  abi_version   INT NOT NULL,
  min_ledger    BIGINT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  functions     JSONB,
  registered_by TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_versions_contract_abi
  ON contract_versions(contract_id, abi_version);

CREATE INDEX IF NOT EXISTS idx_contract_versions_contract_ledger
  ON contract_versions(contract_id, min_ledger);
