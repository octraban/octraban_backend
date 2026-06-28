import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr, StrKey } from "@stellar/stellar-sdk";
import { classifyStorageWrites } from "../src/storageTierClassifier.js";

const CONTRACT_BYTES = Buffer.alloc(32, 0x01);
const CONTRACT_ID    = StrKey.encodeContract(CONTRACT_BYTES);

function makeContractDataEntry(contractBytes, key, durability, val = xdr.ScVal.scvU32(1)) {
  return new xdr.LedgerEntry({
    lastModifiedLedgerSeq: 1,
    ext: new xdr.LedgerEntryExt(0),
    data: xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: new xdr.ExtensionPoint(0),
        contract: xdr.ScAddress.scAddressTypeContract(contractBytes),
        key,
        durability,
        val,
      })
    ),
  });
}

function makeTxMeta(changes) {
  return {
    v3: () => ({
      sorobanMeta: () => ({ changedEntries: () => changes }),
    }),
  };
}

function createdChange(entry) {
  return { switch: () => ({ name: "ledgerEntryCreated" }), created: () => entry };
}
function updatedChange(entry) {
  return { switch: () => ({ name: "ledgerEntryUpdated" }), updated: () => entry };
}
function stateChange(entry) {
  return { switch: () => ({ name: "ledgerEntryState" }), state: () => entry };
}

describe("classifyStorageWrites", () => {
  it("returns empty tiers when txMeta is absent", () => {
    const r = classifyStorageWrites({});
    assert.deepEqual(r, { instance: [], persistent: [], temporary: [] });
  });

  it("classifies a created persistent key as persistent tier", () => {
    const entry = makeContractDataEntry(
      CONTRACT_BYTES,
      xdr.ScVal.scvSymbol("balance"),
      xdr.ContractDataDurability.persistent()
    );
    const ev = { txMeta: makeTxMeta([createdChange(entry)]) };
    const r = classifyStorageWrites(ev);
    assert.equal(r.persistent.length, 1);
    assert.equal(r.persistent[0].contractId, CONTRACT_ID);
    assert.equal(r.persistent[0].key, "balance");
    assert.equal(r.persistent[0].changeType, "created");
    assert.equal(r.instance.length, 0);
    assert.equal(r.temporary.length, 0);
  });

  it("classifies a temporary key as temporary tier", () => {
    const entry = makeContractDataEntry(
      CONTRACT_BYTES,
      xdr.ScVal.scvSymbol("nonce"),
      xdr.ContractDataDurability.temporary()
    );
    const ev = { txMeta: makeTxMeta([createdChange(entry)]) };
    const r = classifyStorageWrites(ev);
    assert.equal(r.temporary.length, 1);
    assert.equal(r.temporary[0].tier, "temporary");
    assert.equal(r.temporary[0].changeType, "created");
  });

  it("classifies scvLedgerKeyContractInstance as instance tier", () => {
    const entry = makeContractDataEntry(
      CONTRACT_BYTES,
      xdr.ScVal.scvLedgerKeyContractInstance(),
      xdr.ContractDataDurability.persistent()
    );
    const ev = { txMeta: makeTxMeta([updatedChange(entry)]) };
    const r = classifyStorageWrites(ev);
    assert.equal(r.instance.length, 1);
    assert.equal(r.instance[0].key, "ContractInstance");
    assert.equal(r.instance[0].changeType, "updated");
  });

  it("ignores state-only changes (not created or updated)", () => {
    const entry = makeContractDataEntry(
      CONTRACT_BYTES,
      xdr.ScVal.scvSymbol("x"),
      xdr.ContractDataDurability.persistent()
    );
    const ev = { txMeta: makeTxMeta([stateChange(entry)]) };
    const r = classifyStorageWrites(ev);
    assert.deepEqual(r, { instance: [], persistent: [], temporary: [] });
  });

  it("handles mixed changes across all three tiers", () => {
    const changes = [
      createdChange(makeContractDataEntry(CONTRACT_BYTES, xdr.ScVal.scvLedgerKeyContractInstance(), xdr.ContractDataDurability.persistent())),
      createdChange(makeContractDataEntry(CONTRACT_BYTES, xdr.ScVal.scvSymbol("owner"),            xdr.ContractDataDurability.persistent())),
      createdChange(makeContractDataEntry(CONTRACT_BYTES, xdr.ScVal.scvSymbol("session"),          xdr.ContractDataDurability.temporary())),
    ];
    const ev = { txMeta: makeTxMeta(changes) };
    const r = classifyStorageWrites(ev);
    assert.equal(r.instance.length, 1);
    assert.equal(r.persistent.length, 1);
    assert.equal(r.temporary.length, 1);
  });
});
