import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr, StrKey } from "@stellar/stellar-sdk";
import { parseInvokeContract } from "../src/invoke_parser.js";

const CONTRACT_ID_BYTES = Buffer.alloc(32, 0xcc);
const CONTRACT_ID_STR = StrKey.encodeContract(CONTRACT_ID_BYTES);

function makeInvoke(fnName, args = []) {
  return xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: xdr.ScAddress.scAddressTypeContract(CONTRACT_ID_BYTES),
      functionName: fnName,
      args,
    })
  ).toXDR("base64");
}

describe("parseInvokeContract", () => {
  it("extracts contractId, functionName, and empty args", () => {
    const result = parseInvokeContract(makeInvoke("transfer"));
    assert.equal(result.contractId, CONTRACT_ID_STR);
    assert.equal(result.functionName, "transfer");
    assert.deepEqual(result.args, []);
  });

  it("extracts args correctly", () => {
    const result = parseInvokeContract(
      makeInvoke("swap", [xdr.ScVal.scvU32(42), xdr.ScVal.scvString("USDC")])
    );
    assert.equal(result.functionName, "swap");
    assert.equal(result.args.length, 2);
    assert.equal(result.args[0], 42);
    assert.equal(result.args[1], "USDC");
  });

  it("returns contractId as a C-prefixed Stellar address", () => {
    const result = parseInvokeContract(makeInvoke("mint"));
    assert.ok(result.contractId.startsWith("C"));
  });

  it("throws for non-invoke host functions", () => {
    const uploadXdr = xdr.HostFunction.hostFunctionTypeUploadContractWasm(
      Buffer.from([0x00])
    ).toXDR("base64");
    assert.throws(() => parseInvokeContract(uploadXdr), /hostFunctionTypeInvokeContract/);
  });
});
