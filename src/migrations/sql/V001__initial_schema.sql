-- migration: V001
-- description: Initial DB schema imported from db.js
-- depends: 
-- estimated_duration: 10s
-- rollback: DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS contracts;

CREATE TABLE IF NOT EXISTS contracts (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL,
    registered_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    seq BIGINT NOT NULL,
    contract_id VARCHAR(255) REFERENCES contracts(id),
    function VARCHAR(255) NOT NULL,
    ledger BIGINT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_id);
CREATE INDEX IF NOT EXISTS idx_events_seq ON events(seq);
