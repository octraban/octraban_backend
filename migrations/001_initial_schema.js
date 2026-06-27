exports.up = async (pgm) => {
  pgm.createTable('events', {
    id: { type: 'bigserial', primaryKey: true },
    contract_id: { type: 'varchar(56)', notNull: true },
    function: { type: 'varchar(256)', notNull: true },
    ledger: { type: 'bigint', notNull: true },
    tx_hash: { type: 'varchar(64)', notNull: true },
    caller_address: { type: 'varchar(56)' },
    decoded_value: { type: 'jsonb' },
    raw_value: { type: 'bytea' },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
  });

  pgm.createTable('contracts', {
    id: { type: 'varchar(56)', primaryKey: true },
    name: { type: 'varchar(256)' },
    abi_metadata: { type: 'jsonb' },
    registered_at: { type: 'timestamp', default: pgm.func('now()') },
  });

  pgm.createIndex('events', 'contract_id');
  pgm.createIndex('events', 'ledger');
};

exports.down = async (pgm) => {
  pgm.dropTable('events');
  pgm.dropTable('contracts');
};
