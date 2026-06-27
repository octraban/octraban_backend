-- Migration 002: Core schema — events, contracts, ledger_hashes, daemon_state

CREATE TABLE IF NOT EXISTS events (
  seq                        BIGSERIAL PRIMARY KEY,
  contract_id                TEXT NOT NULL,
  function                   TEXT NOT NULL,
  ledger                     BIGINT NOT NULL,
  tx_hash                    TEXT,
  description                TEXT NOT NULL,
  raw_topics                 JSONB,
  raw_data                   TEXT,
  cpu_instructions           BIGINT,
  mem_bytes                  BIGINT,
  fee_charged                BIGINT,
  is_high_bloat_risk         BOOLEAN NOT NULL DEFAULT FALSE,
  upgrade_info               JSONB,
  storage_tiers              JSONB,
  is_clawback                BOOLEAN NOT NULL DEFAULT FALSE,
  is_resource_limit_exceeded BOOLEAN NOT NULL DEFAULT FALSE,
  footprint_contention       BOOLEAN NOT NULL DEFAULT FALSE,
  ttl_extension              JSONB,
  fee_bump                   JSONB,
  factory_deployment         JSONB,
  zk_host_calls              JSONB,
  archival_info              JSONB,
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_contract        ON events(contract_id);
CREATE INDEX IF NOT EXISTS idx_events_function        ON events(function);
CREATE INDEX IF NOT EXISTS idx_events_ledger          ON events(ledger);
CREATE INDEX IF NOT EXISTS idx_events_tx_hash         ON events(tx_hash);
CREATE INDEX IF NOT EXISTS idx_events_topic0          ON events USING btree ((raw_topics->0));
CREATE INDEX IF NOT EXISTS idx_events_contract_ledger ON events(contract_id, ledger DESC);
CREATE INDEX IF NOT EXISTS idx_events_search_fts
  ON events USING GIN (
    to_tsvector('simple',
      coalesce(description, '') || ' ' ||
      coalesce(function, '')    || ' ' ||
      coalesce(contract_id, '') || ' ' ||
      coalesce(raw_topics::text, '') || ' ' ||
      coalesce(raw_data, '')
    )
  );

CREATE TABLE IF NOT EXISTS contracts (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  functions           JSONB,
  registered_by       TEXT,
  source_files        JSONB,
  has_circuit_breaker BOOLEAN DEFAULT FALSE,
  is_paused           BOOLEAN DEFAULT FALSE,
  pause_status_ledger BIGINT,
  is_rwa              BOOLEAN DEFAULT FALSE,
  rwa_type            TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_search_fts
  ON contracts USING GIN (
    to_tsvector('simple',
      coalesce(name, '')            || ' ' ||
      coalesce(description, '')     || ' ' ||
      coalesce(id, '')              || ' ' ||
      coalesce(functions::text, '')
    )
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
