import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr, StrKey } from "@stellar/stellar-sdk";
import { decodeContractData } from "../src/contract_data_decoder.js";

const CONTRACT_ID_BYTES = Buffer.alloc(32, 0xaa);

function makeContractDataEntry(key, val) {
  return new xdr.ContractDataEntry({
    ext: new xdr.ExtensionPoint(0),
    contract: xdr.ScAddress.scAddressTypeContract(CONTRACT_ID_BYTES),
    key,
    durability: xdr.ContractDataDurability.persistent(),
    val,
  }).toXDR("base64");
}

describe("decodeContractData", () => {
  it("decodes a simple symbol key and u32 value", () => {
    const result = decodeContractData(
      makeContractDataEntry(xdr.ScVal.scvSymbol("balance"), xdr.ScVal.scvU32(1000))
    );
    assert.equal(result.key, "balance");
    assert.equal(result.value, 1000);
  });

  it("decodes a map key and string value", () => {
    const mapKey = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("owner"), val: xdr.ScVal.scvString("GABC") }),
    ]);
    const result = decodeContractData(makeContractDataEntry(mapKey, xdr.ScVal.scvString("active")));
    assert.deepEqual(result.key, { owner: "GABC" });
    assert.equal(result.value, "active");
  });

  it("decodes a vec key and bool value", () => {
    const vecKey = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("slot"), xdr.ScVal.scvU32(3)]);
    const result = decodeContractData(makeContractDataEntry(vecKey, xdr.ScVal.scvBool(true)));
    assert.deepEqual(result.key, ["slot", 3]);
    assert.equal(result.value, true);
  });

  it("decodes an address value", () => {
    const result = decodeContractData(
      makeContractDataEntry(
        xdr.ScVal.scvSymbol("admin"),
        xdr.ScVal.scvAddress(xdr.ScAddress.scAddressTypeContract(CONTRACT_ID_BYTES))
      )
    );
    assert.equal(result.key, "admin");
    assert.equal(result.value, StrKey.encodeContract(CONTRACT_ID_BYTES));
  });

  it("returns both key and value fields", () => {
    const result = decodeContractData(
      makeContractDataEntry(xdr.ScVal.scvSymbol("x"), xdr.ScVal.scvVoid())
    );
    assert.ok("key" in result);
    assert.ok("value" in result);
  });
});
