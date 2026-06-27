-- Migration 005: API authentication, rate limiting keys, usage tracking, and audit logging

-- ── API Keys ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  key_hash          TEXT        NOT NULL,
  key_prefix        CHAR(8)     NOT NULL,
  tier              TEXT        NOT NULL DEFAULT 'free'
                                CHECK (tier IN ('unauthenticated','free','pro','enterprise')),
  rate_limit        INTEGER,                    -- per-key override, nullable
  allowed_ips       JSONB,                      -- CIDR array, nullable
  allowed_endpoints JSONB,                      -- endpoint pattern array, nullable
  expires_at        TIMESTAMPTZ,
  revoked           BOOLEAN     NOT NULL DEFAULT FALSE,
  last_used_at      TIMESTAMPTZ,
  usage_count       BIGINT      NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_tier   ON api_keys (tier);

-- ── Daily Usage Aggregates ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_key_usage_daily (
  id                    BIGSERIAL   PRIMARY KEY,
  api_key_id            UUID        NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  date                  DATE        NOT NULL,
  total_requests        BIGINT      NOT NULL DEFAULT 0,
  endpoint_distribution JSONB,
  data_transfer_mb      NUMERIC(12,3) NOT NULL DEFAULT 0,
  rate_limit_hits       BIGINT      NOT NULL DEFAULT 0,
  peak_concurrent       INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (api_key_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_key_date
  ON api_key_usage_daily (api_key_id, date DESC);

-- ── Audit Log (monthly partitioned) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_audit_log (
  id                   BIGSERIAL,
  timestamp            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  api_key_id           UUID,
  key_name             TEXT,
  tier                 TEXT        NOT NULL,
  ip                   INET        NOT NULL,
  method               TEXT        NOT NULL,
  endpoint             TEXT        NOT NULL,
  status_code          SMALLINT    NOT NULL,
  response_time_ms     INTEGER     NOT NULL,
  rate_limit_remaining INTEGER,
  user_agent           TEXT,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
  ON api_audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_api_key_id
  ON api_audit_log (api_key_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_ip
  ON api_audit_log (ip);
CREATE INDEX IF NOT EXISTS idx_audit_log_status_code
  ON api_audit_log (status_code);
CREATE INDEX IF NOT EXISTS idx_audit_log_endpoint
  ON api_audit_log (endpoint);

-- ── Initial monthly partitions: 2025-01 through 2026-06 ──────────────────────

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m01
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m02
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m03
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m04
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m05
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m06
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m07
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m08
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m09
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m10
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m11
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2025m12
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2026m01
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2026m02
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2026m03
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2026m04
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2026m05
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS api_audit_log_y2026m06
  PARTITION OF api_audit_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
