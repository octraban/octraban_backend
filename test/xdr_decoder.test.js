import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr, StrKey } from "@stellar/stellar-sdk";
import { decodeContractEvent } from "../src/xdr_decoder.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const CONTRACT_ID_BYTES = Buffer.alloc(32, 0xab);

function makeEvent(type, topics, data, withContractId = true) {
  return new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    contractId: withContractId ? CONTRACT_ID_BYTES : null,
    type,
    body: new xdr.ContractEventBody(
      0,
      new xdr.ContractEventV0({ topics, data })
    ),
  }).toXDR("base64");
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const CONTRACT_XDR = makeEvent(
  xdr.ContractEventType.contract(),
  [xdr.ScVal.scvSymbol("swap"), xdr.ScVal.scvString("USDC")],
  xdr.ScVal.scvI64(xdr.Int64.fromString("1000"))
);

const SYSTEM_XDR = makeEvent(
  xdr.ContractEventType.system(),
  [xdr.ScVal.scvSymbol("system_event")],
  xdr.ScVal.scvVoid(),
  false // system events have no contractId
);

const DIAGNOSTIC_XDR = makeEvent(
  xdr.ContractEventType.diagnostic(),
  [xdr.ScVal.scvSymbol("log")],
  xdr.ScVal.scvString("hello diagnostic")
);

// ── tests ─────────────────────────────────────────────────────────────────────

describe("decodeContractEvent", () => {
  it("decodes a CONTRACT event", () => {
    const result = decodeContractEvent(CONTRACT_XDR);
    assert.equal(result.type, "contract");
    assert.ok(result.contractId, "contractId should be present");
    assert.ok(result.contractId.startsWith("C"), "contractId should be a Stellar contract address");
    assert.deepEqual(result.topics, ["swap", "USDC"]);
    assert.equal(result.value, "1000");
  });

  it("decodes a SYSTEM event (no contractId)", () => {
    const result = decodeContractEvent(SYSTEM_XDR);
    assert.equal(result.type, "system");
    assert.equal(result.contractId, null);
    assert.deepEqual(result.topics, ["system_event"]);
    assert.equal(result.value, null);
  });

  it("decodes a DIAGNOSTIC event", () => {
    const result = decodeContractEvent(DIAGNOSTIC_XDR);
    assert.equal(result.type, "diagnostic");
    assert.ok(result.contractId, "contractId should be present");
    assert.deepEqual(result.topics, ["log"]);
    assert.equal(result.value, "hello diagnostic");
  });

  it("returns all required fields", () => {
    const result = decodeContractEvent(CONTRACT_XDR);
    assert.ok("contractId" in result);
    assert.ok("type" in result);
    assert.ok("topics" in result);
    assert.ok("value" in result);
    assert.ok(Array.isArray(result.topics));
  });

  it("decodes muxed M-address topics to base G-addresses", () => {
    const ed25519 = Buffer.alloc(32, 1);
    const muxed = xdr.MuxedAccount.keyTypeMuxedEd25519(
      new xdr.MuxedAccountMed25519({
        id: xdr.Uint64.fromString("123"),
        ed25519,
      })
    );
    const eventXdr = makeEvent(
      xdr.ContractEventType.contract(),
      [xdr.ScVal.scvSymbol("transfer"), xdr.ScVal.scvAddress(xdr.ScAddress.scAddressTypeAccount(muxed))],
      xdr.ScVal.scvVoid()
    );

    const result = decodeContractEvent(eventXdr);
    assert.deepEqual(result.topics, ["transfer", StrKey.encodeEd25519PublicKey(ed25519)]);
  });

  it("serializes BigInt values as strings", () => {
    const xdrWithI128 = makeEvent(
      xdr.ContractEventType.contract(),
      [xdr.ScVal.scvSymbol("mint")],
      xdr.ScVal.scvI128(
        new xdr.Int128Parts({
          hi: xdr.Int64.fromString("0"),
          lo: xdr.Uint64.fromString("999999999999"),
        })
      )
    );
    const result = decodeContractEvent(xdrWithI128);
    assert.equal(typeof result.value, "string");
    assert.equal(result.value, "999999999999");
  });
});
