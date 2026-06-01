import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr, StrKey } from "@stellar/stellar-sdk";
import { detectEvictions } from "../src/archivalEvictionDetector.js";

// ── fixtures ──────────────────────────────────────────────────────────────────

const CONTRACT_BYTES = Buffer.alloc(32, 0x01);
const CONTRACT_ID    = StrKey.encodeContract(CONTRACT_BYTES);
const WASM_HASH      = Buffer.alloc(32, 0xcd);

function makeContractDataKey(contractBytes, key, durability) {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: xdr.ScAddress.scAddressTypeContract(contractBytes),
      key,
      durability,
    })
  );
}

function makeContractCodeKey(hash) {
  return xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash }));
}

function removedChange(key) {
  return { switch: () => ({ name: "ledgerEntryRemoved" }), removed: () => key };
}

function createdChange(entry) {
  return { switch: () => ({ name: "ledgerEntryCreated" }), created: () => entry };
}

function makeTxMeta(changes) {
  return {
    v3: () => ({
      sorobanMeta: () => ({ changedEntries: () => changes }),
    }),
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("detectEvictions", () => {
  it("returns empty array when txMeta is absent", () => {
    const result = detectEvictions({}, 100, "txhash");
    assert.deepEqual(result, []);
  });

  it("returns empty array when there are no removed changes", () => {
    const ev = { txMeta: makeTxMeta([]) };
    assert.deepEqual(detectEvictions(ev, 100, "txhash"), []);
  });

  it("ignores non-removed change types", () => {
    // createdChange does not have a `removed()` method — should be skipped
    const key = makeContractDataKey(
      CONTRACT_BYTES,
      xdr.ScVal.scvSymbol("balance"),
      xdr.ContractDataDurability.persistent()
    );
    const ev = { txMeta: makeTxMeta([createdChange(key)]) };
    assert.deepEqual(detectEvictions(ev, 100, "txhash"), []);
  });

  it("detects a removed persistent contractData key", () => {
    const key = makeContractDataKey(
      CONTRACT_BYTES,
      xdr.ScVal.scvSymbol("balance"),
      xdr.ContractDataDurability.persistent()
    );
    const ev = { txMeta: makeTxMeta([removedChange(key)]) };
    const result = detectEvictions(ev, 500, "abc123");

    assert.equal(result.length, 1);
    const [e] = result;
    assert.equal(e.key_type, "contractData");
    assert.equal(e.contract_id, CONTRACT_ID);
    assert.equal(e.durability, "persistent");
    assert.equal(e.data_key, "balance");
    assert.equal(e.ledger, 500);
    assert.equal(e.tx_hash, "abc123");
    assert.ok(e.key_label.includes("balance"));
    assert.ok(e.key_label.includes(CONTRACT_ID.slice(0, 8)));
  });

  it("detects a removed temporary contractData key", () => {
    const key = makeContractDataKey(
      CONTRACT_BYTES,
      xdr.ScVal.scvSymbol("nonce"),
      xdr.ContractDataDurability.temporary()
    );
    const ev = { txMeta: makeTxMeta([removedChange(key)]) };
    const [e] = detectEvictions(ev, 600, "tx2");

    assert.equal(e.key_type, "contractData");
    assert.equal(e.durability, "temporary");
    assert.equal(e.data_key, "nonce");
  });

  it("detects a removed contractInstance key", () => {
    const key = makeContractDataKey(
      CONTRACT_BYTES,
      xdr.ScVal.scvLedgerKeyContractInstance(),
      xdr.ContractDataDurability.persistent()
    );
    const ev = { txMeta: makeTxMeta([removedChange(key)]) };
    const [e] = detectEvictions(ev, 700, "tx3");

    assert.equal(e.key_type, "contractInstance");
    assert.equal(e.contract_id, CONTRACT_ID);
    assert.equal(e.durability, "persistent");
    assert.ok(e.key_label.includes("Contract instance"));
  });

  it("detects a removed contractCode key", () => {
    const key = makeContractCodeKey(WASM_HASH);
    const ev = { txMeta: makeTxMeta([removedChange(key)]) };
    const [e] = detectEvictions(ev, 800, "tx4");

    assert.equal(e.key_type, "contractCode");
    assert.equal(e.wasm_hash, WASM_HASH.toString("hex"));
    assert.equal(e.contract_id, undefined);
    assert.ok(e.key_label.includes("WASM code"));
  });

  it("detects multiple evictions in one transaction", () => {
    const dataKey = makeContractDataKey(
      CONTRACT_BYTES,
      xdr.ScVal.scvSymbol("owner"),
      xdr.ContractDataDurability.persistent()
    );
    const codeKey = makeContractCodeKey(WASM_HASH);
    const ev = { txMeta: makeTxMeta([removedChange(dataKey), removedChange(codeKey)]) };
    const result = detectEvictions(ev, 900, "tx5");

    assert.equal(result.length, 2);
    assert.equal(result[0].key_type, "contractData");
    assert.equal(result[1].key_type, "contractCode");
  });

  it("attaches ledger and tx_hash to every eviction record", () => {
    const key = makeContractDataKey(
      CONTRACT_BYTES,
      xdr.ScVal.scvSymbol("x"),
      xdr.ContractDataDurability.persistent()
    );
    const ev = { txMeta: makeTxMeta([removedChange(key)]) };
    const [e] = detectEvictions(ev, 1234, "myhash");

    assert.equal(e.ledger, 1234);
    assert.equal(e.tx_hash, "myhash");
  });

  it("handles undefined txHash gracefully", () => {
    const key = makeContractDataKey(
      CONTRACT_BYTES,
      xdr.ScVal.scvSymbol("y"),
      xdr.ContractDataDurability.persistent()
    );
    const ev = { txMeta: makeTxMeta([removedChange(key)]) };
    const [e] = detectEvictions(ev, 100, undefined);

    assert.equal(e.tx_hash, undefined);
  });
});
