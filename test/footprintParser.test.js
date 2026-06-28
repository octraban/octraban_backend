import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr } from "@stellar/stellar-sdk";
import { parseFootprint } from "../src/footprintParser.js";

// ── helpers ───────────────────────────────────────────────────────────────────

const CONTRACT_BYTES = Buffer.alloc(32, 0xab);
const WASM_HASH      = Buffer.alloc(32, 0xcd);
const ACCOUNT_BYTES  = Buffer.alloc(32, 0x01);

function contractAddr(bytes = CONTRACT_BYTES) {
  return new xdr.ScAddress("scAddressTypeContract", bytes);
}

function makeFootprint(readOnly, readWrite) {
  return new xdr.LedgerFootprint({ readOnly, readWrite }).toXDR("base64");
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const instanceKey = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
  contract: contractAddr(),
  key: xdr.ScVal.scvLedgerKeyContractInstance(),
  durability: xdr.ContractDataDurability.persistent(),
}));

const dataKey = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
  contract: contractAddr(),
  key: xdr.ScVal.scvSymbol("balance"),
  durability: xdr.ContractDataDurability.persistent(),
}));

const codeKey = xdr.LedgerKey.contractCode(
  new xdr.LedgerKeyContractCode({ hash: WASM_HASH })
);

const accountKey = xdr.LedgerKey.account(
  new xdr.LedgerKeyAccount({
    accountId: xdr.AccountId.publicKeyTypeEd25519(ACCOUNT_BYTES),
  })
);

// ── tests ─────────────────────────────────────────────────────────────────────

describe("parseFootprint", () => {
  it("returns zero counts for empty footprint", () => {
    const result = parseFootprint(makeFootprint([], []));
    assert.equal(result.reads.count, 0);
    assert.equal(result.writes.count, 0);
    assert.deepEqual(result.reads.keys, []);
    assert.deepEqual(result.writes.keys, []);
  });

  it("classifies contractInstance key", () => {
    const result = parseFootprint(makeFootprint([instanceKey], []));
    const [key] = result.reads.keys;
    assert.equal(key.type, "contractInstance");
    assert.ok(key.contractId.startsWith("C"));
    assert.equal(key.durability, "persistent");
  });

  it("classifies contractData key with dataKey field", () => {
    const result = parseFootprint(makeFootprint([dataKey], []));
    const [key] = result.reads.keys;
    assert.equal(key.type, "contractData");
    assert.equal(key.dataKey, "balance");
    assert.ok(key.contractId.startsWith("C"));
  });

  it("classifies contractCode key with wasmHash", () => {
    const result = parseFootprint(makeFootprint([codeKey], []));
    const [key] = result.reads.keys;
    assert.equal(key.type, "contractCode");
    assert.equal(key.wasmHash, WASM_HASH.toString("hex"));
  });

  it("classifies account key", () => {
    const result = parseFootprint(makeFootprint([accountKey], []));
    const [key] = result.reads.keys;
    assert.equal(key.type, "account");
    assert.ok(key.accountId.startsWith("G"));
  });

  it("separates reads and writes correctly", () => {
    const fp = makeFootprint([instanceKey, codeKey], [dataKey]);
    const result = parseFootprint(fp);
    assert.equal(result.reads.count, 2);
    assert.equal(result.writes.count, 1);
    assert.equal(result.reads.keys[0].type, "contractInstance");
    assert.equal(result.reads.keys[1].type, "contractCode");
    assert.equal(result.writes.keys[0].type, "contractData");
  });

  it("returns correct counts in result shape", () => {
    const fp = makeFootprint([instanceKey, codeKey, accountKey], [dataKey]);
    const result = parseFootprint(fp);
    assert.equal(result.reads.count, result.reads.keys.length);
    assert.equal(result.writes.count, result.writes.keys.length);
  });
});
