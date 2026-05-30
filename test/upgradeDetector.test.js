import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr } from "@stellar/stellar-sdk";
import { detectUpgrade } from "../src/upgradeDetector.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONTRACT_BYTES = Buffer.alloc(32, 0x01);
const OLD_HASH       = Buffer.alloc(32, 0xaa);
const NEW_HASH       = Buffer.alloc(32, 0xbb);

function makeInstanceEntry(contractBytes, wasmHashBytes) {
  return new xdr.LedgerEntry({
    lastModifiedLedgerSeq: 1,
    ext: new xdr.LedgerEntryExt(0),
    data: xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: new xdr.ExtensionPoint(0),
        contract: xdr.ScAddress.scAddressTypeContract(contractBytes),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
        val: xdr.ScVal.scvContractInstance(
          new xdr.ScContractInstance({
            executable: xdr.ContractExecutable.contractExecutableWasm(wasmHashBytes),
            storage: null,
          })
        ),
      })
    ),
  });
}

/**
 * Build a fake ev.txMeta accessor object with the given state/updated pairs.
 * Each pair is [contractBytes, oldHashBytes, newHashBytes].
 */
function makeTxMeta(pairs) {
  const changes = [];
  for (const [contractBytes, oldHashBytes, newHashBytes] of pairs) {
    changes.push({
      switch: () => ({ name: "ledgerEntryState" }),
      state:  () => makeInstanceEntry(contractBytes, oldHashBytes),
    });
    changes.push({
      switch:   () => ({ name: "ledgerEntryUpdated" }),
      updated:  () => makeInstanceEntry(contractBytes, newHashBytes),
    });
  }
  return {
    v3: () => ({
      sorobanMeta: () => ({ changedEntries: () => changes }),
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("detectUpgrade", () => {
  it("returns null when txMeta is absent", () => {
    assert.equal(detectUpgrade({}), null);
  });

  it("returns null when there are no ledger changes", () => {
    const ev = { txMeta: { v3: () => ({ sorobanMeta: () => ({ changedEntries: () => [] }) }) } };
    assert.equal(detectUpgrade(ev), null);
  });

  it("returns null when the wasm hash is unchanged", () => {
    const ev = { txMeta: makeTxMeta([[CONTRACT_BYTES, OLD_HASH, OLD_HASH]]) };
    assert.equal(detectUpgrade(ev), null);
  });

  it("detects an upgrade and returns correct oldHash and newHash", () => {
    const ev = { txMeta: makeTxMeta([[CONTRACT_BYTES, OLD_HASH, NEW_HASH]]) };
    const result = detectUpgrade(ev);
    assert.deepEqual(result, {
      type:    "upgrade",
      oldHash: OLD_HASH.toString("hex"),
      newHash: NEW_HASH.toString("hex"),
    });
  });

  it("returns null when only a state entry exists (no updated)", () => {
    const changes = [{
      switch: () => ({ name: "ledgerEntryState" }),
      state:  () => makeInstanceEntry(CONTRACT_BYTES, OLD_HASH),
    }];
    const ev = { txMeta: { v3: () => ({ sorobanMeta: () => ({ changedEntries: () => changes }) }) } };
    assert.equal(detectUpgrade(ev), null);
  });

  it("ignores non-contractInstance contractData entries", () => {
    // A regular persistent key (not scvLedgerKeyContractInstance) should be ignored
    const regularEntry = new xdr.LedgerEntry({
      lastModifiedLedgerSeq: 1,
      ext: new xdr.LedgerEntryExt(0),
      data: xdr.LedgerEntryData.contractData(
        new xdr.ContractDataEntry({
          ext: new xdr.ExtensionPoint(0),
          contract: xdr.ScAddress.scAddressTypeContract(CONTRACT_BYTES),
          key: xdr.ScVal.scvSymbol("balance"),
          durability: xdr.ContractDataDurability.persistent(),
          val: xdr.ScVal.scvU32(42),
        })
      ),
    });
    const changes = [
      { switch: () => ({ name: "ledgerEntryState" }),   state:   () => regularEntry },
      { switch: () => ({ name: "ledgerEntryUpdated" }), updated: () => regularEntry },
    ];
    const ev = { txMeta: { v3: () => ({ sorobanMeta: () => ({ changedEntries: () => changes }) }) } };
    assert.equal(detectUpgrade(ev), null);
  });

  it("detects upgrade among mixed ledger changes", () => {
    // Mix: a regular contractData change + an upgrade change
    const regularEntry = new xdr.LedgerEntry({
      lastModifiedLedgerSeq: 1,
      ext: new xdr.LedgerEntryExt(0),
      data: xdr.LedgerEntryData.contractData(
        new xdr.ContractDataEntry({
          ext: new xdr.ExtensionPoint(0),
          contract: xdr.ScAddress.scAddressTypeContract(CONTRACT_BYTES),
          key: xdr.ScVal.scvSymbol("counter"),
          durability: xdr.ContractDataDurability.persistent(),
          val: xdr.ScVal.scvU32(1),
        })
      ),
    });
    const upgradeChanges = makeTxMeta([[CONTRACT_BYTES, OLD_HASH, NEW_HASH]]).v3().sorobanMeta().changedEntries();
    const allChanges = [
      { switch: () => ({ name: "ledgerEntryState" }),   state:   () => regularEntry },
      { switch: () => ({ name: "ledgerEntryUpdated" }), updated: () => regularEntry },
      ...upgradeChanges,
    ];
    const ev = { txMeta: { v3: () => ({ sorobanMeta: () => ({ changedEntries: () => allChanges }) }) } };
    const result = detectUpgrade(ev);
    assert.equal(result?.type, "upgrade");
    assert.equal(result?.oldHash, OLD_HASH.toString("hex"));
    assert.equal(result?.newHash, NEW_HASH.toString("hex"));
  });
});
