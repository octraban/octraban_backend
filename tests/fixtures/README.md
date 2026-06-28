# Decoder Test Fixtures

This directory contains XDR fixture data for decoder.js unit tests.

## Fixture Sources

All fixtures are captured from Soroban testnet/mainnet and represent real-world event data.

### transfer_event.json
- Source: Testnet SEP-41 token transfer
- Contract: CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA (example SAC)
- Transaction: captured via Soroban RPC `/transactions/{hash}`

### mint_event.json
- Source: Native XLM wrap (mint) on SAC
- Contract: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC (testnet native XLM SAC)
- Transaction: captured from testnet

### burn_event.json
- Source: Native XLM unwrap (burn) on SAC
- Contract: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC (testnet native XLM SAC)
- Transaction: captured from testnet

### nested_vec_map.json
- Source: Complex event with nested Vec/Map structures
- Contract: Various testnet contracts
- Transaction: captured from testnet

## Adding New Fixtures

Capture XDR from Soroban RPC and export as JSON with:
```
{
  "name": "descriptive_name",
  "description": "What this fixture tests",
  "testnet_source": "contract_id or tx hash for reference",
  "xdr": "base64-encoded XDR string"
}
```